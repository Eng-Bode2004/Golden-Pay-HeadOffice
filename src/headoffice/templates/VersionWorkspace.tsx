import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, apiBlob, ApiRequestError } from "../../api";
import { useAuth } from "../../auth";
import { date, ErrorMessage, Icon, number } from "../../components/ui";
import { FieldsEditor, type Block } from "./FieldsEditor";
import type { BoxInfo, BoxSpacingApi } from "./BoxSpacing";
import { Mapper, type PlaceOp } from "./Mapper";
import { allFields, type Binding, type Check, type Definition, type Inventory, SEVERITY, STATUS, type Version, warningId } from "./model";
import { EventList, type TemplateEvent } from "./TemplateDetail";

type Tab = "map" | "fields" | "preview" | "checks" | "diff" | "history";

interface Loaded {
  version: Version;
  file: { file_id: string; file_name: string; format: string; inventory: Inventory } | null;
  check: Check;
}

function PreviewPane({ versionId, dirty }: { versionId: string; dirty: boolean }) {
  const [mode, setMode] = useState<"labels" | "sample" | "blank">("labels");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stamp, setStamp] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setLoading(true);
    setError("");
    apiBlob(`/forms/admin/versions/${versionId}/preview?mode=${mode}`, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiRequestError && err.error.status === 503
          ? "لا يوجد محرك Word على الخادم لعرض تصميم العميل. ثبّت LibreOffice أو Microsoft Word."
          : "تعذّر بناء المعاينة.");
      })
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [versionId, mode, stamp]);
  return (
    <section className="glass panel tpl-preview">
      <div className="panel-heading">
        <div className="segmented">
          {(
            [
              ["labels", "أسماء الحقول"],
              ["sample", "بيانات تجريبية"],
              ["blank", "نموذج فارغ"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} className={mode === value ? "active" : ""} onClick={() => setMode(value)}>
              {label}
            </button>
          ))}
        </div>
        <button className="btn small ghost" onClick={() => setStamp((value) => value + 1)}>
          <Icon name="refresh" size={14} />
          تحديث
        </button>
      </div>
      {dirty && <p className="tpl-dirty-note">لديك تغييرات غير محفوظة؛ المعاينة تعرض آخر نسخة محفوظة.</p>}
      <ErrorMessage message={error} />
      <div className={`tpl-preview-frame ${loading ? "loading" : ""}`}>
        {url && !error && <iframe title="معاينة التقرير" src={url} />}
        {loading && (
          <div className="tpl-preview-loading">
            <span className="spinner" />
            يُبنى التقرير بتصميم العميل…
          </div>
        )}
      </div>
      <p className="hint">
        «بيانات تجريبية» تملأ كل حقل بقيمة مثال واضحة وتضيف الختم كما بعد الاعتماد. لا تُستخدم هذه القيم في أي استعلام حقيقي.
      </p>
    </section>
  );
}

