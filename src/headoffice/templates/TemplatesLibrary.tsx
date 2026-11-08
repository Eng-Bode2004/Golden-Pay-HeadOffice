import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiRequestError } from "../../api";
import { date, Empty, ErrorMessage, Icon, number, type IconName } from "../../components/ui";
import { type Inventory, SEVERITY, STATUS, type VersionStatus } from "./model";

interface TemplateRow {
  template_id: string;
  title: string;
  client_id: string;
  client_name: string;
  client_type: string;
  investigation_type: string | null;
  type_name: string | null;
  active: boolean;
  active_version_no: number | null;
  active_layout: "docx" | "standard" | null;
  activated_at: string | null;
  versions: number;
  pending: { version_id: string; version_no: number; status: VersionStatus; layout_mode: string; updated_at: string; warnings: number }[] | null;
  client_confidence: string | null;
}
interface Library {
  templates: TemplateRow[];
  counts: { in_review: number; drafts: number; active: number; active_docx: number };
  types: { code: string; name: string }[];
}
interface FileRow {
  file_id: string;
  file_name: string;
  format: string;
  size: number;
  source_path: string | null;
  inventory: Inventory;
  created_at: string;
  versions: { version_id: string; template_id: string; version_no: number; status: VersionStatus; title: string }[] | null;
}

type Filter = "all" | "review" | "drafts" | "client_layout";

function Confidence({ value }: { value: number }) {
  const tone = value >= 0.7 ? "high" : value >= 0.4 ? "mid" : "low";
  return (
    <span className={`confidence ${tone}`} title={`ثقة التصنيف ${Math.round(value * 100)}٪`}>
      <i style={{ width: `${Math.max(6, Math.round(value * 100))}%` }} />
    </span>
  );
}

