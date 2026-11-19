import { useEffect, useState } from "react";
import { api, ApiRequestError } from "../api";
import { ErrorMessage, Icon, number } from "./ui";

interface Preview {
  investigations: number;
  active_points: number;
  payroll_adjustments: number;
  payroll_payments: number;
  investigators: number;
}
interface Removed {
  investigations: number;
  points_cleared: number;
  adjustments_deleted: number;
  payments_deleted: number;
}

/**
 * Clears the data made while testing: every investigation, and every investigator's points
 * and money. Shows what it will remove first; the primary administrator confirms with a
 * phrase and their password.
 */
export function TestDataReset({ onDone }: { onDone: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [phrase, setPhrase] = useState("");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [removed, setRemoved] = useState<Removed | null>(null);

  async function load() {
    try {
      const data = await api<{ will_remove: Preview; confirm_with: string }>("/admin/maintenance/test-data");
      setPreview(data.will_remove);
      setPhrase(data.confirm_with);
    } catch {
      setPreview(null);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function reset(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ removed: Removed }>("/admin/maintenance/test-data/reset", {
        method: "POST",
        body: JSON.stringify({ confirm: typed.trim(), password }),
      });
      setRemoved(result.removed);
      setOpen(false);
      setTyped("");
      await load();
      onDone();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "تعذّر تصفير البيانات.");
    } finally {
      setBusy(false);
      setPassword("");
    }
  }

  if (!preview) return null;
  return (
    <section className="card danger-card">
      <span className="eyebrow">بيانات الاختبار</span>
      <h2>تصفير الاستعلامات والنقاط والمستحقات</h2>
      <p className="hint">
        يحذف كل الاستعلامات نهائيًا (مع صورها وتقاريرها)، ويصفّر نقاط ومستحقات كل المستعلمين. لا يمس حسابات
        المستعلمين ولا الإدارة ولا الرواتب الأساسية. لا يمكن التراجع عنه.
      </p>
      <div className="reset-counts">
        <span>
          الاستعلامات: <b>{number(preview.investigations)}</b>
        </span>
        <span>
          نقاط المستعلمين: <b>{number(preview.active_points)}</b>
        </span>
        <span>
          تعديلات المستحقات: <b>{number(preview.payroll_adjustments)}</b>
        </span>
        <span>
          مدفوعات مسجّلة: <b>{number(preview.payroll_payments)}</b>
        </span>
      </div>
      {removed && (
        <p className="hint">
          تم: حُذفت {number(removed.investigations)} استعلامًا، وصُفّرت {number(removed.points_cleared)} نقطة، وحُذف{" "}
          {number(removed.adjustments_deleted + removed.payments_deleted)} من سجلات المستحقات.
        </p>
      )}
      {!open ? (
        <button className="btn btn-block btn-danger" onClick={() => setOpen(true)}>
          <Icon name="close" size={16} />
          تصفير بيانات الاختبار…
        </button>
      ) : (
        <form onSubmit={reset}>
          <label className="field">
            <span>
              للتأكيد اكتب: <b>{phrase}</b>
            </span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          <label className="field">
            <span>كلمة مرورك</span>
            <input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <ErrorMessage message={error} />
          <div className="inline">
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
              إلغاء
            </button>
            <button className="btn btn-danger" disabled={busy || typed.trim() !== phrase || !password}>
              {busy ? "جارٍ التصفير…" : "تصفير نهائي"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
