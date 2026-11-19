import { useState } from "react";
import { createPortal } from "react-dom";
import { api, ApiRequestError } from "../api";
import { ErrorMessage, Icon } from "./ui";

interface Deleted {
  full_name: string;
  investigations_deleted: number;
  reports_kept: number;
  files_deleted: number;
}

/** Deletes an investigator and everything that belongs to them, after the admin's password. */
export function DeleteInvestigatorDrawer({
  user,
  onClose,
  onDeleted,
}: {
  user: { user_id: string; full_name: string; employee_number: string | null };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [password, setPassword] = useState("");
  const [deleteReports, setDeleteReports] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Deleted | null>(null);
  const confirmed = typed.trim() === user.full_name.trim();

  async function remove(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmed || !password) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ deleted: Deleted }>(`/admin/users/${user.user_id}`, {
        method: "DELETE",
        body: JSON.stringify({ password, delete_reports: deleteReports }),
      });
      setDone(result.deleted);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "تعذّر حذف المستعلم.");
    } finally {
      setBusy(false);
      setPassword("");
    }
  }

  return createPortal(
    <div className="drawer-root" dir={document.documentElement.dir}>
      <button className="drawer-scrim" aria-label="إغلاق" onClick={done ? onDeleted : onClose} />
      <aside className="review-drawer" role="dialog" aria-modal="true" aria-label="حذف المستعلم">
        <header className="drawer-head">
          <div>
            <span className="eyebrow">حذف نهائي</span>
            <h2>{user.full_name}</h2>
          </div>
          <button className="icon-button" aria-label="إغلاق" onClick={done ? onDeleted : onClose}>
            <Icon name="close" size={17} />
          </button>
        </header>
        <div className="drawer-body">
          {done ? (
            <section>
              <h3>تم الحذف</h3>
              <p className="hint">
                حُذف «{done.full_name}» وكل بياناته من النظام.
                {done.investigations_deleted > 0 && ` حُذفت ${done.investigations_deleted} من استعلاماته.`}
                {done.reports_kept > 0 && ` بقيت ${done.reports_kept} من تقاريره المنتهية للعميل بدون اسمه.`}
              </p>
              <button className="btn btn-primary btn-block" onClick={onDeleted}>
                تم
              </button>
            </section>
          ) : (
            <form onSubmit={remove}>
              <section>
                <h3>ما الذي سيُحذف</h3>
                <ul className="hint">
                  <li>الحساب والأدوار والجلسات والأجهزة وبصمة الدخول.</li>
                  <li>صور البطاقة والصورة الشخصية والسجل الوظيفي.</li>
                  <li>مناطق العمل والحضور والنقاط والراتب والمستحقات والشكاوى.</li>
                  <li>عروض الاستعلامات ومسار تحركاته عليها.</li>
                </ul>
                <p className="hint">لا يمكن التراجع عن الحذف.</p>
              </section>
              <section>
                <label className="field checkbox-field">
                  <input type="checkbox" checked={deleteReports} onChange={(e) => setDeleteReports(e.target.checked)} />
                  <span>
                    احذف استعلاماته وتقاريره أيضًا
                    <small>
                      {" "}
                      — بدونه تبقى تقاريره المنتهية للعميل بدون اسمه، ولا يُحذف إن كانت معه استعلامات لم تنتهِ.
                    </small>
                  </span>
                </label>
                <label className="field">
                  <span>
                    اكتب اسمه للتأكيد: <b>{user.full_name}</b>
                  </span>
                  <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
                </label>
                <label className="field">
                  <span>كلمة مرورك</span>
                  <input
                    type="password"
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </label>
                <ErrorMessage message={error} />
                <button className="btn btn-block btn-danger" disabled={busy || !confirmed || !password}>
                  <Icon name="close" size={16} />
                  {busy ? "جارٍ الحذف…" : "حذف المستعلم نهائيًا"}
                </button>
              </section>
            </form>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