export function UploadDrawer({
  onClose,
  types,
  clients,
  presetTemplate,
}: {
  onClose: () => void;
  types: { code: string; name: string }[];
  clients: { client_id: string; name: string }[];
  presetTemplate?: { template_id: string; title: string } | null;
}) {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    file: FileRow;
    duplicate: boolean;
    matches: { template_id: string; title: string; client_name: string; active_version_no: number | null }[];
  } | null>(null);
  const [target, setTarget] = useState<string>(presetTemplate?.template_id ?? "new");
  const [client, setClient] = useState("");
  const [type, setType] = useState("");
  const [title, setTitle] = useState("");

  const upload = async (chosen: File) => {
    setFile(chosen);
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", chosen);
    try {
      const data = await api<NonNullable<typeof result>>("/forms/admin/files", { method: "POST", body: form });
      setResult(data);
      const inventory = data.file.inventory;
      setClient(inventory.client.client_id ?? inventory.client.suggested ?? "");
      setType(inventory.investigation_type.code ?? "");
      setTitle(inventory.title || chosen.name.replace(/\.[^.]+$/, ""));
      if (!presetTemplate && data.matches.length === 1) setTarget(data.matches[0]!.template_id);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "تعذّر رفع الملف.");
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const createDraft = async () => {
    if (!result) return;
    setBusy(true);
    setError("");
    try {
      const body =
        target === "new"
          ? { file_id: result.file.file_id, client_id: client, investigation_type: type, title }
          : { file_id: result.file.file_id, template_id: target };
      const data = await api<{ version: { version_id: string } }>("/forms/admin/versions", { method: "POST", body: JSON.stringify(body) });
      navigate(`/templates/versions/${data.version.version_id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "تعذّر إنشاء المسودة.");
      setBusy(false);
    }
  };

  const inventory = result?.file.inventory;
  return (
    <div className="drawer-root" dir={document.documentElement.dir}>
      <button className="drawer-scrim" aria-label="إغلاق" onClick={onClose} />
      <section className="review-drawer tpl-drawer" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <header className="drawer-head">
          <div>
            <p className="eyebrow">{presetTemplate ? presetTemplate.title : "قالب جديد أو إصدار جديد"}</p>
            <h2 id="upload-title">رفع قالب العميل</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" />
          </button>
        </header>
        <div className="drawer-body">
          {!result && (
            <label
              className={`tpl-dropzone ${drag ? "drag" : ""} ${busy ? "busy" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDrag(false);
                const dropped = event.dataTransfer.files[0];
                if (dropped) void upload(dropped);
              }}
            >
              <input
                type="file"
                accept=".docx,.doc,.pdf"
                onChange={(event) => {
                  const chosen = event.target.files?.[0];
                  if (chosen) void upload(chosen);
                }}
              />
              <span className="tpl-dropzone-icon">
                <Icon name="file" size={28} />
              </span>
              <strong>{busy ? `جارٍ فحص ${file?.name ?? "الملف"}…` : "اسحب ملف Word أو PDF هنا، أو اختره"}</strong>
              <small>DOCX أو DOC أو PDF حتى 25 ميجابايت. يُحفظ الأصل كما هو ولا يُعدَّل أبدًا.</small>
            </label>
          )}
          <ErrorMessage message={error} />
          {inventory && result && (
            <>
              <div className="tpl-classify glass">
                <div className="tpl-classify-head">
                  <Icon name="search" size={18} />
                  <div>
                    <strong>{inventory.title || result.file.file_name}</strong>
                    <small>
                      {result.file.file_name} · {inventory.version.label}
                      {result.duplicate ? " · محفوظ من قبل (نفس المحتوى)" : ""}
                    </small>
                  </div>
                </div>
                <dl className="tpl-facts">
                  <div>
                    <dt>العميل</dt>
                    <dd>
                      {inventory.client.client_id ? (
                        <>
                          {clients.find((item) => item.client_id === inventory.client.client_id)?.name ?? inventory.client.client_id}
                          <Confidence value={inventory.client.confidence} />
                        </>
                      ) : (
                        <span className="tpl-uncertain">لم يُعرف من المحتوى — أكّده يدويًا</span>
                      )}
                    </dd>
                    <small>{inventory.client.evidence.join(" · ") || "لا يوجد اسم أو شعار للعميل داخل الملف"}</small>
                  </div>
                  <div>
                    <dt>نوع الاستعلام</dt>
                    <dd>
                      {inventory.investigation_type.name ?? "غير معروف"}
                      <Confidence value={inventory.investigation_type.confidence} />
                    </dd>
                    <small>{inventory.investigation_type.evidence.join(" · ")}</small>
                  </div>
                  <div>
                    <dt>المحتوى</dt>
                    <dd>
                      {number(inventory.stats.tables)} جدول · {number(inventory.stats.checkboxes)} مربع اختيار ·{" "}
                      {number(inventory.stats.images)} صورة
                    </dd>
                    <small>الخطوط: {inventory.stats.fonts.slice(0, 4).join("، ") || "—"}</small>
                  </div>
                </dl>
                {inventory.warnings.length > 0 && (
                  <ul className="tpl-warnings">
                    {inventory.warnings.map((warning, index) => (
                      <li key={index} className={`sev-${warning.severity}`}>
                        <span>{SEVERITY[warning.severity]}</span>
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="stack">
                <h3>أين يذهب هذا الملف؟</h3>
                <div className="tpl-targets">
                  {result.matches.map((match) => (
                    <label key={match.template_id} className={target === match.template_id ? "on" : ""}>
                      <input type="radio" name="target" checked={target === match.template_id} onChange={() => setTarget(match.template_id)} />
                      <span>
                        <strong>إصدار جديد من «{match.title}»</strong>
                        <small>
                          {match.client_name}
                          {match.active_version_no ? ` · المفعّل الآن: الإصدار ${number(match.active_version_no)}` : ""}
                        </small>
                      </span>
                    </label>
                  ))}
                  {presetTemplate && !result.matches.some((match) => match.template_id === presetTemplate.template_id) && (
                    <label className={target === presetTemplate.template_id ? "on" : ""}>
                      <input type="radio" name="target" checked={target === presetTemplate.template_id} onChange={() => setTarget(presetTemplate.template_id)} />
                      <span>
                        <strong>إصدار جديد من «{presetTemplate.title}»</strong>
                        <small>القالب الذي فتحته</small>
                      </span>
                    </label>
                  )}
                  <label className={target === "new" ? "on" : ""}>
                    <input type="radio" name="target" checked={target === "new"} onChange={() => setTarget("new")} />
                    <span>
                      <strong>قالب جديد</strong>
                      <small>لعميل أو نوع استعلام ليس له قالب بعد</small>
                    </span>
                  </label>
                </div>
                {target === "new" && (
                  <div className="form-row tpl-new-fields">
                    <label className="field">
                      <span>العميل</span>
                      <select value={client} onChange={(event) => setClient(event.target.value)}>
                        <option value="">اختر العميل</option>
                        {clients.map((item) => (
                          <option key={item.client_id} value={item.client_id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>نوع الاستعلام</span>
                      <select value={type} onChange={(event) => setType(event.target.value)}>
                        <option value="">اختر النوع</option>
                        {types.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field wide">
                      <span>اسم القالب</span>
                      <input value={title} onChange={(event) => setTitle(event.target.value)} />
                    </label>
                  </div>
                )}
                <p className="hint">
                  تُنشأ مسودة تقترح الحقول وأماكنها في تصميم العميل. لا تُستخدم في أي استعلام قبل مراجعتها واعتمادها من الإدارة العليا.
                </p>
              </div>
            </>
          )}
        </div>
        {result && (
          <footer className="drawer-foot">
            <div className="drawer-actions">
              <button className="btn ghost" onClick={onClose}>
                إلغاء
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || (target === "new" && (!client || !type || !title.trim()))}
                onClick={() => void createDraft()}
              >
                <Icon name="arrow" size={16} />
                {busy ? "جارٍ تجهيز المسودة…" : "إنشاء مسودة والانتقال للربط"}
              </button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}

function ArchiveTable({ files, clients }: { files: FileRow[]; clients: Map<string, string> }) {
  const [query, setQuery] = useState("");
  const shown = files.filter((file) => `${file.file_name} ${file.source_path} ${file.inventory.title}`.includes(query.trim()));
  return (
    <section className="glass panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">الأرشيف الأصلي · {number(files.length)} ملف</p>
          <h2>كل ملف، وما عرفناه عنه من محتواه</h2>
        </div>
        <label className="search-field tpl-search">
          <Icon name="search" size={16} />
          <input placeholder="ابحث باسم الملف أو المجلد" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>
      <div className="table-wrap">
        <table className="table tpl-archive">
          <thead>
            <tr>
              <th>الملف</th>
              <th>العميل (من المحتوى)</th>
              <th>نوع الاستعلام</th>
              <th>المراجعة</th>
              <th>تنبيهات</th>
              <th>الإصدارات</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((file) => {
              const inv = file.inventory;
              const blocking = inv.warnings.filter((warning) => warning.severity === "block").length;
              return (
                <tr key={file.file_id}>
                  <td>
                    <strong className="tpl-file">
                      <span className={`tpl-format f-${file.format}`}>{file.format.toUpperCase()}</span>
                      {inv.title || file.file_name}
                    </strong>
                    <small>{file.source_path ? `${file.source_path}/` : ""}{file.file_name}</small>
                  </td>
                  <td>
                    {inv.client.client_id ? (
                      <span className="tpl-client-cell">
                        {clients.get(inv.client.client_id) ?? inv.client.client_id}
                        <Confidence value={inv.client.confidence} />
                      </span>
                    ) : (
                      <span className="tpl-uncertain">
                        غير مؤكد{inv.client.suggested ? ` · المقترح: ${clients.get(inv.client.suggested) ?? inv.client.suggested}` : ""}
                      </span>
                    )}
                  </td>
                  <td>{inv.investigation_type.name ?? "—"}</td>
                  <td>
                    <small>{inv.version.label}</small>
                  </td>
                  <td>
                    <span className="tpl-chips">
                      {blocking > 0 && <span className="chip sev-block">{number(blocking)} يمنع الاعتماد</span>}
                      {inv.warnings
                        .filter((warning) => warning.severity !== "block")
                        .slice(0, 3)
                        .map((warning, index) => (
                          <span className={`chip sev-${warning.severity}`} key={index} title={warning.message}>
                            {warning.message.length > 28 ? `${warning.message.slice(0, 26)}…` : warning.message}
                          </span>
                        ))}
                    </span>
                  </td>
                  <td>
                    {(file.versions ?? []).map((version) => (
                      <Link key={version.version_id} to={`/templates/versions/${version.version_id}`} className={`tpl-status s-${STATUS[version.status].tone}`}>
                        ع{number(version.version_no)} · {STATUS[version.status].label}
                      </Link>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TemplatesLibraryPage() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [clients, setClients] = useState<{ client_id: string; name: string }[]>([]);
  const [tab, setTab] = useState<"templates" | "archive">("templates");
  const [filter, setFilter] = useState<Filter>("all");
  const [client, setClient] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Library>("/forms/admin/library")
      .then(setLibrary)
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : "تعذّر تحميل القوالب."));
    api<{ clients: { client_id: string; name: string }[] }>("/forms/clients")
      .then((data) => setClients(data.clients))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (tab === "archive" && !files) {
      api<{ files: FileRow[] }>("/forms/admin/files")
        .then((data) => setFiles(data.files))
        .catch(() => setError("تعذّر تحميل الأرشيف."));
    }
  }, [tab, files]);

  const clientNames = useMemo(() => new Map(clients.map((item) => [item.client_id, item.name])), [clients]);
  const templates = (library?.templates ?? []).filter((row) => {
    if (client && row.client_id !== client) return false;
    if (filter === "review") return row.pending?.some((item) => item.status === "in_review" || item.status === "approved");
    if (filter === "drafts") return row.pending?.some((item) => item.status === "draft");
    if (filter === "client_layout") return row.active_layout === "docx";
    return true;
  });
  const groups = useMemo(() => {
    const map = new Map<string, TemplateRow[]>();
    for (const row of templates) map.set(row.client_name, [...(map.get(row.client_name) ?? []), row]);
    return [...map];
  }, [templates]);
  const counts = library?.counts;
  const cards: { label: string; value: number | undefined; hint: string; icon: IconName }[] = [
    { label: "قوالب مفعّلة", value: counts?.active, hint: "تستخدمها الاستعلامات الجديدة الآن", icon: "check" },
    { label: "بتصميم العميل نفسه", value: counts?.active_docx, hint: "تقرير يطابق ملف Word المعتمد", icon: "file" },
    { label: "بانتظار المراجعة", value: counts?.in_review, hint: "تعتمدها الإدارة العليا", icon: "shield" },
    { label: "مسودات", value: counts?.drafts, hint: "مستوردة أو قيد التعديل", icon: "history" },
  ];

  return (
    <div className="page-enter tpl-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            الإدارة العليا <span>/</span> القوالب والتقارير
          </p>
          <h1>
            تقرير كل عميل. <span>بتصميمه هو.</span>
          </h1>
          <p className="page-description">
            ارفع نماذج البنوك والشركات، اربط حقولها بالمكان الصحيح في التصميم، وراجع كل إصدار قبل أن يصل إلى المستعلمين.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setUploading(true)}>
          <Icon name="plus" size={16} />
          رفع قالب
        </button>
      </div>
      <ErrorMessage message={error} />

      <div className="metrics-grid">
        {cards.map((card) => (
          <article className="glass metric" key={card.label}>
            <div className="metric-top">
              <span>{card.label}</span>
              <span className="metric-icon">
                <Icon name={card.icon} />
              </span>
            </div>
            <strong>{card.value === undefined ? "—" : number(card.value)}</strong>
            <p>
              <span className="small-indicator" />
              {card.hint}
            </p>
          </article>
        ))}
      </div>

      <div className="tpl-toolbar">
        <div className="segmented" role="tablist">
          <button className={tab === "templates" ? "active" : ""} onClick={() => setTab("templates")}>
            القوالب
          </button>
          <button className={tab === "archive" ? "active" : ""} onClick={() => setTab("archive")}>
            الأرشيف الأصلي
          </button>
        </div>
        {tab === "templates" && (
          <div className="segmented">
            {(
              [
                ["all", "الكل"],
                ["review", "تحتاج قرارًا"],
                ["drafts", "مسودات"],
                ["client_layout", "بتصميم العميل"],
              ] as [Filter, string][]
            ).map(([value, label]) => (
              <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "templates" && (
        <>
          <div className="tpl-client-chips">
            <button className={client === null ? "on" : ""} onClick={() => setClient(null)}>
              كل العملاء
            </button>
            {[...new Map((library?.templates ?? []).map((row) => [row.client_id, row.client_name]))].map(([id, name]) => (
              <button key={id} className={client === id ? "on" : ""} onClick={() => setClient(id)}>
                {name}
              </button>
            ))}
          </div>
          {!library && !error && <div className="tpl-skeleton glass" />}
          {library && !groups.length && <Empty>لا توجد قوالب تطابق هذا الاختيار.</Empty>}
          {groups.map(([name, rows]) => (
            <section className="tpl-group" key={name}>
              <h2>
                {name}
                <small>{number(rows.length)} قالب</small>
              </h2>
              <div className="tpl-grid">
                {rows.map((row) => {
                  const pending = row.pending ?? [];
                  const review = pending.find((item) => item.status === "in_review" || item.status === "approved");
                  const draft = pending.find((item) => item.status === "draft");
                  return (
                    <Link to={`/templates/${row.template_id}`} className={`glass tpl-card ${row.active ? "" : "off"}`} key={row.template_id}>
                      <div className="tpl-card-top">
                        <span className="tpl-type">{row.type_name ?? "غير مصنف"}</span>
                        <span className={`tpl-switch-dot ${row.active ? "on" : ""}`} title={row.active ? "مفعّل" : "متوقف"} />
                      </div>
                      <h3>{row.title}</h3>
                      <div className="tpl-card-version">
                        {row.active_version_no ? (
                          <>
                            <span className="tpl-version-no">الإصدار {number(row.active_version_no)}</span>
                            <span className={`tpl-layout ${row.active_layout}`}>
                              {row.active_layout === "docx" ? "تصميم العميل" : "التصميم الموحّد"}
                            </span>
                          </>
                        ) : (
                          <span className="tpl-uncertain">لا إصدار معتمد</span>
                        )}
                      </div>
                      <div className="tpl-card-foot">
                        {review && <span className={`tpl-status s-${STATUS[review.status].tone}`}>{STATUS[review.status].label} · ع{number(review.version_no)}</span>}
                        {draft && (
                          <span className="tpl-status s-draft">
                            مسودة ع{number(draft.version_no)}
                            {draft.warnings ? ` · ${number(draft.warnings)} تنبيه` : ""}
                          </span>
                        )}
                        {!review && !draft && row.activated_at && <small>فُعّل {date(row.activated_at)}</small>}
                        <Icon name="chevron" size={16} className="tpl-go" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      {tab === "archive" && (files ? <ArchiveTable files={files} clients={clientNames} /> : <div className="tpl-skeleton glass" />)}

      {uploading && library && (
        <UploadDrawer onClose={() => setUploading(false)} types={library.types} clients={clients} />
      )}
    </div>
  );
}
