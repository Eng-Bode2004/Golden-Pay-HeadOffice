import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, number } from "../../components/ui";
import { usePdfPreview } from "./usePdfPreview";

export interface PictureInfo {
  id: string;
  floating: boolean;
  widthMm: number;
  heightMm: number;
  /** Part of a field's place (photo, logo or stamp slot): it moves with its place. */
  inPlace: boolean;
}

export type EditOp =
  | {
      op: "text";
      part: string;
      paragraph: number;
      offset: number;
      end: number;
      text: string;
      /** Several separate changes in the same line, each from the line as it was. */
      changes?: { offset: number; end: number; text: string }[];
    }
  | { op: "style"; part: string; paragraph: number; offset: number; end: number; size?: number; bold?: boolean; italic?: boolean; underline?: boolean }
  | { op: "picture.move"; picture: string; part: string; paragraph: number; offset: number }
  | { op: "picture.nudge"; picture: string; dx: number; dy: number }
  | { op: "picture.resize"; picture: string; factor: number }
  | { op: "picture.delete"; picture: string };

/** What the mapper needs to edit the client's page like Word. */
export interface PageEditorApi {
  edit: (op: EditOp) => Promise<boolean>;
  undo: () => Promise<boolean>;
  paragraph: (part: string, index: number) => Promise<string>;
  picture: (id: string) => Promise<PictureInfo>;
  picturePreview: (id: string, signal: AbortSignal) => Promise<Blob>;
  undoSteps: number;
  lastChange: string | null;
}

const STEPS = [1, 2, 5];

/** Size and position of one picture on the client's page, with a printed preview. */
export function PicturePanel({
  id,
  api,
  readOnly,
  previewHost,
  stamp,
  onClose,
}: {
  id: string;
  api: PageEditorApi;
  readOnly: boolean;
  previewHost?: HTMLElement | null;
  /** Changes whenever the page was saved, so the panel reads the picture again. */
  stamp: string;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<PictureInfo | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState(2);
  const [pending, setPending] = useState({ dx: 0, dy: 0, factor: 1 });
  const waiting = useRef({ dx: 0, dy: 0, factor: 1 });
  const timer = useRef<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  // The printed preview is built on request (each one is a full conversion on the server).
  const [wanted, setWanted] = useState(false);
  const [round, setRound] = useState(0);
  const preview = usePdfPreview(wanted ? (signal) => api.picturePreview(id, signal) : null, `${id}:${stamp}:${round}`);

  useEffect(() => {
    let live = true;
    setError("");
    api
      .picture(id)
      .then((value) => live && setInfo(value))
      .catch(() => live && setError("تعذّر قراءة الصورة. أعد تحميل الصفحة."));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, stamp]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Adds up quick clicks and saves them together once they pause. */
  const queue = (change: { dx?: number; dy?: number; factor?: number }) => {
    const next = {
      dx: Math.round((waiting.current.dx + (change.dx ?? 0)) * 10) / 10,
      dy: Math.round((waiting.current.dy + (change.dy ?? 0)) * 10) / 10,
      factor: waiting.current.factor * (change.factor ?? 1),
    };
    waiting.current = next;
    setPending(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const sent = waiting.current;
      waiting.current = { dx: 0, dy: 0, factor: 1 };
      setSaving(true);
      if (sent.dx || sent.dy) await api.edit({ op: "picture.nudge", picture: id, dx: sent.dx, dy: sent.dy });
      if (Math.abs(sent.factor - 1) > 0.001) await api.edit({ op: "picture.resize", picture: id, factor: sent.factor });
      setSaving(false);
      setPending({ ...waiting.current });
    }, 700);
  };

  const previewBlock = (
    <div className="tpl-boxes-preview">
      <div className="tpl-boxes-preview-head">
        <strong>كما ستُطبع</strong>
        <span className="tpl-muted">
          {!wanted ? "اضغط «عرض» لرؤية الصفوف التي فيها الصورة كما ستُطبع." : saving ? "جارٍ الحفظ…" : preview.loading ? "جارٍ تجهيز المعاينة… (بضع ثوانٍ)" : "الصفوف التي فيها الصورة فقط"}
        </span>
        <button className="btn small ghost" onClick={() => (wanted ? setRound((value) => value + 1) : setWanted(true))}>
          <Icon name="refresh" size={14} />
          {wanted ? "تحديث" : "عرض"}
        </button>
      </div>
      {preview.error && <p className="tpl-muted">{preview.error}</p>}
      {preview.url && <iframe className={preview.loading || saving ? "loading" : ""} title="معاينة الصورة" src={`${preview.url}#toolbar=0&navpanes=0&view=FitH`} />}
    </div>
  );

  return (
    <div className="tpl-inspector-body">
      <div className="tpl-inspector-head">
        <span className="tpl-kind">صورة</span>
        <button className="icon-button" onClick={onClose} aria-label="إغلاق">
          <Icon name="close" size={16} />
        </button>
      </div>
      {error && <p className="tpl-muted">{error}</p>}
      {!info && !error && <p className="tpl-muted">جارٍ قراءة الصورة…</p>}
      {info && (
        <>
          <h3>{info.floating ? "صورة عائمة" : "صورة داخل السطر"}</h3>
          <p className="tpl-muted">
            المقاس: {number(Math.round(info.widthMm * pending.factor))} × {number(Math.round(info.heightMm * pending.factor))} مم
            {info.inPlace ? " · جزء من مكان حقل (شعار أو صورة أو ختم)، ويتحرك معه." : ""}
          </p>
          {!readOnly && (
            <div className="tpl-boxes">
              <p className="tpl-muted">اسحب الصورة في الصفحة لنقلها إلى سطر آخر أو خانة أخرى، كما في Word.</p>
              <div className="tpl-boxes-all">
                <span>الحجم</span>
                <div>
                  <button className="btn small ghost" onClick={() => queue({ factor: 0.9 })}>
                    أصغر
                  </button>
                  <button className="btn small ghost" onClick={() => queue({ factor: 1.1 })}>
                    أكبر
                  </button>
                </div>
              </div>
              {info.floating && (
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
                  <div className="tpl-picture-pad">
                    <button className="icon-button" aria-label="إلى أعلى" onClick={() => queue({ dy: -step })}>
                      ↑
                    </button>
                    <button className="icon-button" aria-label="إلى اليسار" onClick={() => queue({ dx: -step })}>
                      ←
                    </button>
                    <button className="icon-button" aria-label="إلى اليمين" onClick={() => queue({ dx: step })}>
                      →
                    </button>
                    <button className="icon-button" aria-label="إلى أسفل" onClick={() => queue({ dy: step })}>
                      ↓
                    </button>
                  </div>
                </>
              )}
              <button
                className="btn small ghost tpl-danger"
                onClick={async () => {
                  if (!window.confirm("حذف هذه الصورة من التصميم؟ يمكنك التراجع بعد ذلك.")) return;
                  if (await api.edit({ op: "picture.delete", picture: id })) onClose();
                }}
              >
                حذف الصورة
              </button>
            </div>
          )}
        </>
      )}
      {previewHost ? createPortal(previewBlock, previewHost) : previewBlock}
    </div>
  );
}