function ChecksPane({
  loaded,
  acknowledged,
  readOnly,
  onAcknowledge,
}: {
  loaded: Loaded;
  acknowledged: string[];
  readOnly: boolean;
  onAcknowledge: (ids: string[]) => void;
}) {
  const { check, version, file } = loaded;
  const fields = new Map(allFields(version.definition).map((field) => [field.key, field.label]));
  return (
    <div className="tpl-checks">
      <section className={`glass panel tpl-check-card ${check.errors.length ? "bad" : "good"}`}>
        <div className="panel-heading">
          <h2>{check.errors.length ? `${number(check.errors.length)} مشكلة تمنع الإرسال للمراجعة` : "لا شيء يمنع المراجعة"}</h2>
          <Icon name={check.errors.length ? "lock" : "check"} size={18} />
        </div>
        <ul className="tpl-issues">
          {check.errors.map((issue, index) => (
            <li key={index} className="sev-block">
              {issue.message}
            </li>
          ))}
          {check.warnings.map((issue, index) => (
            <li key={`w${index}`} className="sev-review">
              {issue.message}
            </li>
          ))}
        </ul>
      </section>
      {version.warnings.length > 0 && (
        <section className="glass panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">من فحص الملف الأصلي{file ? ` · ${file.file_name}` : ""}</p>
              <h2>تنبيهات تحتاج تأكيدك</h2>
            </div>
          </div>
          <ul className="tpl-ack">
            {version.warnings.map((warning, index) => {
              const id = warningId(warning);
              const done = acknowledged.includes(id);
              return (
                <li key={index} className={`sev-${warning.severity} ${done ? "done" : ""}`}>
                  <label className="tpl-check">
                    <input
                      type="checkbox"
                      disabled={readOnly || warning.severity === "info"}
                      checked={done || warning.severity === "info"}
                      onChange={(event) => onAcknowledge(event.target.checked ? [...acknowledged, id] : acknowledged.filter((item) => item !== id))}
                    />
                    <span className="tpl-sev">{SEVERITY[warning.severity]}</span>
                    {warning.message}
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="hint">التأكيد يعني أنك راجعت الأمر في الربط: البيانات القديمة لن تُطبع، والعميل ونوع الاستعلام صحيحان.</p>
        </section>
      )}
      {file && (
        <section className="glass panel">
          <div className="panel-heading">
            <h2>كيف صُنّف الملف</h2>
            <a className="btn small ghost" href="#" onClick={(event) => {
              event.preventDefault();
              void apiBlob(`/forms/admin/files/${file.file_id}`).then((blob) => {
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = file.file_name;
                link.click();
              });
            }}>
              <Icon name="file" size={14} />
              الملف الأصلي
            </a>
          </div>
          <dl className="tpl-facts">
            <div>
              <dt>العميل</dt>
              <dd>{file.inventory.client.client_id ?? `غير مؤكد (المقترح: ${file.inventory.client.suggested ?? "—"})`}</dd>
              <small>{file.inventory.client.evidence.join(" · ") || "لا دليل من المحتوى"}</small>
            </div>
            <div>
              <dt>نوع الاستعلام</dt>
              <dd>{file.inventory.investigation_type.name ?? "—"}</dd>
              <small>{file.inventory.investigation_type.evidence.join(" · ")}</small>
            </div>
            <div>
              <dt>المراجعة</dt>
              <dd>{file.inventory.version.label}</dd>
              <small>{file.inventory.version.hints.join(" · ")}</small>
            </div>
          </dl>
        </section>
      )}
      {check.unplaced.length > 0 && (
        <section className="glass panel">
          <div className="panel-heading">
            <h2>حقول تُطبع في ملحق التقرير</h2>
          </div>
          <p className="hint">ليس لها مكان في تصميم العميل، فتُطبع في صفحة «ملحق التقرير» بدل أن تضيع.</p>
          <div className="tpl-chips">
            {check.unplaced.map((key) => (
              <span className="chip" key={key}>
                {fields.get(key) ?? key}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DiffPane({ versionId }: { versionId: string }) {
  const [data, setData] = useState<{ against: { version_no: number } | null; changes: { kind: string; key: string; label: string; details?: string[] }[] } | null>(null);
  useEffect(() => {
    api<NonNullable<typeof data>>(`/forms/admin/versions/${versionId}/diff`).then(setData).catch(() => setData({ against: null, changes: [] }));
  }, [versionId]);
  if (!data) return <div className="tpl-skeleton glass" />;
  const label: Record<string, string> = { added: "أُضيف", removed: "حُذف", changed: "تغيّر" };
  return (
    <section className="glass panel">
      <div className="panel-heading">
        <h2>{data.against ? `مقارنة بالإصدار ${number(data.against.version_no)}` : "لا يوجد إصدار سابق للمقارنة"}</h2>
      </div>
      {data.changes.length === 0 && data.against && <p className="hint">لا فروق في الحقول أو الربط.</p>}
      <ul className="tpl-diff">
        {data.changes.map((change) => (
          <li key={`${change.kind}-${change.key}`} className={`d-${change.kind}`}>
            <span>{label[change.kind]}</span>
            <strong>{change.label}</strong>
            {change.details && <small>{change.details.join("، ")}</small>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function VersionWorkspacePage() {
  const { versionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [layout, setLayout] = useState<{ html: string | null } | null>(null);
  const [definition, setDefinition] = useState<Definition | null>(null);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>("map");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [caseSources, setCaseSources] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<TemplateEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [returning, setReturning] = useState(false);
  const [returnNote, setReturnNote] = useState("");

  const load = useCallback(async () => {
    const data = await api<Loaded>(`/forms/admin/versions/${versionId}`);
    setLoaded(data);
    setDefinition(data.version.definition);
    setBindings(data.version.bindings);
    setAcknowledged(data.version.acknowledged ?? []);
    setDirty(false);
    if (data.version.layout_mode === "docx") {
      setLayout(await api<{ html: string | null }>(`/forms/admin/versions/${versionId}/layout`));
    } else setLayout({ html: null });
    api<{ events: TemplateEvent[] }>(`/forms/admin/events?version_id=${versionId}`).then((result) => setEvents(result.events)).catch(() => undefined);
  }, [versionId]);

  useEffect(() => {
    load().catch(() => setError("تعذّر تحميل الإصدار."));
    api<{ blocks: Block[]; case_sources: Record<string, string> }>("/forms/admin/blocks")
      .then((data) => {
        setBlocks(data.blocks);
        setCaseSources(data.case_sources);
      })
      .catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const version = loaded?.version;
  const readOnly = version?.status !== "draft";
  const placed = useMemo(() => new Set(bindings.map((binding) => binding.source?.slice(8) ?? "")), [bindings]);

  const perform = async (task: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setError("");
    setDetails([]);
    setNotice("");
    try {
      await task();
      if (success) setNotice(success);
      await load();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
        const list = err.error.details as unknown;
        if (Array.isArray(list)) setDetails(list.map((item: { message?: string }) => item.message ?? String(item)));
      } else setError("تعذّر تنفيذ الإجراء.");
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    perform(
      () =>
        api(`/forms/admin/versions/${versionId}`, {
          method: "PATCH",
          body: JSON.stringify({ definition, bindings, acknowledged }),
        }),
      "حُفظت المسودة.",
    );
  /** Drag and drop in the mapper: saves pending edits first, then moves, adds or removes a point. */
  const place = async (op: PlaceOp): Promise<string | null> => {
    setError("");
    setNotice("");
    try {
      if (dirty) {
        await api(`/forms/admin/versions/${versionId}`, {
          method: "PATCH",
          body: JSON.stringify({ definition, bindings, acknowledged }),
        });
      }
      const data = await api<{ anchor: string }>(`/forms/admin/versions/${versionId}/places`, {
        method: "POST",
        body: JSON.stringify(op),
      });
      await load();
      setNotice(
        op.op === "create"
          ? op.kind === "statement" && op.end !== undefined
            ? "أصبحت الجملة المحددة عبارة إقرار، ولها حقل إقرار جديد في «نقاط مضافة يدويًا». تُطبع كما هي فقط إذا أكدها المستعلم مع الدليل المطلوب؛ راجع الدليل من اللوحة الجانبية."
            : op.kind === "statement"
            ? "أُضيفت عبارة الإقرار. اربطها بحقل إقرار من اللوحة الجانبية، أو أنشئ حقلًا جديدًا لها."
            : op.kind === "checkbox"
              ? "أُضيف مربع الاختيار. اربطه بسؤال واختر الإجابة التي تعلّمه."
              : "أُضيفت النقطة. اربطها بحقل من اللوحة الجانبية."
          : op.op === "move"
            ? "نُقلت النقطة إلى مكانها الجديد."
            : "حُذفت النقطة.",
      );
      return data.anchor;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "تعذّر تعديل النقطة.");
      return null;
    }
  };
  /** Spacing of drawn checkboxes: read, move (saving pending edits first) and preview. */
  const boxes: BoxSpacingApi = {
    list: async (anchor) =>
      (await api<{ boxes: BoxInfo[] }>(`/forms/admin/versions/${versionId}/boxes?anchor=${encodeURIComponent(anchor)}`)).boxes,
    move: async (moves) => {
      setError("");
      setNotice("");
      try {
        if (dirty) {
          await api(`/forms/admin/versions/${versionId}`, {
            method: "PATCH",
            body: JSON.stringify({ definition, bindings, acknowledged }),
          });
        }
        await api(`/forms/admin/versions/${versionId}/boxes`, { method: "POST", body: JSON.stringify({ moves }) });
        await load();
        return true;
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "تعذّر تحريك المربعات.");
        return false;
      }
    },
    preview: (anchor, signal) => apiBlob(`/forms/admin/versions/${versionId}/boxes/preview?anchor=${encodeURIComponent(anchor)}`, signal),
  };
  const post = (path: string, body: object = {}, success?: string) =>
    perform(() => api(`/forms/admin/versions/${versionId}/${path}`, { method: "POST", body: JSON.stringify(body) }), success);

  if (!loaded || !version || !definition) {
    return (
      <div className="page-enter tpl-page">
        <ErrorMessage message={error} />
        {!error && <div className="tpl-skeleton glass tall" />}
      </div>
    );
  }

  const status = STATUS[version.status];
  const mine = version.submitted_by === user?.user_id || version.created_by === user?.user_id;
  const tabs: [Tab, string, number?][] = [
    ["map", "الربط المرئي"],
    ["fields", "الحقول", allFields(definition).length],
    ["preview", "معاينة PDF"],
    ["checks", "التحقق", loaded.check.errors.length || undefined],
    ["diff", "الفروقات"],
    ["history", "السجل"],
  ];

  return (
    <div className="page-enter tpl-page tpl-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <Link to="/templates">القوالب والتقارير</Link> <span>/</span>{" "}
            <Link to={`/templates/${version.template_id}`}>{version.client_name}</Link> <span>/</span> الإصدار {number(version.version_no)}
          </p>
          <h1>
            {version.title} <span className={`tpl-status s-${status.tone} big`}>{status.label}</span>
          </h1>
          <p className="page-description">
            {version.layout_mode === "docx" ? "يُطبع التقرير بتصميم ملف العميل نفسه." : "يُطبع التقرير بالتصميم الموحّد لجولدن باي."}{" "}
            {version.change_note}
          </p>
        </div>
        <div className="heading-actions tpl-actions">
          {version.status === "draft" && (
            <>
              <button
                className="btn ghost"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("حذف هذه المسودة نهائيًا؟")) {
                    void perform(async () => {
                      await api(`/forms/admin/versions/${versionId}`, { method: "DELETE" });
                      navigate(`/templates/${version.template_id}`);
                    });
                  }
                }}
              >
                حذف المسودة
              </button>
              <button className="btn" disabled={busy || !dirty} onClick={() => void save()}>
                <Icon name="check" size={16} />
                حفظ
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || dirty}
                title={dirty ? "احفظ التغييرات أولًا" : undefined}
                onClick={() => void post("submit", {}, "أُرسل للمراجعة. يعتمده عضو آخر في الإدارة العليا.")}
              >
                <Icon name="arrow" size={16} />
                إرسال للمراجعة
              </button>
            </>
          )}
          {version.status === "in_review" && (
            <>
              {mine && (
                <button className="btn ghost" disabled={busy} onClick={() => void post("withdraw", {}, "سُحب الإصدار وعاد مسودة.")}>
                  سحب
                </button>
              )}
              <button className="btn" disabled={busy} onClick={() => setReturning(true)}>
                إعادة للتعديل
              </button>
              <button className="btn" disabled={busy} onClick={() => void post("approve", {}, "اعتُمد الإصدار.")}>
                اعتماد فقط
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void post("approve", { activate: true }, "اعتُمد وفُعّل. الاستعلامات الجديدة تستخدمه الآن.")}>
                <Icon name="shield" size={16} />
                اعتماد وتفعيل
              </button>
            </>
          )}
          {version.status === "approved" && (
            <button className="btn btn-primary" disabled={busy} onClick={() => void post("activate", {}, "فُعّل الإصدار.")}>
              <Icon name="check" size={16} />
              تفعيل للاستعلامات الجديدة
            </button>
          )}
          {["approved", "active", "retired"].includes(version.status) && (
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const data = await api<{ version: { version_id: string } }>(`/forms/admin/versions/${versionId}/clone`, { method: "POST", body: "{}" });
                  navigate(`/templates/versions/${data.version.version_id}`);
                })
              }
            >
              <Icon name="plus" size={16} />
              نسخة جديدة للتعديل
            </button>
          )}
        </div>
      </div>

      <div className="tpl-meta glass">
        <span>
          <Icon name="users" size={14} /> أعدّه {version.created_by_name ?? "النظام"} · {date(version.created_at)}
        </span>
        {version.submitted_at && (
          <span>
            <Icon name="arrow" size={14} /> أرسله {version.submitted_by_name ?? "—"} · {date(version.submitted_at)}
          </span>
        )}
        {version.reviewed_at && (
          <span>
            <Icon name="shield" size={14} /> راجعه {version.reviewed_by_name ?? "—"} · {date(version.reviewed_at)}
          </span>
        )}
        {version.content_hash && (
          <span className="tpl-hash" title={`بصمة المحتوى المعتمد: ${version.content_hash}`}>
            <Icon name="key" size={14} /> {version.content_hash.slice(0, 16)}
          </span>
        )}
        {readOnly && (
          <span className="tpl-locked">
            <Icon name="lock" size={14} /> {version.status === "in_review" ? "مقفل أثناء المراجعة" : "ثابت لا يتغير"}
          </span>
        )}
      </div>
      {version.review_note && version.status === "draft" && (
        <p className="tpl-review-banner">
          <Icon name="message" size={16} /> ملاحظة المراجع: {version.review_note}
        </p>
      )}
      <ErrorMessage message={error} />
      {details.length > 0 && (
        <ul className="tpl-issues inline">
          {details.map((item, index) => (
            <li key={index} className="sev-block">
              {item}
            </li>
          ))}
        </ul>
      )}
      {notice && <p className="success-message">{notice}</p>}

      <div className="tpl-tabs" role="tablist">
        {tabs.map(([value, label, badge]) => (
          <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>
            {label}
            {badge ? <b>{number(badge)}</b> : null}
          </button>
        ))}
        {dirty && <span className="tpl-unsaved">● تغييرات غير محفوظة</span>}
      </div>

      {tab === "map" &&
        (version.layout_mode === "docx" && layout?.html ? (
          <Mapper
            html={layout.html}
            slots={version.slots}
            definition={definition}
            bindings={bindings}
            caseSources={caseSources}
            readOnly={readOnly}
            onBindings={(next) => {
              setBindings(next);
              setDirty(true);
            }}
            onDefinition={(next) => {
              setDefinition(next);
              setDirty(true);
            }}
            onPlace={readOnly ? undefined : place}
            boxes={boxes}
            lockedReason={
              version.status === "in_review"
                ? "هذا الإصدار مُرسل للمراجعة ومقفل، فلا تتحرك نقاطه. لتعديله: اضغط «إعادة للتعديل» فيعود مسودة، ثم حرّك النقاط وأعد إرساله. ويعتمده بعد ذلك عضو آخر في الإدارة العليا."
                : "هذا الإصدار معتمد وثابت لا يتغير. اضغط «نسخة جديدة للتعديل» لتحريك النقاط في نسخة جديدة."
            }
          />
        ) : (
          <section className="glass panel tpl-standard-note">
            <Icon name="file" size={26} />
            <h2>هذا الإصدار يستخدم التصميم الموحّد لجولدن باي</h2>
            <p>لا يوجد ملف تصميم للعميل في هذا الإصدار. ارفع ملف Word المعتمد من العميل لإنشاء إصدار يطابق تصميمه.</p>
            <Link className="btn btn-primary" to={`/templates/${version.template_id}`}>
              رفع ملف العميل
            </Link>
          </section>
        ))}
      {tab === "fields" && (
        <FieldsEditor
          definition={definition}
          readOnly={readOnly}
          blocks={blocks}
          placed={version.layout_mode === "docx" ? placed : new Set(allFields(definition).map((field) => field.key))}
          onChange={(next) => {
            setDefinition(next);
            setDirty(true);
          }}
        />
      )}
      {tab === "preview" && <PreviewPane versionId={version.version_id} dirty={dirty} />}
      {tab === "checks" && (
        <ChecksPane
          loaded={loaded}
          acknowledged={acknowledged}
          readOnly={readOnly}
          onAcknowledge={(ids) => {
            setAcknowledged(ids);
            setDirty(true);
          }}
        />
      )}
      {tab === "diff" && <DiffPane versionId={version.version_id} />}
      {tab === "history" && (
        <section className="glass panel">
          <EventList events={events} />
        </section>
      )}

      {returning && (
        <div className="drawer-root" dir={document.documentElement.dir}>
          <button className="drawer-scrim" aria-label="إغلاق" onClick={() => setReturning(false)} />
          <section className="review-drawer tpl-drawer small" role="dialog" aria-modal="true">
            <header className="drawer-head">
              <h2>إعادة الإصدار للتعديل</h2>
              <button className="icon-button" onClick={() => setReturning(false)} aria-label="إغلاق">
                <Icon name="close" />
              </button>
            </header>
            <div className="drawer-body">
              <label className="field">
                <span>ما الذي يجب تعديله؟</span>
                <textarea rows={5} value={returnNote} onChange={(event) => setReturnNote(event.target.value)} />
              </label>
            </div>
            <footer className="drawer-foot">
              <div className="drawer-actions">
                <button className="btn ghost" onClick={() => setReturning(false)}>
                  إلغاء
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!returnNote.trim() || busy}
                  onClick={() => {
                    setReturning(false);
                    void post("return", { note: returnNote.trim() }, "أُعيد الإصدار لمُعدّه مع ملاحظتك.");
                  }}
                >
                  إعادة مع الملاحظة
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
