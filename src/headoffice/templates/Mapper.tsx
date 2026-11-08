import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName, number } from "../../components/ui";
import { BoxSpacing, type BoxSpacingApi } from "./BoxSpacing";
import { type PageEditorApi, PicturePanel } from "./PicturePanel";
import {
  ACTIONS,
  ACTIONS_FOR_SLOT,
  allFields,
  type Binding,
  type BindingAction,
  type Definition,
  EVIDENCE_KINDS,
  FIELD_TYPES_FOR_ACTION,
  type FieldDef,
  type FieldType,
  fieldKey,
  IMAGE_ROLES,
  SLOT_KINDS,
  type Slot,
  TYPE_LABELS,
} from "./model";

export interface PlaceOp {
  op: "move" | "create" | "remove";
  anchor?: string;
  /** What a new point is: a value, an attestation statement, or a checkbox. */
  kind?: NewKind;
  part: string;
  paragraph: number;
  offset: number;
  /** A statement made from selected text: where the selection ends in the same paragraph. */
  end?: number;
}
interface DropTarget {
  part: string;
  paragraph: number;
  offset: number;
  rect: DOMRect;
  ok: boolean;
}
/** Values, statements and single checkboxes can move; pictures, lists and table rows stay put. */
const MOVABLE = ["cell", "inline", "statement", "checkbox"];

type NewKind = "text" | "statement" | "checkbox";
const NEW_POINTS: { kind: NewKind; label: string; icon: IconName }[] = [
  { kind: "text", label: "نقطة جديدة", icon: "plus" },
  { kind: "statement", label: "عبارة إقرار", icon: "file" },
  { kind: "checkbox", label: "مربع اختيار", icon: "check" },
];

/**
 * What changed between two versions of a line, as separate replacements (offsets in the old
 * line), so the words between two changes keep their own formatting.
 */
function changesBetween(before: string, after: string): { offset: number; end: number; text: string }[] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let tail = 0;
  while (tail < before.length - start && tail < after.length - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1;
  const a = before.slice(start, before.length - tail);
  const b = after.slice(start, after.length - tail);
  const whole = [{ offset: start, end: before.length - tail, text: b }];
  if (!a.length || !b.length || a.length * b.length > 250_000) return whole;
  // Longest common subsequence, then the runs of characters outside it.
  const n = a.length;
  const m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const out: { offset: number; end: number; text: string }[] = [];
  let current: { offset: number; end: number; text: string } | null = null;
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      if (current) out.push(current);
      current = null;
      i += 1;
      j += 1;
    } else if (j < m && (i >= n || table[i]![j + 1]! >= table[i + 1]![j]!)) {
      current ??= { offset: start + i, end: start + i, text: "" };
      current.text += b[j];
      j += 1;
    } else {
      current ??= { offset: start + i, end: start + i, text: "" };
      current.end = start + i + 1;
      i += 1;
    }
  }
  if (current) out.push(current);
  return out.length && out.length <= 40 ? out : whole;
}

type SlotState = "bound" | "unbound" | "sample" | "cleared" | "statement" | "case";

function stateOf(slot: Slot, binding: Binding | undefined): SlotState {
  if (!binding) return slot.sample || (slot.kind === "image" && slot.image?.role === "unknown" && slot.image.md5) ? "sample" : "unbound";
  if (binding.action === "clear") return "cleared";
  if (binding.action === "statement") return "statement";
  if (binding.source?.startsWith("case.") || binding.source === "approval.stamp") return "case";
  return "bound";
}

const STATE_LABELS: Record<SlotState, string> = {
  bound: "مربوط بحقل",
  case: "من بيانات الحالة",
  statement: "عبارة بدليل",
  cleared: "يُحذف",
  unbound: "بلا ربط",
  sample: "بيانات قديمة",
};

