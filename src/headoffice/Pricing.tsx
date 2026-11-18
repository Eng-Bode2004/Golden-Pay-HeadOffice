import { useCallback, useEffect, useState } from "react";
import { api, ApiRequestError } from "../api";
import { money } from "../components/Finance";
import { ErrorMessage, Icon } from "../components/ui";

export interface ServiceLevel {
  code: string;
  name_ar: string;
  name_en: string;
  delivery_label: string;
  delivery_hours: number | null;
  accept_minutes: number;
  client_price: number;
  investigator_price: number;
  active: boolean;
}

function LevelCard({ level, onSaved }: { level: ServiceLevel; onSaved: (next: ServiceLevel) => void }) {
  const [draft, setDraft] = useState(level);
  const [unit, setUnit] = useState<"minutes" | "hours">(
    level.accept_minutes >= 60 && level.accept_minutes % 60 === 0 ? "hours" : "minutes",
  );
  const acceptValue = unit === "hours" ? draft.accept_minutes / 60 : draft.accept_minutes;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const changed = JSON.stringify(draft) !== JSON.stringify(level);
  const profit = draft.client_price - draft.investigator_price;

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { level: saved } = await api<{ level: ServiceLevel }>(`/investigations/service-levels/${level.code}`, {
        method: "PATCH",
        body: JSON.stringify({
          name_ar: draft.name_ar,
          delivery_label: draft.delivery_label,
          ...(level.code === "scheduled" ? {} : { delivery_hours: draft.delivery_hours }),
          accept_minutes: draft.accept_minutes,
          client_price: draft.client_price,
          investigator_price: draft.investigator_price,
          active: draft.active,
        }),
      });
      onSaved(saved);
      setDraft(saved);
      setMessage("تم الحفظ. تسري الأسعار الجديدة على الاستعلامات الجديدة فقط.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "تعذّر حفظ الأسعار.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={draft.active ? "glass price-card" : "glass price-card inactive"}>
      <header>
        <div>
          <input
            className="price-title"
            aria-label="اسم النوع"
            value={draft.name_ar}
            onChange={(event) => setDraft({ ...draft, name_ar: event.target.value })}
          />
          <small dir="ltr">{level.name_en}</small>
        </div>
        <label className="price-toggle">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
          />
          متاح
        </label>
      </header>
      <div className="form-row">
        <label className="field">
          <span>مدة التسليم (للعرض)</span>
          <input
            value={draft.delivery_label}
            onChange={(event) => setDraft({ ...draft, delivery_label: event.target.value })}
          />
        </label>
        <label className="field">
          <span>الموعد النهائي بالساعات</span>
          <input
            type="number"
            min={1}
            disabled={level.code === "scheduled"}
            placeholder={level.code === "scheduled" ? "يُحدد لكل استعلام" : ""}
            value={draft.delivery_hours ?? ""}
            onChange={(event) => setDraft({ ...draft, delivery_hours: Number(event.target.value) || null })}
          />
        </label>
      </div>
      <div className="field accept-window">
        <span>مهلة القبول قبل التحويل لمستعلم آخر</span>
        <div className="accept-input">
          <input
            type="number"
            min={1}
            aria-label="مهلة القبول"
            value={acceptValue}
            onChange={(event) => {
              const value = Math.max(1, Number(event.target.value) || 1);
              setDraft({ ...draft, accept_minutes: Math.round(unit === "hours" ? value * 60 : value) });
            }}
          />
          <div className="segmented">
            <button type="button" className={unit === "minutes" ? "active" : ""} onClick={() => setUnit("minutes")}>
              دقيقة
            </button>
            <button type="button" className={unit === "hours" ? "active" : ""} onClick={() => setUnit("hours")}>
              ساعة
            </button>
          </div>
        </div>
        <small className="field-hint">
          إن لم يقبل المستعلم خلال هذه المدة ينتقل الاستعلام تلقائياً إلى الأقرب: القرية التابعة ثم الأم ثم الوحدة
          المحلية ثم المركز ثم المحافظة.
        </small>
      </div>
      <div className="form-row">
        <label className="field">
          <span>سعر العميل (البنك / الشركة)</span>
          <input
            type="number"
            min={0}
            value={draft.client_price}
            onChange={(event) => setDraft({ ...draft, client_price: Number(event.target.value) || 0 })}
          />
        </label>
        <label className="field">
          <span>أجر المستعلم</span>
          <input
            type="number"
            min={0}
            value={draft.investigator_price}
            onChange={(event) => setDraft({ ...draft, investigator_price: Number(event.target.value) || 0 })}
          />
        </label>
      </div>
      <div className={profit < 0 ? "price-margin negative" : "price-margin"}>
        <span>ربح الشركة لكل استعلام</span>
        <strong>{money(profit)}</strong>
      </div>
      <ErrorMessage message={error} />
      {message && <p className="hint">{message}</p>}
      <button className="btn btn-primary btn-block" disabled={!changed || busy} onClick={() => void save()}>
        {busy ? "جارٍ الحفظ…" : "حفظ"}
      </button>
    </article>
  );
}

