import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api";
import { money, MonthPicker, monthLabel, thisMonth, TrendBars } from "../components/Finance";
import { between, minutesLabel, OFFER_RESPONSE, Stamp } from "../components/Timing";
import { InvestigatorClientsPanel } from "../components/ClientsPicker";
import { DevicePanel } from "../components/DevicePanel";
import { areaLabel, type ServiceArea, ReviewDrawer, SecureImage } from "../components/ReviewDrawer";
import { Avatar, date, ErrorMessage, Icon, number, Status } from "../components/ui";

interface Account {
  user: {
    user_id: string;
    full_name: string;
    phone: string;
    email: string | null;
    employee_number: string | null;
    account_type: string;
    status: string;
    last_login_at: string | null;
    created_at: string;
  };
  employee_record: { department: string | null; position: string | null } | null;
}
interface Area {
  location_set: boolean;
  available: boolean;
  governorate?: string;
  district?: string;
  local_unit?: string;
  main_village?: string;
  sub_village?: string;
  street?: string;
  lat?: number | null;
  lng?: number | null;
  /** Every area they serve, the primary one first. */
  areas?: ServiceArea[];
}
interface Stats {
  total: number;
  active: number;
  awaiting_review: number;
  approved: number;
  cancelled: number;
  negative: number;
  returns: number;
  on_time: number;
  with_deadline: number;
  overdue: number;
  avg_hours: number | null;
  approved_month: number;
  earned_month: number;
  earned_total: number;
  pending_earnings: number;
  revenue_total: number;
  last_submitted_at: string | null;
}
interface Performance {
  stats: Stats | null;
  responses: {
    offers: number;
    answered: number;
    accepted: number;
    declined: number;
    expired: number;
    avg_seen_minutes: number | null;
    avg_response_minutes: number | null;
  } | null;
  lifecycle: { avg_seen_to_submit_hours: number | null; avg_offer_to_approval_hours: number | null } | null;
  trend: { month: string; payouts: number; approved: number }[];
  by_level: { name: string; total: number }[];
  by_client: { name: string; total: number }[];
  recent: {
    investigation_id: string;
    reference: string;
    status: string;
    subject_name: string;
    client_name: string;
    service_name: string | null;
    investigator_price: number;
    due_at: string | null;
    submitted_at: string | null;
    reviewed_at: string | null;
    created_at: string;
    offered_at: string;
    seen_at: string | null;
    responded_at: string | null;
    response: string | null;
    reason: string | null;
  }[];
}

const CASE_STATUS: Record<string, string> = {
  open: "متاح للمنطقة",
  assigned: "مسند",
  in_progress: "قيد التنفيذ",
  submitted: "بانتظار المراجعة",
  returned: "معاد للتعديل",
  approved: "معتمد",
  cancelled: "ملغي",
};

function AreaMap({ lat, lng }: { lat: number; lng: number }) {
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!holder.current) return;
    const map = L.map(holder.current, { zoomControl: false, scrollWheelZoom: false, dragging: false }).setView(
      [lat, lng],
      13,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(map);
    L.circleMarker([lat, lng], { radius: 9, color: "#fff", weight: 2, fillColor: "#e8c987", fillOpacity: 1 }).addTo(map);
    return () => {
      map.remove();
    };
  }, [lat, lng]);
  return <div className="area-map profile-map" dir="ltr" ref={holder} />;
}

const percent = (part: number, whole: number) => (whole ? `${number(Math.round((part / whole) * 100))}٪` : "—");