export function Mapper({
  html,
  slots,
  definition,
  bindings,
  caseSources,
  readOnly,
  onBindings,
  onDefinition,
  onPlace,
  lockedReason,
  boxes,
  editor,
  stamp = "",
}: {
  html: string;
  slots: Slot[];
  definition: Definition;
  bindings: Binding[];
  caseSources: Record<string, string>;
  readOnly: boolean;
  onBindings: (bindings: Binding[]) => void;
  onDefinition: (definition: Definition) => void;
  /** Moves, adds or removes a point in the layout; resolves with the point's anchor. */
  onPlace?: (place: PlaceOp) => Promise<string | null>;
  /** Why points cannot move in this version (it is under review or approved). */
  lockedReason?: string;
  /** Spacing of drawn checkboxes and their printed preview. */
  boxes?: BoxSpacingApi;
  /** Word-like editing of the client's page (text, font size, pictures) and undo. */
  editor?: PageEditorApi;
  /** Changes whenever the version was saved. */
  stamp?: string;
}) {
  const paper = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState<{ top: number; left: number; height: number; ok: boolean } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null);
  const drag = useRef<{
    kind: "new" | "move" | "picture";
    /** The picture being dragged to another spot (page editing). */
    picture?: string;
    anchor?: string;
    newKind?: NewKind;
    startX: number;
    startY: number;
    active: boolean;
    label: string;
    /** Text selected on the page when «عبارة إقرار» was pressed. */
    selection?: { part: string; paragraph: number; offset: number; end: number } | null;
  } | null>(null);
  const justDragged = useRef(false);
  // A press on a point that cannot move: explain why as soon as the user tries to drag it.
  const blocked = useRef<{ x: number; y: number; reason: string } | null>(null);
  const [hint, setHint] = useState("");
  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(""), 7000);
    return () => window.clearTimeout(timer);
  }, [hint]);
  const [placing, setPlacing] = useState(false);
  const [strip, setStrip] = useState<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // «ربط الحقول» binds places; «تحرير التصميم» edits the page itself, like Word.
  const [mode, setMode] = useState<"map" | "edit">("map");
  const editing = mode === "edit" && Boolean(editor) && !readOnly;
  const [picture, setPicture] = useState<string | null>(null);
  const [tool, setTool] = useState<{
    sel: { part: string; paragraph: number; offset: number; end: number };
    top: number;
    left: number;
    size: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
  } | null>(null);
  const [line, setLine] = useState<{
    part: string;
    paragraph: number;
    original: string;
    text: string;
    top: number;
    left: number;
    width: number;
    height: number;
    fontSize: string;
  } | null>(null);
  const lineDone = useRef(false);
  const [working, setWorking] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<SlotState | "all">("all");
  const byAnchor = useMemo(() => new Map(bindings.map((binding) => [binding.anchor, binding])), [bindings]);
  const fields = useMemo(() => new Map(allFields(definition).map((field) => [field.key, field])), [definition]);
  const slotMap = useMemo(() => new Map(slots.map((slot) => [slot.anchor, slot])), [slots]);

  // Rows share one binding per row; the inspector edits the group from its first row.
  const groupAnchor = (anchor: string) => slots.find((slot) => slot.rows?.anchors.includes(anchor))?.anchor ?? anchor;

  const labelFor = (binding: Binding | undefined) => {
    if (!binding) return "";
    if (binding.action === "clear") return "حذف";
    if (binding.source === "approval.stamp") return "ختم بعد الاعتماد";
    if (binding.source?.startsWith("case.")) return caseSources[binding.source] ?? binding.source;
    const field = fields.get(binding.source?.slice(8) ?? "");
    if (!field) return "؟";
    return binding.action === "check" ? `${field.label} = ${binding.option}` : field.label;
  };

  // Decorate the server-rendered page: state colours, labels and the selection.
  useEffect(() => {
    const root = paper.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>("[data-anchor]").forEach((element) => {
      const anchor = element.dataset.anchor!;
      const slot = slotMap.get(anchor);
      const binding = byAnchor.get(anchor);
      const state = slot ? stateOf(slot, binding) : "unbound";
      element.dataset.state = state;
      element.dataset.label = labelFor(binding).slice(0, 38);
      element.dataset.kind = slot?.kind ?? "";
      element.classList.toggle("selected", groupAnchor(anchor) === selected || anchor === selected);
      element.classList.toggle("dim", filter !== "all" && state !== filter);
      element.title = `${SLOT_KINDS[slot?.kind ?? "cell"]} · ${slot?.label ?? ""} — ${STATE_LABELS[state]}`;
      const movable = !readOnly && Boolean(onPlace) && slot !== undefined && MOVABLE.includes(slot.kind);
      element.classList.toggle("movable", movable);
    });
    root.querySelectorAll<HTMLElement>("[data-img]").forEach((element) => element.classList.toggle("picked", editing && element.dataset.img === picture));
  });

  /** Where a drop lands: the paragraph and the character offset, read from the page. */
  const dropTarget = (x: number, y: number): DropTarget | null => {
    const root = paper.current;
    if (!root) return null;
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    let node: Node | null = null;
    let offset = 0;
    const position = doc.caretPositionFromPoint?.(x, y);
    if (position) {
      node = position.offsetNode;
      offset = position.offset;
    } else {
      const range = doc.caretRangeFromPoint?.(x, y);
      if (range) {
        node = range.startContainer;
        offset = range.startOffset;
      }
    }
    const element = node instanceof Text ? node.parentElement : (node as Element | null);
    const hit = document.elementFromPoint(x, y);
    const paragraph = element?.closest<HTMLElement>("[data-p]") ?? hit?.closest<HTMLElement>("[data-p]") ?? null;
    if (!paragraph || !root.contains(paragraph)) return null;
    // Inside another place's highlighted text the value would be overwritten with it.
    const inside = element?.closest(".slot:not(.slot-point)");
    let at = Number(paragraph.dataset.len ?? 0);
    const span = element?.closest<HTMLElement>("[data-o]");
    if (span && node instanceof Text && paragraph.contains(span)) {
      let before = 0;
      const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
      for (let current = walker.nextNode(); current && current !== node; current = walker.nextNode()) before += current.textContent?.length ?? 0;
      at = Number(span.dataset.o) + before + offset;
    } else if (!(paragraph.textContent ?? "").replace(/[\u200b◂]/g, "").trim()) at = 0;
    let rect: DOMRect | null = null;
    if (node instanceof Text) {
      const range = document.createRange();
      range.setStart(node, Math.min(offset, node.length));
      range.collapse(true);
      rect = range.getBoundingClientRect();
    }
    if (!rect || (!rect.height && !rect.width)) rect = paragraph.getBoundingClientRect();
    const [part, index] = (paragraph.dataset.p ?? "").split("|");
    return { part: part!, paragraph: Number(index), offset: Math.max(0, at), rect, ok: !inside };
  };

  /** A spot in the page's text as the paragraph and the character offset the server uses. */
  const pointOf = (node: Node, offset: number): { paragraph: HTMLElement; at: number } | null => {
    // A selection edge on an element: move it to the nearest text.
    if (!(node instanceof Text)) {
      const element = node as Element;
      const after = element.childNodes[offset];
      if (after) {
        const walker = document.createTreeWalker(after, NodeFilter.SHOW_TEXT);
        const first = after instanceof Text ? after : (walker.nextNode() as Text | null);
        if (first) return pointOf(first, 0);
      }
      const before = element.childNodes[offset - 1];
      if (before) {
        const walker = document.createTreeWalker(before, NodeFilter.SHOW_TEXT);
        let last: Text | null = before instanceof Text ? before : null;
        for (let current = walker.nextNode(); current; current = walker.nextNode()) last = current as Text;
        if (last) return pointOf(last, last.length);
      }
      const paragraph = element.closest<HTMLElement>("[data-p]");
      return paragraph ? { paragraph, at: offset === 0 ? 0 : Number(paragraph.dataset.len ?? 0) } : null;
    }
    const paragraph = node.parentElement?.closest<HTMLElement>("[data-p]");
    const span = node.parentElement?.closest<HTMLElement>("[data-o]");
    if (!paragraph || !span || !paragraph.contains(span)) return null;
    let before = 0;
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
    for (let current = walker.nextNode(); current && current !== node; current = walker.nextNode()) before += current.textContent?.length ?? 0;
    return { paragraph, at: Number(span.dataset.o) + before + offset };
  };

  /** The text selected on the page, when it lies inside one paragraph. */
  const selectedText = (): { part: string; paragraph: number; offset: number; end: number } | "none" | "split" => {
    const selection = window.getSelection();
    const root = paper.current;
    if (!selection || selection.isCollapsed || !selection.rangeCount || !root) return "none";
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return "none";
    if (!range.toString().trim()) return "none";
    const start = pointOf(range.startContainer, range.startOffset);
    let end = pointOf(range.endContainer, range.endOffset);
    // A triple-click ends the selection at the start of the next paragraph.
    if (start && end && end.paragraph !== start.paragraph && end.at === 0 && range.endContainer !== start.paragraph) {
      end = { paragraph: start.paragraph, at: Number(start.paragraph.dataset.len ?? 0) };
    }
    if (!start || !end || start.paragraph !== end.paragraph || end.at <= start.at) return "split";
    const [part, index] = (start.paragraph.dataset.p ?? "").split("|");
    return { part: part!, paragraph: Number(index), offset: start.at, end: end.at };
  };

  const fromSelection = async (selection: { part: string; paragraph: number; offset: number; end: number }) => {
    if (!onPlace) return;
    setPlacing(true);
    const anchor = await onPlace({ op: "create", kind: "statement", ...selection });
    setPlacing(false);
    window.getSelection()?.removeAllRanges();
    if (anchor) setSelected(anchor);
  };

  const showCaret = (target: DropTarget | null) => {
    const box = stage.current?.getBoundingClientRect();
    if (!target || !box) {
      setCaret(null);
      return;
    }
    setCaret({
      top: target.rect.top - box.top,
      left: target.rect.left - box.left,
      height: Math.max(14, Math.min(target.rect.height || 18, 26)),
      ok: target.ok,
    });
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(null);
    setCaret(null);
    setGhost(null);
  };

  const drop = async (x: number, y: number, current: NonNullable<typeof drag.current>) => {
    const target = dropTarget(x, y);
    endDrag();
    if (!target?.ok || (current.kind !== "picture" && !onPlace)) return;
    const where = { part: target.part, paragraph: target.paragraph, offset: target.offset };
    if (current.kind === "picture" && current.picture && editor) {
      setPlacing(true);
      const done = await editor.edit({ op: "picture.move", picture: current.picture, ...where });
      setPlacing(false);
      if (done) setPicture(null);
      return;
    }
    if (!onPlace) return;
    setPlacing(true);
    const anchor =
      current.kind === "move" && current.anchor
        ? await onPlace({ op: "move", anchor: current.anchor, ...where })
        : await onPlace({ op: "create", kind: current.newKind ?? "text", ...where });
    setPlacing(false);
    if (anchor) setSelected(anchor);
  };

  // Pointer dragging works with a mouse, a pen and a finger alike.
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const stopped = blocked.current;
      if (stopped && Math.hypot(event.clientX - stopped.x, event.clientY - stopped.y) >= 8) {
        setHint(stopped.reason);
        blocked.current = null;
      }
      const current = drag.current;
      if (!current) return;
      if (!current.active) {
        if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 5) return;
        current.active = true;
        setDragging(current.anchor ?? "new");
      }
      event.preventDefault();
      setGhost({ x: event.clientX, y: event.clientY, label: current.label });
      showCaret(dropTarget(event.clientX, event.clientY));
    };
    const up = (event: PointerEvent) => {
      blocked.current = null;
      const current = drag.current;
      if (!current) return;
      if (current.active) {
        justDragged.current = true;
        window.setTimeout(() => (justDragged.current = false), 0);
        void drop(event.clientX, event.clientY, current);
      } else {
        endDrag();
        // A press on «عبارة إقرار» without dragging: the selected sentence becomes the statement.
        if (current.newKind === "statement") {
          if (current.selection) void fromSelection(current.selection);
          else setHint("حدّد الجملة في الصفحة بالفأرة ثم اضغط «عبارة إقرار» لتصبح عبارة إقرار، أو اسحب «عبارة إقرار» إلى مكان فارغ لإضافة عبارة جديدة.");
        }
      }
    };
    const cancel = () => endDrag();
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  });

  const startMove = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    if (mode === "edit") {
      const image = (event.target as HTMLElement).closest<HTMLElement>("[data-img]");
      if (!image || !editing) return;
      event.preventDefault();
      drag.current = { kind: "picture", picture: image.dataset.img!, startX: event.clientX, startY: event.clientY, active: false, label: "صورة" };
      return;
    }
    const pressed = (event.target as HTMLElement).closest<HTMLElement>("[data-anchor]");
    if (!pressed) return;
    if (readOnly || !onPlace) {
      blocked.current = { x: event.clientX, y: event.clientY, reason: lockedReason ?? "هذا الإصدار مقفل ولا يمكن تحريك نقاطه." };
      return;
    }
    const element = pressed.classList.contains("movable") ? pressed : null;
    if (!element) {
      const kind = slotMap.get(pressed.dataset.anchor!)?.kind ?? "cell";
      blocked.current = {
        x: event.clientX,
        y: event.clientY,
        reason: `هذه النقطة (${SLOT_KINDS[kind]}) جزء من رسم نموذج العميل ولا تُنقل. غيّر ربطها من اللوحة الجانبية، أو اسحب نقطة جديدة من الشريط إلى المكان الذي تريده.`,
      };
      return;
    }
    const slot = slotMap.get(element.dataset.anchor!);
    drag.current = {
      kind: "move",
      anchor: element.dataset.anchor!,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      label: labelFor(byAnchor.get(element.dataset.anchor!)) || slot?.label || "نقطة",
    };
  };
  const startNew = (newKind: NewKind, label: string) => (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    // Read the selection now, before the press can clear it.
    let selection: { part: string; paragraph: number; offset: number; end: number } | null = null;
    if (newKind === "statement") {
      const found = selectedText();
      if (found === "split") {
        setHint("حدّد جملة داخل فقرة واحدة فقط، ثم اضغط «عبارة إقرار».");
        return;
      }
      if (found !== "none") selection = found;
    }
    drag.current = { kind: "new", newKind, startX: event.clientX, startY: event.clientY, active: false, label, selection };
  };

  const onClick = (event: React.MouseEvent) => {
    if (justDragged.current) return;
    if (mode === "edit") {
      const image = (event.target as HTMLElement).closest<HTMLElement>("[data-img]");
      setPicture(image ? image.dataset.img! : null);
      return;
    }
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-anchor]");
    if (target) setSelected(groupAnchor(target.dataset.anchor!));
  };

  // ───────────── page editing ─────────────

  /** Where an element of the page sits inside the scrolling paper, for tools drawn over it. */
  const within = (rect: DOMRect) => {
    const box = scroller.current!.getBoundingClientRect();
    return { top: rect.top - box.top + scroller.current!.scrollTop, left: rect.left - box.left + scroller.current!.scrollLeft };
  };

  // The formatting toolbar follows the selected words.
  useEffect(() => {
    if (!editing) {
      setTool(null);
      return;
    }
    const update = () => {
      if (line) return;
      const found = selectedText();
      const selection = window.getSelection();
      if (found === "none" || found === "split" || !selection?.rangeCount || !scroller.current) {
        if (found === "split") setHint("حدّد كلمات داخل سطر واحد لتغيير حجمها أو حذفها.");
        setTool(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      const style = start ? window.getComputedStyle(start) : null;
      const at = within(rect);
      setTool({
        sel: found,
        top: Math.max(0, at.top - 46),
        left: Math.max(0, at.left + rect.width / 2),
        size: style ? Math.round(parseFloat(style.fontSize) / 1.25) : 11,
        bold: style ? Number(style.fontWeight) >= 600 : false,
        italic: style?.fontStyle === "italic",
        underline: Boolean(style?.textDecorationLine.includes("underline")),
      });
    };
    const handler = () => window.setTimeout(update, 0);
    document.addEventListener("mouseup", handler);
    document.addEventListener("keyup", handler);
    return () => {
      document.removeEventListener("mouseup", handler);
      document.removeEventListener("keyup", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, line, html]);

  const apply = async (change: { size?: number; bold?: boolean; italic?: boolean; underline?: boolean } | "delete") => {
    if (!tool || !editor) return;
    setWorking(true);
    const done =
      change === "delete"
        ? await editor.edit({ op: "text", ...tool.sel, text: "" })
        : await editor.edit({ op: "style", ...tool.sel, ...change });
    setWorking(false);
    if (done) {
      window.getSelection()?.removeAllRanges();
      setTool(null);
    }
  };

  /** Double-click a line: its words open for typing, as in Word. */
  const openLine = async (event: React.MouseEvent) => {
    if (!editing || !editor) return;
    const paragraph = (event.target as HTMLElement).closest<HTMLElement>("[data-p]");
    if (!paragraph || !scroller.current) return;
    const [part, index] = (paragraph.dataset.p ?? "").split("|");
    try {
      const text = await editor.paragraph(part!, Number(index));
      const rect = paragraph.getBoundingClientRect();
      const at = within(rect);
      lineDone.current = false;
      setTool(null);
      window.getSelection()?.removeAllRanges();
      setLine({
        part: part!,
        paragraph: Number(index),
        original: text,
        text,
        top: at.top,
        left: at.left,
        width: Math.max(rect.width, 160),
        height: Math.max(rect.height + 10, 34),
        fontSize: window.getComputedStyle(paragraph).fontSize,
      });
    } catch {
      setHint("تعذّر فتح هذا السطر للكتابة.");
    }
  };

  /** Sends only what changed in the line: the words between the unchanged start and end. */
  const closeLine = async (save: boolean) => {
    if (!line || lineDone.current) return;
    lineDone.current = true;
    const { original, text } = line;
    setLine(null);
    if (!save || text === original || !editor) return;
    const changes = changesBetween(original, text);
    const first = changes[0]!;
    setWorking(true);
    await editor.edit({ op: "text", part: line.part, paragraph: line.paragraph, offset: first.offset, end: first.end, text: first.text, changes });
    setWorking(false);
  };

  const onPageKey = (event: React.KeyboardEvent) => {
    if (!editing || !tool || line) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      void apply("delete");
    }
  };
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-anchor]");
    if (target) {
      event.preventDefault();
      setSelected(groupAnchor(target.dataset.anchor!));
    }
  };

  const counts = useMemo(() => {
    const tally: Record<SlotState, number> = { bound: 0, case: 0, statement: 0, cleared: 0, unbound: 0, sample: 0 };
    for (const slot of slots) {
      if (slots.some((other) => other.rows?.anchors.slice(1).includes(slot.anchor))) continue;
      tally[stateOf(slot, byAnchor.get(slot.anchor))] += 1;
    }
    return tally;
  }, [slots, byAnchor]);

  const slot = selected ? slotMap.get(selected) : undefined;
  const binding = selected ? byAnchor.get(selected) : undefined;

  const setBinding = (next: Binding | null) => {
    if (!slot) return;
    const anchors = slot.rows?.anchors ?? [slot.anchor];
    const rest = bindings.filter((item) => !anchors.includes(item.anchor));
    if (!next) onBindings(rest);
    else onBindings([...rest, ...anchors.map((anchor) => ({ ...next, anchor }))]);
  };

  const jump = (anchor: string) => {
    setSelected(anchor);
    paper.current?.querySelector(`[data-anchor="${anchor}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  /** Creates a field from what the slot says, with a type that fits, and binds it. */
  const createField = () => {
    if (!slot) return;
    const taken = new Set(fields.keys());
    const key = fieldKey(slot.label, taken);
    let type: FieldType = "text";
    const extra: Partial<FieldDef> = {};
    let action: BindingAction = "text";
    if (slot.kind === "checkbox") {
      const group = slots.filter((item) => item.group && item.group === slot.group);
      type = "choice";
      extra.options = [...new Set(group.map((item) => item.option ?? "").filter(Boolean))];
      if (!extra.options.length) extra.options = [slot.option || "نعم"];
      action = "check";
    } else if (slot.kind === "choose") {
      type = "choice";
      extra.options = slot.options?.length ? slot.options : ["خيار"];
      action = "choose";
    } else if (slot.kind === "image") {
      type = /توقيع|إمضاء|امضاء/.test(slot.label) ? "signature" : "photos";
      action = "image";
    } else if (slot.kind === "rows") {
      type = "table";
      extra.columns = (slot.rows?.columns ?? ["c1"]).map((column, index) => ({ key: column || `c${index + 1}`, label: `عمود ${index + 1}`, type: "text" }));
      action = "rows";
    } else if (slot.kind === "statement") {
      type = "attestation";
      extra.statement = slot.text;
      extra.evidence = { kind: "visit", requires: [{ type: "gps", max_meters: 1000 }, { type: "photos", min: 1 }] };
      action = "statement";
    }
    const field: FieldDef = { key, label: slot.label || "حقل جديد", type, ...extra };
    const sections = definition.sections.length ? definition.sections : [{ id: "s1", title: slot.section || "بيانات الاستعلام", fields: [] }];
    const index = Math.max(0, sections.findIndex((section) => section.title === slot.section));
    onDefinition({
      ...definition,
      sections: sections.map((section, position) => (position === index ? { ...section, fields: [...section.fields, field] } : section)),
    });
    if (slot.kind === "checkbox") {
      // Bind every box of the group to its option at once.
      const group = slots.filter((item) => item.group && item.group === slot.group);
      const anchors = new Set(group.map((item) => item.anchor));
      onBindings([
        ...bindings.filter((item) => !anchors.has(item.anchor)),
        ...group.map((item) => ({ anchor: item.anchor, action: "check" as const, source: `answers.${key}`, option: item.option || extra.options![0] })),
      ]);
    } else setBinding({ anchor: slot.anchor, action, source: `answers.${key}`, ...(slot.kind === "rows" ? { columns: extra.columns!.map((column) => column.key) } : {}) });
  };

  const actions = slot ? ACTIONS_FOR_SLOT[slot.kind] : [];
  const action = binding?.action ?? actions[0] ?? "text";
  const candidates = allFields(definition).filter((field) => FIELD_TYPES_FOR_ACTION[action].includes(field.type));
  const source = binding?.source ?? "";
  const field = fields.get(source.slice(8));
  const options = field?.type === "yesno" ? ["نعم", "لا"] : (field?.options ?? []);

  const unresolved = slots.filter((item) => {
    const state = stateOf(item, byAnchor.get(item.anchor));
    return (state === "sample" || state === "unbound") && !slots.some((other) => other.rows?.anchors.slice(1).includes(item.anchor));
  });

  return (
    <div className="tpl-mapper">
      <div className={`tpl-mapper-stage ${dragging ? "is-dragging" : ""} ${placing ? "is-placing" : ""}`} ref={stage}>
        {readOnly && lockedReason && (
          <div className="tpl-place-bar locked">
            <Icon name="lock" size={16} />
            <small>{lockedReason}</small>
          </div>
        )}
        {hint && (
          <p className="tpl-drag-hint" role="status">
            <Icon name="bell" size={14} />
            {hint}
          </p>
        )}
        {!readOnly && editor && (
          <div className="tpl-mode-bar">
            <div className="segmented">
              <button className={mode === "map" ? "active" : ""} onClick={() => setMode("map")}>
                <Icon name="grid" size={14} />
                ربط الحقول
              </button>
              <button
                className={mode === "edit" ? "active" : ""}
                onClick={() => {
                  setMode("edit");
                  setSelected(null);
                }}
              >
                <Icon name="file" size={14} />
                تحرير التصميم
              </button>
            </div>
            <button
              className="btn small ghost"
              disabled={!editor.undoSteps || working}
              title={editor.lastChange ? `تراجع عن: ${editor.lastChange}` : "لا يوجد ما يُتراجع عنه"}
              onClick={async () => {
                setWorking(true);
                await editor.undo();
                setWorking(false);
                setPicture(null);
              }}
            >
              <Icon name="refresh" size={14} />
              تراجع {editor.undoSteps ? `(${number(editor.undoSteps)})` : ""}
            </button>
          </div>
        )}
        {editing && (
          <div className="tpl-place-bar">
            <small>
              حدّد كلمات لتغيير حجمها أو جعلها عريضة أو حذفها (أو اضغط Delete). اضغط مرتين على أي سطر لتكتب فيه وتحذف كما في Word، ثم Enter للحفظ. اضغط صورة لتغيير حجمها، أو اسحبها إلى مكان آخر.
            </small>
          </div>
        )}
        {mode === "map" && !readOnly && onPlace && (
          <div className="tpl-place-bar">
            {NEW_POINTS.map((item) => (
              <span
                key={item.kind}
                className={`tpl-new-point np-${item.kind}`}
                role="button"
                tabIndex={0}
                aria-label={item.label}
                onPointerDown={startNew(item.kind, item.label)}
              >
                <Icon name={item.icon} size={14} />
                {item.label}
              </span>
            ))}
            <small>
              اسحب نقطة إلى مكانها في الصفحة ثم اربطها بحقل. لتحويل جملة من نموذج العميل إلى عبارة إقرار: حدّدها بالفأرة ثم اضغط «عبارة إقرار». ويمكنك سحب أي نقطة نص أو عبارة إقرار أو مربع اختيار لتغيير مكانها.
            </small>
          </div>
        )}
        <div className="tpl-legend">
          {(Object.keys(STATE_LABELS) as SlotState[]).map((state) => (
            <button key={state} className={`lg-${state} ${filter === state ? "on" : ""}`} onClick={() => setFilter(filter === state ? "all" : state)}>
              <i />
              {STATE_LABELS[state]} <b>{number(counts[state])}</b>
            </button>
          ))}
        </div>
        {((selected && slotMap.get(selected)?.kind === "checkbox" && boxes) || (editing && picture)) && (
          <div className="tpl-boxes-strip" ref={setStrip} />
        )}
        <div className={`tpl-paper-scroll ${editing ? "is-editing" : ""}`} ref={scroller}>
          {tool && !line && (
            <div className="tpl-format-bar glass" style={{ top: tool.top, left: tool.left }} onMouseDown={(event) => event.preventDefault()}>
              <select
                aria-label="حجم الخط"
                value={tool.size}
                disabled={working}
                onChange={(event) => void apply({ size: Number(event.target.value) })}
              >
                {[...new Set([8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, tool.size])].sort((a, b) => a - b).map((size) => (
                  <option key={size} value={size}>
                    {number(size)}
                  </option>
                ))}
              </select>
              <button disabled={working} title="تصغير الخط" onClick={() => void apply({ size: Math.max(4, tool.size - 1) })}>
                A−
              </button>
              <button disabled={working} title="تكبير الخط" onClick={() => void apply({ size: Math.min(96, tool.size + 1) })}>
                A+
              </button>
              <button disabled={working} className={tool.bold ? "on" : ""} title="عريض" onClick={() => void apply({ bold: !tool.bold })}>
                <b>B</b>
              </button>
              <button disabled={working} className={tool.italic ? "on" : ""} title="مائل" onClick={() => void apply({ italic: !tool.italic })}>
                <i>I</i>
              </button>
              <button disabled={working} className={tool.underline ? "on" : ""} title="تسطير" onClick={() => void apply({ underline: !tool.underline })}>
                <u>U</u>
              </button>
              <button disabled={working} className="danger" title="حذف الكلمات المحددة" onClick={() => void apply("delete")}>
                حذف
              </button>
            </div>
          )}
          {line && (
            <textarea
              className="tpl-line-editor"
              dir="rtl"
              autoFocus
              value={line.text}
              style={{ top: line.top, left: line.left, width: line.width, minHeight: line.height, fontSize: line.fontSize }}
              onChange={(event) => setLine({ ...line, text: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void closeLine(true);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  void closeLine(false);
                }
              }}
              onBlur={() => void closeLine(true)}
            />
          )}
          <div
            className="tpl-paper"
            dir="rtl"
            ref={paper}
            onClick={onClick}
            onDoubleClick={(event) => void openLine(event)}
            onKeyDown={(event) => {
              onKey(event);
              onPageKey(event);
            }}
            onPointerDown={startMove}
            // Server-rendered from the stored template: text is escaped, pictures are inline data.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
        {caret && <span className={`tpl-drop-caret ${caret.ok ? "" : "bad"}`} style={{ top: caret.top, left: caret.left, height: caret.height }} />}
        {ghost &&
          createPortal(
            <span className="tpl-drag-ghost" style={{ left: ghost.x, top: ghost.y }}>
              <Icon name="plus" size={12} />
              {ghost.label}
            </span>,
            document.body,
          )}
      </div>

      <aside className={`tpl-inspector glass ${slot || (editing && picture) ? "has-slot" : ""}`}>
        {editing && picture && editor && (
          <PicturePanel key={picture} id={picture} api={editor} readOnly={readOnly} previewHost={strip} stamp={stamp} onClose={() => setPicture(null)} />
        )}
        {editing && !picture && (
          <div className="tpl-inspector-empty">
            <Icon name="file" size={26} />
            <strong>تحرير تصميم العميل</strong>
            <p>
              التعديلات تُحفظ في ملف Word نفسه وتظهر في كل تقرير بهذا الإصدار. أماكن الحقول لا تتأثر، ويمكنك التراجع عن أي تعديل بزر «تراجع».
            </p>
            <ul className="tpl-edit-help">
              <li>حدّد كلمات ← غيّر الحجم أو اجعلها عريضة أو مائلة أو احذفها.</li>
              <li>اضغط مرتين على سطر ← اكتب واحذف فيه، ثم Enter للحفظ أو Esc للإلغاء. Shift+Enter لسطر جديد.</li>
              <li>اضغط صورة ← كبّرها أو صغّرها أو احذفها. اسحبها لنقلها إلى سطر أو خانة أخرى.</li>
            </ul>
          </div>
        )}
        {!editing && !slot && (
          <div className="tpl-inspector-empty">
            <Icon name="grid" size={26} />
            <strong>اختر مكانًا في الصفحة</strong>
            <p>كل مكان مظلَّل يمكن أن يُكتب فيه شيء. اضغط عليه لتحدد ما يُطبع فيه.</p>
            {unresolved.length > 0 && (
              <>
                <h4>تحتاج قرارًا ({number(unresolved.length)})</h4>
                <ul className="tpl-todo">
                  {unresolved.slice(0, 40).map((item) => (
                    <li key={item.anchor}>
                      <button onClick={() => jump(item.anchor)}>
                        <span className={`dot ${stateOf(item, byAnchor.get(item.anchor))}`} />
                        {item.label || SLOT_KINDS[item.kind]}
                        {item.text && item.sample ? <small>«{item.text.slice(0, 24)}»</small> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {!editing && slot && (
          <div className="tpl-inspector-body">
            <div className="tpl-inspector-head">
              <span className="tpl-kind">{SLOT_KINDS[slot.kind]}</span>
              <button className="icon-button" onClick={() => setSelected(null)} aria-label="إغلاق">
                <Icon name="close" size={16} />
              </button>
            </div>
            <h3>{slot.label || "بلا عنوان"}</h3>
            {!readOnly && onPlace && MOVABLE.includes(slot.kind) && <p className="tpl-move-hint">
                {slot.kind === "statement"
                  ? "اسحب العبارة لتغيير مكانها. تُخفى العبارة الأصلية من مكانها، وتُطبع في المكان الجديد فقط إذا أكدها المستعلم وتوفر دليلها."
                  : slot.kind === "checkbox"
                    ? "اسحب المربع لتغيير مكانه. يُخفى المربع الأصلي، ويُرسم مربع جديد في المكان الجديد ويُعلَّم حسب الإجابة."
                    : "اسحب هذه النقطة في الصفحة لتغيير مكانها."}
              </p>}
            <p className="tpl-muted">القسم: {slot.section}</p>
            {slot.text && (
              <div className={`tpl-original ${slot.sample ? "sample" : ""}`}>
                <span>{slot.sample ? "نص من تقرير سابق — لن يُطبع" : "في الأصل"}</span>
                <p>{slot.text}</p>
              </div>
            )}
            {slot.image && (
              <p className="tpl-muted">
                {IMAGE_ROLES[slot.image.role] ?? slot.image.role}
                {slot.image.md5 ? ` · ${slot.image.md5.slice(0, 8)}` : ""}
              </p>
            )}

            <label className="field">
              <span>ماذا يحدث هنا؟</span>
              <select
                disabled={readOnly}
                value={binding ? binding.action : ""}
                onChange={(event) => {
                  const next = event.target.value as BindingAction | "";
                  if (!next) setBinding(null);
                  else if (next === "clear") setBinding({ anchor: slot.anchor, action: "clear" });
                  else setBinding({ anchor: slot.anchor, action: next, source: binding?.action === next ? binding.source : undefined });
                }}
              >
                <option value="">يبقى كما في الأصل</option>
                {actions.map((item) => (
                  <option key={item} value={item}>
                    {ACTIONS[item]}
                  </option>
                ))}
              </select>
            </label>

            {binding && binding.action !== "clear" && (
              <label className="field">
                <span>{binding.action === "image" ? "الصورة" : "المصدر"}</span>
                <select
                  disabled={readOnly}
                  value={source}
                  onChange={(event) => {
                    const value = event.target.value;
                    const chosen = fields.get(value.slice(8));
                    setBinding({
                      ...binding,
                      source: value || undefined,
                      ...(binding.action === "check" ? { option: chosen?.type === "yesno" ? "نعم" : chosen?.options?.[0] } : {}),
                      ...(binding.action === "rows" ? { columns: (chosen?.columns ?? []).map((column) => column.key) } : {}),
                    });
                  }}
                >
                  <option value="">اختر…</option>
                  {candidates.length > 0 && (
                    <optgroup label="أسئلة النموذج">
                      {candidates.map((item) => (
                        <option key={item.key} value={`answers.${item.key}`}>
                          {item.label} · {TYPE_LABELS[item.type]}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {binding.action === "text" && (
                    <optgroup label="بيانات الحالة (لا يكتبها المستعلم)">
                      {Object.entries(caseSources)
                        .filter(([key]) => key.startsWith("case."))
                        .map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  {binding.action === "image" && <option value="approval.stamp">ختم جولدن باي — بعد الاعتماد فقط</option>}
                </select>
              </label>
            )}

            {binding?.action === "check" && field && (
              <label className="field">
                <span>يُعلَّم هذا المربع عند اختيار</span>
                <select disabled={readOnly} value={binding.option ?? ""} onChange={(event) => setBinding({ ...binding, option: event.target.value })}>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {slot.kind === "checkbox" && boxes && <BoxSpacing key={slot.anchor} anchor={slot.anchor} readOnly={readOnly} api={boxes} previewHost={strip} />}

            {binding?.action === "rows" && field && (
              <div className="field">
                <span>عمود الجدول في كل خانة من الصف</span>
                {(binding.columns ?? []).map((column, index) => (
                  <select
                    key={index}
                    disabled={readOnly}
                    value={column ?? ""}
                    onChange={(event) => {
                      const columns = [...(binding.columns ?? [])];
                      columns[index] = event.target.value || null;
                      setBinding({ ...binding, columns });
                    }}
                  >
                    <option value="">الخانة {number(index + 1)}: فارغة</option>
                    {(field.columns ?? []).map((item) => (
                      <option key={item.key} value={item.key}>
                        الخانة {number(index + 1)}: {item.label}
                      </option>
                    ))}
                  </select>
                ))}
                <small className="field-hint">تُكرَّر الصفوف تلقائيًا إذا زادت العناصر عن صفوف التصميم.</small>
              </div>
            )}

            {field?.type === "attestation" && (
              <div className="tpl-evidence-note">
                <Icon name="shield" size={16} />
                <div>
                  <strong>تُطبع فقط بدليل ({EVIDENCE_KINDS[field.evidence?.kind ?? "visit"]})</strong>
                  <p>
                    يؤكدها المستعلم بنفسه، ويتحقق النظام من{" "}
                    {(field.evidence?.requires ?? [])
                      .map((need) => (need.type === "gps" ? "الموقع" : need.type === "photos" ? `${number(need.min ?? 1)} صورة` : `«${fields.get(need.field ?? "")?.label ?? need.field}»`))
                      .join(" و")}
                    . دون ذلك تُحذف من التقرير.
                  </p>
                </div>
              </div>
            )}

            {!readOnly && (
              <div className="tpl-inspector-actions">
                <button className="btn small" onClick={createField}>
                  <Icon name="plus" size={14} />
                  حقل جديد من هذا المكان
                </button>
                {binding && (
                  <button className="btn small ghost" onClick={() => setBinding(null)}>
                    إلغاء الربط
                  </button>
                )}
                {onPlace && slot.anchor.startsWith("gp_u") && (
                  <button
                    className="btn small ghost tpl-danger"
                    onClick={async () => {
                      if (await onPlace({ op: "remove", anchor: slot.anchor, part: slot.part, paragraph: 0, offset: 0 })) setSelected(null);
                    }}
                  >
                    حذف النقطة
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