interface Client {
  client_id: string;
  name: string;
  client_type: string | null;
}

interface PriceRule {
  rule_id: string;
  service_level: string;
  client_id: string | null;
  client_name: string | null;
  governorate: string | null;
  district: string | null;
  client_price: number;
  investigator_price: number;
  note: string | null;
  updated_at: string;
  updated_by_name: string | null;
}

interface Place {
  location_id: string;
  name: string;
}

const ALL = "";

/** Governorate and district, picked from the list or typed (same names the cases use). */
function AreaFields({
  governorate,
  district,
  onChange,
}: {
  governorate: string;
  district: string;
  onChange: (next: { governorate: string; district: string }) => void;
}) {
  const [governorates, setGovernorates] = useState<Place[]>([]);
  const [districts, setDistricts] = useState<Place[]>([]);
  useEffect(() => {
    api<{ locations: Place[] }>("/locations")
      .then((data) => setGovernorates(data.locations))
      .catch(() => setGovernorates([]));
  }, []);
  useEffect(() => {
    const parent = governorates.find((place) => place.name === governorate)?.location_id;
    if (!parent) {
      setDistricts([]);
      return;
    }
    api<{ locations: Place[] }>(`/locations?parent=${parent}`)
      .then((data) => setDistricts(data.locations))
      .catch(() => setDistricts([]));
  }, [governorate, governorates]);
  return (
    <>
      <label className="field">
        <span>المحافظة</span>
        <input
          list="price-governorates"
          placeholder="كل المحافظات"
          value={governorate}
          onChange={(event) => onChange({ governorate: event.target.value, district: "" })}
        />
        <datalist id="price-governorates">
          {governorates.map((place) => (
            <option key={place.location_id} value={place.name} />
          ))}
        </datalist>
      </label>
      <label className="field">
        <span>المركز / المدينة</span>
        <input
          list="price-districts"
          placeholder={governorate ? "كل المحافظة" : "اختر المحافظة أولًا"}
          disabled={!governorate}
          value={district}
          onChange={(event) => onChange({ governorate, district: event.target.value })}
        />
        <datalist id="price-districts">
          {districts.map((place) => (
            <option key={place.location_id} value={place.name} />
          ))}
        </datalist>
      </label>
    </>
  );
}

