import { useCallback, useEffect, useRef, useState } from "react";
import { API, api, ApiRequestError, getAccessToken } from "../api";
import { date, ErrorMessage, Icon, number } from "../components/ui";

interface Release {
  release_id: string;
  version_name: string;
  version_code: number;
  notes: string | null;
  mandatory: boolean;
  size_bytes: number;
  sha256: string;
  active: boolean;
  created_at: string;
  created_by_name: string | null;
}

const megabytes = (bytes: number) => `${number(Math.round((bytes / 1024 / 1024) * 10) / 10)} MB`;

/** build-apk.sh names files golden-pay-v<name>-<code>-<date>.apk; read the version from it. */
function versionFromName(name: string): { name: string; code: string } | null {
  const match = /v?(\d+(?:\.\d+){1,3})[-_](\d{1,10})/.exec(name);
  return match ? { name: match[1]!, code: match[2]! } : null;
}

/** Uploads with progress; fetch cannot report upload progress. */
function upload(form: FormData, onProgress: (share: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API}/headoffice/app-releases`);
    const token = getAccessToken();
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    request.onload = () => {
      let body: { error?: { code?: string; message?: string; details?: Record<string, unknown> } } = {};
      try {
        body = JSON.parse(request.responseText);
      } catch {
        /* not JSON */
      }
      if (request.status >= 200 && request.status < 300) resolve();
      else
        reject(
          new ApiRequestError({
            status: request.status,
            code: body.error?.code ?? "REQUEST_FAILED",
            message: body.error?.message ?? "Upload failed",
            details: body.error?.details,
          }),
        );
    };
    request.onerror = () => reject(new ApiRequestError({ status: 0, code: "NETWORK_ERROR", message: "Network error" }));
    request.send(form);
  });
}

export function AppUpdatesPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState({ version_name: "", version_code: "", notes: "", mandatory: false });
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<{ releases: Release[] }>("/headoffice/app-releases")
      .then((data) => setReleases(data.releases))
      .catch(() => setError("تعذّر تحميل التحديثات."));
  }, []);
  useEffect(load, [load]);

  const choose = (picked: File | null) => {
    setFile(picked);
    setError("");
    const guess = picked ? versionFromName(picked.name) : null;
    if (guess) setDraft((current) => ({ ...current, version_name: guess.name, version_code: guess.code }));
  };

  const publish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setError("");
    setNotice("");
    const form = new FormData();
    form.set("apk", file);
    form.set("version_name", draft.version_name.trim());
    form.set("version_code", draft.version_code.trim());
    form.set("notes", draft.notes);
    form.set("mandatory", String(draft.mandatory));
    setProgress(0);
    try {
      await upload(form, setProgress);
      setNotice(`نُشر الإصدار ${draft.version_name}. سيظهر التحديث للمستعلمين عند فتح التطبيق.`);
      setFile(null);
      setDraft({ version_name: "", version_code: "", notes: "", mandatory: false });
      if (input.current) input.current.value = "";
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "تعذّر رفع التحديث.");
    } finally {
      setProgress(null);
    }
  };

  const change = async (release: Release, patch: Partial<Pick<Release, "active" | "mandatory">>) => {
    await api(`/headoffice/app-releases/${release.release_id}`, { method: "PATCH", body: JSON.stringify(patch) }).catch(() =>
      setError("تعذّر حفظ التغيير."),
    );
    load();
  };
  const remove = async (release: Release) => {
    if (!window.confirm(`حذف الإصدار ${release.version_name} (${release.version_code}) نهائيًا؟`)) return;
    await api(`/headoffice/app-releases/${release.release_id}`, { method: "DELETE" }).catch(() => setError("تعذّر الحذف."));
    load();
  };
  const latest = releases.find((release) => release.active);

  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            الإدارة العليا <span>/</span> تحديثات التطبيق
          </p>
          <h1>
            تحديث بضغطة. <span>دون إعادة التثبيت.</span>
          </h1>
          <p className="page-description">
            ارفع ملف APK الجديد هنا. عند فتح التطبيق يظهر للمستعلم أن هناك تحديثًا، فيُنزَّل ويُثبَّت فوق النسخة الحالية مع
            الإبقاء على بياناته وتسجيل دخوله.
          </p>
        </div>
      </div>
      <ErrorMessage message={error} />
      {notice && <p className="success-message">{notice}</p>}
      <div className="finance-grid">
        <section className="glass panel">
          <div className="panel-heading">
            <h2>نشر إصدار جديد</h2>
            <Icon name="refresh" size={18} />
          </div>
          <form className="expense-form" onSubmit={(event) => void publish(event)}>
            <label className={`apk-drop${file ? " has-file" : ""}`}>
              <input ref={input} type="file" accept=".apk,application/vnd.android.package-archive" onChange={(event) => choose(event.target.files?.[0] ?? null)} />
              <Icon name="file" size={26} />
              <strong>{file ? file.name : "اختر ملف APK"}</strong>
              <small>{file ? megabytes(file.size) : "من مجلد releases بعد تشغيل build-apk.sh"}</small>
            </label>
            <div className="form-row">
              <label className="field">
                <span>رقم الإصدار</span>
                <input required dir="ltr" placeholder="1.2.0" value={draft.version_name} onChange={(event) => setDraft({ ...draft, version_name: event.target.value })} />
              </label>
              <label className="field">
                <span>كود الإصدار (يجب أن يزيد عن السابق)</span>
                <input
                  required
                  dir="ltr"
                  inputMode="numeric"
                  placeholder={latest ? String(latest.version_code + 1) : "1"}
                  value={draft.version_code}
                  onChange={(event) => setDraft({ ...draft, version_code: event.target.value.replace(/\D/g, "") })}
                />
              </label>
            </div>
            <label className="field">
              <span>ما الجديد؟ (يظهر للمستعلم)</span>
              <textarea rows={4} placeholder="مثال: كتابة الفراغات داخل عبارات الإقرار، والدخول بحساب Google." value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
            </label>
            <label className="price-toggle">
              <input type="checkbox" checked={draft.mandatory} onChange={(event) => setDraft({ ...draft, mandatory: event.target.checked })} />
              تحديث إجباري (لا يمكن استخدام التطبيق قبل تثبيته)
            </label>
            {progress !== null && (
              <div className="upload-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
                <i style={{ width: `${progress * 100}%` }} />
                <span>{number(Math.round(progress * 100))}٪</span>
              </div>
            )}
            <button className="btn btn-primary" disabled={!file || progress !== null || !draft.version_name || !draft.version_code}>
              <Icon name="refresh" size={16} />
              نشر التحديث
            </button>
          </form>
        </section>
        <section className="glass panel">
          <div className="panel-heading">
            <h2>الإصدار الحالي</h2>
          </div>
          {latest ? (
            <div className="release-hero">
              <b dir="ltr">v{latest.version_name}</b>
              <small dir="ltr">code {latest.version_code}</small>
              <p>{latest.notes || "بدون ملاحظات."}</p>
              <span className="hint">
                {megabytes(latest.size_bytes)} · {date(latest.created_at)}
                {latest.mandatory ? " · إجباري" : ""}
              </span>
            </div>
          ) : (
            <p className="hint">لم يُنشر أي إصدار بعد. التطبيقات المثبتة الآن ستعرض أول تحديث تنشره هنا.</p>
          )}
          <div className="hint release-help">
            <strong>مهم:</strong> يقبل Android التحديث فقط إذا وُقّع بنفس مفتاح النسخة المثبتة. ابنِ دائمًا بـ build-apk.sh
            على نفس الجهاز ومع نفس ملف key.properties.
          </div>
        </section>
      </div>
      <section className="glass panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>الإصدار</th>
                <th>ما الجديد</th>
                <th>الحجم</th>
                <th>نُشر</th>
                <th>إجباري</th>
                <th>متاح</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {releases.map((release) => (
                <tr key={release.release_id} className={release.active ? "" : "paid-row"}>
                  <td dir="ltr">
                    <strong>v{release.version_name}</strong> <small className="hint">({release.version_code})</small>
                  </td>
                  <td className="release-notes">{release.notes || "—"}</td>
                  <td>{megabytes(release.size_bytes)}</td>
                  <td>
                    {date(release.created_at)}
                    {release.created_by_name && <small className="hint block">{release.created_by_name}</small>}
                  </td>
                  <td>
                    <input type="checkbox" aria-label="إجباري" checked={release.mandatory} onChange={(event) => void change(release, { mandatory: event.target.checked })} />
                  </td>
                  <td>
                    <input type="checkbox" aria-label="متاح" checked={release.active} onChange={(event) => void change(release, { active: event.target.checked })} />
                  </td>
                  <td>
                    <a className="btn small ghost" href={`${API}/app/releases/${release.release_id}/apk`}>
                      تنزيل
                    </a>{" "}
                    <button className="btn small ghost" onClick={() => void remove(release)}>
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!releases.length && <p className="hint empty">لا توجد إصدارات منشورة.</p>}
      </section>
    </div>
  );
}
