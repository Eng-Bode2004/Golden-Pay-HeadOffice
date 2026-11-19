import { useEffect, useState } from "react";
import { api, ApiRequestError } from "../api";
import { date, ErrorMessage, Icon } from "./ui";

interface Device {
  device_name: string | null;
  platform: string | null;
  bound_at: string;
  last_seen_at: string | null;
}

/**
 * The one phone the investigator signs in from. Reset when the phone is changed, lost or
 * broken: their sessions end and the next sign-in registers the new phone.
 */
export function DevicePanel({ userId }: { userId: string }) {
  const [device, setDevice] = useState<Device | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api<{ device: Device | null }>(`/admin/users/${userId}/device`)
      .then((data) => setDevice(data.device))
      .catch(() => setError("تعذّر تحميل بيانات الهاتف."));
  }, [userId]);

  async function reset() {
    if (!window.confirm("إعادة تعيين الهاتف؟ سيُسجَّل خروجه من الهاتف الحالي، وأول هاتف يسجّل منه الدخول بعدها يصبح هاتفه.")) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/users/${userId}/device/reset`, { method: "POST", body: "{}" });
      setDevice(null);
      setNotice("أُعيد تعيين الهاتف. سيُسجَّل هاتفه الجديد عند أول دخول.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "تعذّرت إعادة التعيين.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass panel device-panel">
      <div className="panel-heading">
        <h2>الهاتف المسجّل</h2>
        <Icon name="lock" size={18} />
      </div>
      <ErrorMessage message={error} />
      {notice && <p className="success-message">{notice}</p>}
      {device === undefined && !error && <span className="image-skeleton" />}
      {device === null && !notice && (
        <p className="hint">لم يُسجَّل هاتف بعد. أول هاتف يسجّل منه الدخول يصبح هاتفه الوحيد.</p>
      )}
      {device && (
        <>
          <dl className="review-facts">
            <div>
              <dt>الهاتف</dt>
              <dd dir="ltr">{device.device_name ?? "—"}</dd>
            </div>
            <div>
              <dt>سُجّل في</dt>
              <dd>{date(device.bound_at)}</dd>
            </div>
            <div>
              <dt>آخر دخول منه</dt>
              <dd>{device.last_seen_at ? date(device.last_seen_at) : "—"}</dd>
            </div>
          </dl>
          <p className="hint">لا يستطيع الدخول من هاتف آخر. إذا غيّر هاتفه أو تلف، أعد التعيين.</p>
          <button className="btn ghost btn-danger" disabled={busy} onClick={() => void reset()}>
            <Icon name="refresh" size={16} />
            {busy ? "جارٍ إعادة التعيين…" : "إعادة تعيين الهاتف"}
          </button>
        </>
      )}
    </section>
  );
}