/** Prices for one client, one area, or both. The most specific one applies to a case. */
function PriceList({ levels, clients, rules, onChanged }: { levels: ServiceLevel[]; clients: Client[]; rules: PriceRule[]; onChanged: () => void }) {
  const [filter, setFilter] = useState<string>("*");
  const [draft, setDraft] = useState({
    service_level: levels[0]?.code ?? "",
    client_id: ALL,
    governorate: "",
    district: "",
    client_price: "",
    investigator_price: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!draft.service_level && levels[0]) setDraft((current) => ({ ...current, service_level: levels[0]!.code }));
  }, [levels, draft.service_level]);

  const levelName = (code: string) => levels.find((level) => level.code === code)?.name_ar ?? code;
  const shown = rules.filter((rule) => filter === "*" || (rule.client_id ?? ALL) === filter);
  const canSave =
    draft.service_level &&
    (draft.client_id || draft.governorate.trim()) &&
    draft.client_price !== "" &&
    draft.investigator_price !== "";

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/investigations/pricing/rules", {
        method: "POST",
        body: JSON.stringify({
          service_level: draft.service_level,
          client_id: draft.client_id || null,
          governorate: draft.governorate.trim() || null,
          district: draft.district.trim() || null,
          client_price: Number(draft.client_price),
          investigator_price: Number(draft.investigator_price),
          note: draft.note.trim() || null,
        }),
      });
      setMessage("تم حفظ السعر. يسري على الاستعلامات الجديدة فقط.");
      setDraft({ ...draft, client_price: "", investigator_price: "", note: "" });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "تعذّر حفظ السعر.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(rule: PriceRule) {
    if (!window.confirm("حذف هذا السعر؟ يعود السعر الأعم (أو سعر النوع نفسه) للاستعلامات الجديدة.")) return;
    try {
      await api(`/investigations/pricing/rules/${rule.rule_id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "تعذّر الحذف.");
    }
  }

  const profit = Number(draft.client_price || 0) - Number(draft.investigator_price || 0);

  return (
    <section className="glass panel price-list">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">قائمة الأسعار</p>
          <h2>سعر لكل جهة ولكل منطقة</h2>
        </div>
        <Icon name="tag" size={20} />
      </div>
      <p className="field-hint">
        يُطبَّق على كل استعلام أدقّ سعر ينطبق عليه: سعر الجهة لهذا المركز، ثم لهذه المحافظة، ثم سعر الجهة العام، ثم سعر
        المنطقة لكل الجهات، ثم سعر نوع الاستعلام نفسه بالأعلى.
      </p>

      <div className="price-rule-form">
        <label className="field">
          <span>نوع الاستعلام</span>
          <select value={draft.service_level} onChange={(event) => setDraft({ ...draft, service_level: event.target.value })}>
            {levels.map((level) => (
              <option key={level.code} value={level.code}>
                {level.name_ar}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>الجهة (بنك / شركة)</span>
          <select value={draft.client_id} onChange={(event) => setDraft({ ...draft, client_id: event.target.value })}>
            <option value={ALL}>كل الجهات</option>
            {clients.map((client) => (
              <option key={client.client_id} value={client.client_id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <AreaFields
          governorate={draft.governorate}
          district={draft.district}
          onChange={(area) => setDraft({ ...draft, ...area })}
        />
        <label className="field">
          <span>سعر العميل</span>
          <input
            type="number"
            min={0}
            value={draft.client_price}
            onChange={(event) => setDraft({ ...draft, client_price: event.target.value })}
          />
        </label>
        <label className="field">
          <span>أجر المستعلم</span>
          <input
            type="number"
            min={0}
            value={draft.investigator_price}
            onChange={(event) => setDraft({ ...draft, investigator_price: event.target.value })}
          />
        </label>
        <label className="field">
          <span>ملاحظة (اختياري)</span>
          <input value={draft.note} maxLength={300} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
        </label>
        <div className="price-rule-actions">
          {draft.client_price !== "" && draft.investigator_price !== "" && (
            <span className={profit < 0 ? "price-margin negative" : "price-margin"}>هامش {money(profit)}</span>
          )}
          <button className="btn btn-primary" disabled={!canSave || busy} onClick={() => void save()}>
            <Icon name="plus" size={16} />
            {busy ? "جارٍ الحفظ…" : "حفظ السعر"}
          </button>
        </div>
      </div>
      {!draft.client_id && !draft.governorate.trim() && (
        <p className="hint">اختر جهة أو منطقة (أو الاثنين). سعر كل الجهات في كل المناطق هو سعر النوع نفسه بالأعلى.</p>
      )}
      {message && <p className="hint">{message}</p>}
      <ErrorMessage message={error} />

      <div className="price-filter segmented">
        <button type="button" className={filter === "*" ? "active" : ""} onClick={() => setFilter("*")}>
          الكل
        </button>
        <button type="button" className={filter === ALL ? "active" : ""} onClick={() => setFilter(ALL)}>
          كل الجهات (حسب المنطقة)
        </button>
        {clients
          .filter((client) => rules.some((rule) => rule.client_id === client.client_id))
          .map((client) => (
            <button
              type="button"
              key={client.client_id}
              className={filter === client.client_id ? "active" : ""}
              onClick={() => setFilter(client.client_id)}
            >
              {client.name}
            </button>
          ))}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>الجهة</th>
              <th>المنطقة</th>
              <th>نوع الاستعلام</th>
              <th>سعر العميل</th>
              <th>أجر المستعلم</th>
              <th>الهامش</th>
              <th>آخر تعديل</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((rule) => (
              <tr key={rule.rule_id}>
                <td>{rule.client_name ?? "كل الجهات"}</td>
                <td>{[rule.governorate, rule.district].filter(Boolean).join(" - ") || "كل المناطق"}</td>
                <td>{levelName(rule.service_level)}</td>
                <td>{money(rule.client_price)}</td>
                <td>{money(rule.investigator_price)}</td>
                <td className={rule.client_price - rule.investigator_price < 0 ? "trend-down" : undefined}>
                  {money(rule.client_price - rule.investigator_price)}
                </td>
                <td>
                  <small>
                    {rule.updated_by_name ?? "—"}
                    {rule.note ? ` · ${rule.note}` : ""}
                  </small>
                </td>
                <td>
                  <button className="btn ghost btn-danger btn-small" onClick={() => void remove(rule)}>
                    حذف
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!shown.length && <p className="hint">لا توجد أسعار خاصة بعد. كل الاستعلامات تُسعَّر بسعر نوعها بالأعلى.</p>}
    </section>
  );
}

export function PricingPage() {
  const [levels, setLevels] = useState<ServiceLevel[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [rules, setRules] = useState<PriceRule[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<{ levels: ServiceLevel[]; clients: Client[]; rules: PriceRule[] }>("/investigations/pricing")
      .then((data) => {
        setLevels(data.levels);
        setClients(data.clients);
        setRules(data.rules);
      })
      .catch(() => setError("تعذّر تحميل الأسعار."));
  }, []);
  useEffect(load, [load]);

  const unpriced = levels.filter((level) => level.active && !level.client_price).length;

  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            الإدارة العليا <span>/</span> الأسعار
          </p>
          <h1>
            أسعار الاستعلامات. <span>لكل جهة ولكل منطقة.</span>
          </h1>
          <p className="page-description">
            حدّد لكل نوع مدة التسليم وسعره العام، ثم أسعارًا خاصة لكل بنك أو شركة ولكل محافظة أو مركز. يُسعَّر كل
            استعلام تلقائيًا عند إرساله، ولا يتغير سعر استعلام أُرسل بالفعل.
          </p>
        </div>
      </div>
      <ErrorMessage message={error} />
      {unpriced > 0 && (
        <p className="notice-banner">
          <Icon name="bell" size={16} />
          {unpriced} أنواع بلا سعر عام بعد. الاستعلامات بلا سعر خاص لن تظهر في الأرباح.
        </p>
      )}
      <div className="price-grid">
        {levels.map((level) => (
          <LevelCard
            key={level.code}
            level={level}
            onSaved={(next) => setLevels(levels.map((item) => (item.code === next.code ? next : item)))}
          />
        ))}
      </div>
      {levels.length > 0 && <PriceList levels={levels} clients={clients} rules={rules} onChanged={load} />}
    </div>
  );
}
