import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, number } from "../../components/ui";

export interface BoxInfo {
  anchor: string;
  option: string;
  /** Drawn at a fixed spot on the page (only these can be moved). */
  floating: boolean;
  /** Distance from the left edge, in mm. */
  x: number | null;
  /** How far Head Office has moved it so far, in mm. */
  nudge: number;
}

export interface BoxSpacingApi {
  list: (anchor: string) => Promise<BoxInfo[]>;
  move: (moves: { anchor: string; dx: number }[]) => Promise<boolean>;
  preview: (anchor: string, signal: AbortSignal) => Promise<Blob>;
}

const STEPS = [0.5, 1, 2];
const mm = (value: number) => `${value > 0 ? "+" : ""}${number(Math.round(value * 10) / 10)} مم`;

/**
 * Spacing of a checkbox question's drawn boxes. The client's boxes are drawn at fixed spots
 * while the option words flow with the text, so once printed a box can sit on its word.
 * Head Office moves the boxes (one, all, or the gaps between them) and sees the printed rows.
 */
export function BoxSpacing({
  anchor,
  readOnly,
  api,
  previewHost,
}: {
  anchor: string;
  readOnly: boolean;
  api: BoxSpacingApi;
  /** A wide place above the page for the printed preview; the side panel is too narrow to read it. */
  previewHost?: HTMLElement | null;
}) {
  const [boxes, setBoxes] = useState<BoxInfo[] | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [pending, setPending] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ url: string | null; loading: boolean; error: string }>({ url: null, loading: false, error: "" });
  const [stamp, setStamp] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const waiting = useRef<Record<string, number>>({});

  useEffect(() => {
    let live = true;
    setBoxes(null);
    setError("");
    setPending({});
    waiting.current = {};
    api
      .list(anchor)
      .then((list) => live && setBoxes(list))
      .catch(() => live && setError("تعذّر قراءة مربعات هذا السؤال."));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  // The printed rows: converted on the server exactly as reports are, every box ticked.
  useEffect(() => {
    if (!boxes?.some((box) => box.floating)) return;
    const controller = new AbortController();
    let url: string | null = null;
    setPreview((current) => ({ ...current, loading: true, error: "" }));
    api
      .preview(anchor, controller.signal)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setPreview({ url, loading: false, error: "" });
      })
      .catch(() => !controller.signal.aborted && setPreview({ url: null, loading: false, error: "تعذّر تجهيز المعاينة. حاول مرة أخرى." }));
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, stamp, Boolean(boxes?.some((box) => box.floating))]);

  // Right to left: the first option is the rightmost box.
  const ordered = useMemo(
    () => [...(boxes ?? [])].filter((box) => box.floating).sort((a, b) => (b.x ?? 0) - (a.x ?? 0)),
    [boxes],
  );

  /** Adds moves and sends them once the clicks pause, then refreshes the list and the preview. */
  const queue = (moves: { anchor: string; dx: number }[]) => {
    // A ref, so quick clicks add up instead of each starting from the last render.
    const next = { ...waiting.current };
    for (const move of moves) next[move.anchor] = Math.round(((next[move.anchor] ?? 0) + move.dx) * 10) / 10;
    waiting.current = next;
    setPending(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const sent = waiting.current;
      const list = Object.entries(sent)
        .filter(([, dx]) => dx)
        .map(([box, dx]) => ({ anchor: box, dx }));
      waiting.current = {};
      if (!list.length) {
        setPending({});
        return;
      }
      setSaving(true);
      const done = await api.move(list);
      setSaving(false);
      // Clicks made while saving stay pending for the next send.
      setPending({ ...waiting.current });
      if (!done) return;
      try {
        setBoxes(await api.list(anchor));
      } catch {
        // The list stays as it was; the preview below still refreshes.
      }
      setStamp((value) => value + 1);
    }, 700);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (error) return <p className="tpl-muted">{error}</p>;
  if (!boxes) return <p className="tpl-muted">جارٍ قراءة مربعات السؤال…</p>;
  if (!ordered.length) {
    return (
      <div className="tpl-boxes">
        <h4>مسافات الخيارات</h4>
        <p className="tpl-muted">مربعات هذا السؤال تتحرك مع النص، فتبقى بجوار خياراتها دائمًا ولا تحتاج ضبطًا.</p>
      </div>
    );
  }

  const previewBlock = (
      <div className="tpl-boxes-preview">
      <div className="tpl-boxes-preview-head">
        <strong>كما سيُطبع</strong>
        <span className="tpl-muted">
          {saving ? "جارٍ الحفظ…" : preview.loading ? "جارٍ تجهيز المعاينة… (بضع ثوانٍ)" : "كل المربعات معلَّمة لتظهر أماكنها"}
        </span>
        <button className="icon-button" aria-label="تحديث المعاينة" onClick={() => setStamp((value) => value + 1)}>
          <Icon name="refresh" size={14} />
        </button>
      </div>
      {preview.error && <p className="tpl-muted">{preview.error}</p>}
      {preview.url && (
        <iframe
          className={preview.loading || saving ? "loading" : ""}
          title="معاينة مربعات الاختيار"
          src={`${preview.url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
        />
      )}
    </div>
  );

  const shown = (box: BoxInfo) => box.nudge + (pending[box.anchor] ?? 0);
  const moved = ordered.some((box) => shown(box) !== 0);

  return (
    <div className="tpl-boxes">
      <h4>مسافات الخيارات</h4>
      <p className="tpl-muted">
        مربعات هذا السؤال مرسومة في أماكن ثابتة، والكلمات تتحرك مع الخط، فقد يقع المربع فوق كلمته عند الطباعة. حرّك المربعات حتى يبتعد كل مربع عن كلمته في المعاينة.
      </p>

      {!readOnly && (
        <>
          <div className="tpl-boxes-step">
            <span>مقدار كل ضغطة</span>
            <div className="segmented">
              {STEPS.map((value) => (
                <button key={value} className={step === value ? "active" : ""} onClick={() => setStep(value)}>
                  {number(value)} مم
                </button>
              ))}
            </div>
          </div>

          <div className="tpl-boxes-all">
            <span>كل المربعات</span>
            <div>
              <button className="btn small ghost" title="تحريك الكل يسارًا" onClick={() => queue(ordered.map((box) => ({ anchor: box.anchor, dx: -step })))}>
                ←
              </button>
              <button className="btn small ghost" title="تحريك الكل يمينًا" onClick={() => queue(ordered.map((box) => ({ anchor: box.anchor, dx: step })))}>
                →
              </button>
            </div>
          </div>
          <div className="tpl-boxes-all">
            <span>المسافة بين الخيارات</span>
            <div>
              <button className="btn small ghost" title="مسافة أضيق" onClick={() => queue(ordered.map((box, index) => ({ anchor: box.anchor, dx: index * step })))}>
                أضيق
              </button>
              <button className="btn small ghost" title="مسافة أوسع" onClick={() => queue(ordered.map((box, index) => ({ anchor: box.anchor, dx: -index * step })))}>
                أوسع
              </button>
            </div>
          </div>
        </>
      )}

      <ul className="tpl-boxes-list">
        {ordered.map((box) => (
          <li key={box.anchor} className={box.anchor === anchor ? "current" : ""}>
            <span className="tpl-boxes-name">{box.option || "مربع"}</span>
            <small className={shown(box) ? "moved" : ""}>{shown(box) ? mm(shown(box)) : "في مكانه الأصلي"}</small>
            {!readOnly && (
              <span className="tpl-boxes-move">
                <button className="icon-button" aria-label={`تحريك «${box.option}» يسارًا`} onClick={() => queue([{ anchor: box.anchor, dx: -step }])}>
                  ←
                </button>
                <button className="icon-button" aria-label={`تحريك «${box.option}» يمينًا`} onClick={() => queue([{ anchor: box.anchor, dx: step }])}>
                  →
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {!readOnly && moved && (
        <button className="btn small ghost" onClick={() => queue(ordered.map((box) => ({ anchor: box.anchor, dx: -shown(box) })))}>
          إرجاع المربعات إلى أماكنها الأصلية
        </button>
      )}

      {previewHost ? createPortal(previewBlock, previewHost) : previewBlock}
    </div>
  );
}