export default function InvestigatorProfilePage() {
  const { id = "" } = useParams();
  const office = useLocation().pathname.startsWith("/investigators");
  const [month, setMonth] = useState(thisMonth());
  const [account, setAccount] = useState<Account | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [perf, setPerf] = useState<Performance | null>(null);
  const [error, setError] = useState("");
  const [documents, setDocuments] = useState(false);

  useEffect(() => {
    api<Account>(`/admin/users/${id}`)
      .then(setAccount)
      .catch(() => setError("تعذّر تحميل بيانات المستعلم."));
    api<{ profile: Area }>(`/investigators/${id}`)
      .then((data) => setArea(data.profile))
      .catch(() => setArea(null));
  }, [id]);
  useEffect(() => {
    api<Performance>(`/investigations/performance/${id}?month=${month}`)
      .then(setPerf)
      .catch(() => setPerf(null));
  }, [id, month]);

  const user = account?.user;
  const stats = perf?.stats;
  const place = [area?.governorate, area?.district, area?.local_unit, area?.main_village, area?.sub_village]
    .filter(Boolean)
    .join(" - ");

  return (
    <div className="page-enter profile-page">
      <Link className="text-link account-back" to={office ? "/investigators" : "/dispatch"}>
        <Icon name="arrow" size={16} />
        عودة
      </Link>
      <ErrorMessage message={error} />
      <section className="glass profile-hero">
        <div className="applicant-photo">
          {user && (
            <SecureImage
              path={`/admin/users/${id}/photo`}
              alt={user.full_name}
              fallback={<Avatar name={user.full_name} />}
            />
          )}
        </div>
        <div className="profile-hero-main">
          <span className="eyebrow">ملف المستعلم</span>
          <h1>{user?.full_name ?? "…"}</h1>
          <div className="profile-tags">
            {user && <Status status={user.status} />}
            {user?.employee_number && <span className="badge mono">{user.employee_number}</span>}
            {area && (
              <span className={area.available ? "badge status-active" : "badge"}>
                <i />
                {area.available ? "متاح لاستقبال الاستعلامات" : "غير متاح حالياً"}
              </span>
            )}
          </div>
          <dl className="profile-facts">
            <div>
              <dt>الهاتف</dt>
              <dd dir="ltr">{user?.phone ?? "—"}</dd>
            </div>
            <div>
              <dt>البريد الإلكتروني</dt>
              <dd dir="ltr">{user?.email ?? "—"}</dd>
            </div>
            <div>
              <dt>تاريخ الانضمام</dt>
              <dd>{user ? date(user.created_at) : "—"}</dd>
            </div>
            <div>
              <dt>آخر دخول</dt>
              <dd>{user?.last_login_at ? date(user.last_login_at) : "لم يسجّل الدخول بعد"}</dd>
            </div>
            <div>
              <dt>آخر تقرير</dt>
              <dd>{stats?.last_submitted_at ? date(stats.last_submitted_at) : "—"}</dd>
            </div>
            <div>
              <dt>نوع الحساب</dt>
              <dd>{user?.account_type === "existing_employee" ? "موظف حالي" : "متقدم جديد"}</dd>
            </div>
          </dl>
        </div>
        <button className="btn small" onClick={() => setDocuments(true)}>
          <Icon name="badge" size={15} />
          المستندات
        </button>
      </section>

      <div className="profile-head-row">
        <h2>الأداء</h2>
        <MonthPicker value={month} onChange={setMonth} />
      </div>
      <div className="metrics-grid profile-metrics">
        {[
          // Money is head office's; administrators see the work, not the pay.
          ...(office
            ? [
                { label: `أرباح ${monthLabel(month)}`, value: money(stats?.earned_month), hint: `${number(stats?.approved_month ?? 0)} تقرير معتمد` },
                { label: "إجمالي الأرباح", value: money(stats?.earned_total), hint: `بانتظار الاعتماد ${money(stats?.pending_earnings)}` },
                { label: "إيرادات حققها للشركة", value: money(stats?.revenue_total), hint: "من التقارير المعتمدة" },
              ]
            : []),
          { label: "إجمالي الاستعلامات", value: number(stats?.total ?? 0), hint: `${number(stats?.approved ?? 0)} معتمد · ${number(stats?.active ?? 0)} قيد العمل` },
          { label: "الالتزام بالموعد", value: percent(stats?.on_time ?? 0, stats?.with_deadline ?? 0), hint: `${number(stats?.overdue ?? 0)} متأخر الآن` },
          { label: "متوسط مدة الإنجاز", value: minutesLabel(stats?.avg_hours == null ? null : stats.avg_hours * 60), hint: "من القبول حتى الإرسال" },
          { label: "طلبات التعديل", value: number(stats?.returns ?? 0), hint: `معدل ${percent(stats?.returns ?? 0, (stats?.approved ?? 0) + (stats?.awaiting_review ?? 0))}` },
          { label: "بانتظار المراجعة", value: number(stats?.awaiting_review ?? 0), hint: `${number(stats?.negative ?? 0)} سلبي · ${number(stats?.cancelled ?? 0)} ملغي` },
        ].map((card) => (
          <article className="glass metric" key={card.label}>
            <div className="metric-top">
              <span>{card.label}</span>
            </div>
            <strong className="money-value">{card.value}</strong>
            <p>
              <span className="small-indicator" />
              {card.hint}
            </p>
          </article>
        ))}
      </div>

      <div className="profile-head-row">
        <h2>سرعة الاستجابة</h2>
      </div>
      <div className="metrics-grid profile-metrics">
        {[
          { label: "العروض المستلمة", value: number(perf?.responses?.offers ?? 0), hint: `${number(perf?.responses?.accepted ?? 0)} قبول · ${number(perf?.responses?.declined ?? 0)} رفض · ${number(perf?.responses?.expired ?? 0)} انتهت` },
          { label: "نسبة القبول", value: perf?.responses?.answered ? `${number(Math.round(((perf.responses.accepted ?? 0) / perf.responses.answered) * 100))}٪` : "—", hint: "من العروض التي رد عليها أو انتهت مهلتها" },
          { label: "متوسط وقت المشاهدة", value: minutesLabel(perf?.responses?.avg_seen_minutes), hint: "من وصول العرض حتى فتحه" },
          { label: "متوسط وقت الرد", value: minutesLabel(perf?.responses?.avg_response_minutes), hint: "من وصول العرض حتى القبول أو الرفض" },
          { label: "من المشاهدة للإنجاز", value: minutesLabel(perf?.lifecycle?.avg_seen_to_submit_hours == null ? null : perf.lifecycle.avg_seen_to_submit_hours * 60), hint: "حتى إرسال التقرير" },
          { label: "من العرض للاعتماد", value: minutesLabel(perf?.lifecycle?.avg_offer_to_approval_hours == null ? null : perf.lifecycle.avg_offer_to_approval_hours * 60), hint: "الرحلة كاملة" },
        ].map((card) => (
          <article className="glass metric" key={card.label}>
            <div className="metric-top">
              <span>{card.label}</span>
            </div>
            <strong className="money-value">{card.value}</strong>
            <p>
              <span className="small-indicator" />
              {card.hint}
            </p>
          </article>
        ))}
      </div>

      <div className="finance-grid">
        {office && (
          <section className="glass panel finance-trend">
            <div className="panel-heading">
              <h2>الأرباح الشهرية</h2>
            </div>
            <TrendBars rows={perf?.trend ?? []} series={[{ key: "payouts", label: "أرباح المستعلم", tone: "accent" }]} />
          </section>
        )}
        <section className="glass panel">
          <div className="panel-heading">
            <h2>مناطق العمل{(area?.areas?.length ?? 0) > 1 ? ` (${number(area!.areas!.length)})` : ""}</h2>
          </div>
          <div className="profile-area">
            <p>{place || "لم يحدد منطقته بعد"}</p>
            {(area?.areas?.filter((item) => !item.is_primary).length ?? 0) > 0 && (
              <ul className="area-list">
                {area!.areas!
                  .filter((item) => !item.is_primary)
                  .map((item) => (
                    <li key={item.area_id}>
                      {areaLabel(item)}
                      <span className="badge">منطقة إضافية</span>
                    </li>
                  ))}
              </ul>
            )}
            {area?.street && <small>{area.street}</small>}
            {area?.lat && area.lng ? <AreaMap lat={area.lat} lng={area.lng} /> : <p className="hint">لم يحدد موقعه على الخريطة.</p>}
          </div>
        </section>
      </div>

      {/* Head office decides which banks and companies an investigator works for. */}
      {office && (
        <div className="finance-grid single">
          <InvestigatorClientsPanel userId={id} />
        </div>
      )}

      <div className="finance-grid single">
        <DevicePanel userId={id} />
      </div>

      <div className="finance-grid">
        <section className="glass panel">
          <div className="panel-heading">
            <h2>حسب نوع الاستعلام</h2>
          </div>
          <div className="chip-cloud">
            {perf?.by_level.map((row) => (
              <span className="badge" key={row.name}>
                {row.name} · {number(row.total)}
              </span>
            ))}
            {!perf?.by_level.length && <p className="hint">لا توجد استعلامات بعد.</p>}
          </div>
        </section>
        <section className="glass panel">
          <div className="panel-heading">
            <h2>حسب الجهة</h2>
          </div>
          <div className="chip-cloud">
            {perf?.by_client.map((row) => (
              <span className="badge" key={row.name}>
                {row.name} · {number(row.total)}
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="glass panel">
        <div className="panel-heading">
          <h2>رحلة كل استعلام</h2>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>رقم الاستعلام</th>
                <th>المستعلم عنه</th>
                <th>الجهة والنوع</th>
                <th>الحالة</th>
                <th>عُرض عليه</th>
                <th>شاهده</th>
                <th>رده</th>
                <th>أرسل التقرير</th>
                <th>اعتُمد</th>
                <th>من المشاهدة للإنجاز</th>
                {office && <th>الأجر</th>}
              </tr>
            </thead>
            <tbody>
              {perf?.recent.map((row) => (
                <tr key={row.investigation_id + row.offered_at}>
                  <td className="mono">
                    {office ? row.reference : <Link to={`/investigations?search=${row.reference}`}>{row.reference}</Link>}
                  </td>
                  <td>{row.subject_name}</td>
                  <td>
                    {row.client_name}
                    {row.service_name ? ` · ${row.service_name}` : ""}
                  </td>
                  <td>
                    <span className={`badge case-${row.status}`}>
                      <i />
                      {CASE_STATUS[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="date-cell">
                    <Stamp at={row.offered_at} />
                  </td>
                  <td className="date-cell">
                    <Stamp at={row.seen_at} after={row.offered_at} />
                  </td>
                  <td className="date-cell">
                    {row.response ? (
                      <span className={`offer-${row.response}`}>
                        {OFFER_RESPONSE[row.response] ?? row.response}
                        <small>بعد {between(row.offered_at, row.responded_at)}</small>
                      </span>
                    ) : (
                      <span className="offer-pending">ينتظر الرد</span>
                    )}
                  </td>
                  <td className="date-cell">
                    {row.response === "accepted" ? <Stamp at={row.submitted_at} after={row.responded_at} /> : "—"}
                  </td>
                  <td className="date-cell">
                    {row.response === "accepted" && row.status === "approved" ? <Stamp at={row.reviewed_at} after={row.submitted_at} /> : "—"}
                  </td>
                  <td>{row.response === "accepted" ? between(row.seen_at ?? row.offered_at, row.submitted_at) : "—"}</td>
                  {office && <td>{money(row.investigator_price)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!perf?.recent.length && <p className="hint empty">لم يُسند إليه أي استعلام بعد.</p>}
      </section>
      {documents && (
        <ReviewDrawer userId={id} onClose={() => setDocuments(false)} onDecided={() => setDocuments(false)} />
      )}
    </div>
  );
}
