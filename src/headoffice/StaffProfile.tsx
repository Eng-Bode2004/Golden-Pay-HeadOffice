import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, ApiRequestError } from "../api";
import { money, MonthPicker, monthLabel, thisMonth } from "../components/Finance";
import {
  AttendanceCalendar,
  clock,
  PointBadges,
  PointList,
  type AttendanceDay,
  type PointRow,
} from "../components/Points";
import { InvestigatorClientsPanel } from "../components/ClientsPicker";
import { Avatar, date, ErrorMessage, Icon, number } from "../components/ui";
import { GROUP_LABEL, hoursLabel, percent, type PointRules, type Schedule, type StaffMonth } from "./types";

interface Detail {
  person: StaffMonth;
  month: string;
  schedule: Schedule;
  rules: PointRules;
  points: PointRow[];
  days: AttendanceDay[];
  complaints: { complaint_id: string; reference: string; subject: string; status: string; created_at: string }[];
  adjustments: { adjustment_id: string; amount: number; note: string; created_at: string; created_by_name: string | null }[];
  salary: { base_salary: number } | null;
}

const COMPLAINT_STATUS: Record<string, string> = { open: "جديدة", in_review: "قيد المراجعة", resolved: "مغلقة" };
const message = (error: unknown, fallback: string) => (error instanceof ApiRequestError ? error.message : fallback);

export function StaffProfilePage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const [month, setMonth] = useState(params.get("month") ?? thisMonth());
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [give, setGive] = useState({ color: "blue" as "blue" | "black", count: 1, note: "" });
  const [salary, setSalary] = useState("");
  const [adjustment, setAdjustment] = useState({ amount: "", note: "" });

  const load = useCallback(() => {
    api<Detail>(`/headoffice/staff/${id}?month=${month}`)
      .then((result) => {
        setData(result);
        setSalary(String(result.salary?.base_salary ?? 0));
      })
      .catch((err) => setError(message(err, "تعذّر تحميل الملف.")));
  }, [id, month]);
  useEffect(load, [load]);

  const run = async (action: () => Promise<unknown>, done: string): Promise<boolean> => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(done);
      load();
      return true;
    } catch (err) {
      setError(message(err, "تعذّر حفظ التغيير."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const person = data?.person;
  const paid = Boolean(person?.pay.paid);
  const revoke = (point: PointRow) => {
    const note = window.prompt("سبب إلغاء النقطة؟");
    if (note?.trim()) void run(() => api(`/headoffice/points/${point.point_id}/revoke`, { method: "POST", body: JSON.stringify({ note }) }), "أُلغيت النقطة.");
  };

  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <Link to="/staff">الموظفون</Link> <span>/</span> {person ? GROUP_LABEL[person.staff_group] : "…"}
          </p>
          <div className="profile-title">
            <Avatar name={person?.full_name ?? "…"} />
            <div>
              <h1>{person?.full_name ?? "…"}</h1>
              <p className="page-description">
                {[person?.employee_number, person?.email, person?.phone?.startsWith("flow:") ? null : person?.phone].filter(Boolean).join(" · ")}
                {person?.last_login_at ? ` · آخر دخول ${date(person.last_login_at)}` : ""}
              </p>
            </div>
          </div>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>
      <ErrorMessage message={error} />
      {notice && <p className="success-message">{notice}</p>}

      <div className="metrics-grid finance-metrics">
        <article className="glass metric">
          <div className="metric-top">
            <span>مؤشر الكفاءة</span>
            <span className="metric-icon">
              <Icon name="activity" />
            </span>
          </div>
          <strong>{number(person?.score ?? 0)}</strong>
          <p>
            <span className="small-indicator" />
            {monthLabel(month)}
          </p>
        </article>
        <article className="glass metric">
          <div className="metric-top">
            <span>النقاط</span>
            <span className="metric-icon">
              <Icon name="badge" />
            </span>
          </div>
          <PointBadges summary={person?.points} />
          <p>
            <span className="small-indicator" />
            {number(person?.points.net_black ?? 0)} سوداء متبقية · مكافأة {money(person?.points.bonus ?? 0)}
          </p>
        </article>
        <article className="glass metric">
          <div className="metric-top">
            <span>الحضور</span>
            <span className="metric-icon">
              <Icon name="clock" />
            </span>
          </div>
          <strong>{number(person?.attendance.days ?? 0)} يوم</strong>
          <p>
            <span className="small-indicator" />
            {number(person?.attendance.late_days ?? 0)} تأخير ({number(person?.attendance.late_minutes ?? 0)} د) ·{" "}
            {number(person?.attendance.absent ?? 0)} غياب · {number(person?.attendance.hours ?? 0)} ساعة نشاط
          </p>
        </article>
        <article className="glass metric">
          <div className="metric-top">
            <span>راتب الشهر</span>
            <span className="metric-icon">
              <Icon name="key" />
            </span>
          </div>
          <strong className="money-value">{money(person?.pay.paid?.amount ?? person?.pay.total)}</strong>
          <p>
            <span className="small-indicator" />
            {paid ? `مدفوع ${date(person!.pay.paid!.paid_at)}` : "لم يُصرف بعد"}
          </p>
        </article>
      </div>

      {person?.staff_group === "investigator" && (
        <div className="finance-grid single">
          <InvestigatorClientsPanel userId={id} />
        </div>
      )}

      <div className="finance-grid">
        <section className="glass panel">
          <div className="panel-heading">
            <h2>الحضور في {monthLabel(month)}</h2>
            {data && (
              <small className="hint">
                الدوام {data.schedule.start} – {data.schedule.end}
              </small>
            )}
          </div>
          {data && <AttendanceCalendar month={data.month} days={data.days} points={data.points} offDays={data.schedule.off_days} />}
          <div className="calendar-legend">
            <span className="day-present">في الموعد</span>
            <span className="day-late">متأخر</span>
            <span className="day-absent">غائب</span>
            <span className="day-extra">عمل في إجازة</span>
            <span className="day-off">إجازة</span>
          </div>
          {!!data?.days.length && (
            <ol className="event-log day-log">
              {[...data.days].reverse().slice(0, 10).map((day) => (
                <li key={day.day}>
                  <b>{day.day}</b>
                  <span>
                    {clock(day.first_seen)} ← {clock(day.last_seen)}
                  </span>
                  {day.late_minutes > 0 && <em className="late-text">تأخير {number(day.late_minutes)} د</em>}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="glass panel">
          <div className="panel-heading">
            <h2>النقاط</h2>
          </div>
          <form
            className="give-points"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () => api("/headoffice/points", { method: "POST", body: JSON.stringify({ user_id: id, ...give }) }),
                give.color === "blue" ? "أُضيفت النقاط الزرقاء." : "سُجّلت النقاط السوداء.",
              ).then((saved) => saved && setGive({ ...give, note: "", count: 1 }));
            }}
          >
            <div className="segmented point-choice">
              <button type="button" className={give.color === "blue" ? "active blue" : ""} onClick={() => setGive({ ...give, color: "blue" })}>
                <i className="dot point-blue" /> تقدير (زرقاء)
              </button>
              <button type="button" className={give.color === "black" ? "active black" : ""} onClick={() => setGive({ ...give, color: "black" })}>
                <i className="dot point-black" /> مخالفة (سوداء)
              </button>
            </div>
            <div className="form-row">
              <label className="field count-field">
                <span>العدد</span>
                <input type="number" min={1} max={10} value={give.count} onChange={(event) => setGive({ ...give, count: Number(event.target.value) || 1 })} />
              </label>
              <label className="field">
                <span>السبب</span>
                <input
                  required
                  placeholder={give.color === "blue" ? "مثال: تغطية منطقة زميل غائب" : "مثال: عدم الرد على الهاتف أثناء الدوام"}
                  value={give.note}
                  onChange={(event) => setGive({ ...give, note: event.target.value })}
                />
              </label>
            </div>
            <button className="btn btn-primary" disabled={busy || !give.note.trim()}>
              <Icon name="plus" size={16} />
              إضافة
            </button>
          </form>
          <PointList points={data?.points ?? []} onRevoke={revoke} />
        </section>
      </div>

      <div className="finance-grid">
        <section className="glass panel">
          <div className="panel-heading">
            <h2>الراتب</h2>
            {paid && <span className="badge ok-badge">مدفوع</span>}
          </div>
          <form
            className="salary-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => api(`/headoffice/salaries/${id}`, { method: "PATCH", body: JSON.stringify({ base_salary: Number(salary) }) }), "حُفظ الراتب الأساسي.");
            }}
          >
            <label className="field">
              <span>الراتب الأساسي الشهري</span>
              <input type="number" min={0} step={50} value={salary} onChange={(event) => setSalary(event.target.value)} />
            </label>
            <button className="btn ghost" disabled={busy}>
              حفظ
            </button>
          </form>
          {person && (
            <ul className="profit-lines">
              <li>
                <span>الراتب الأساسي</span>
                <b>{money(person.pay.base)}</b>
              </li>
              {person.staff_group === "investigator" && (
                <li className="plus">
                  <span>أجور الاستعلامات المعتمدة ({number(person.cases.approved)})</span>
                  <b>+ {money(person.pay.case_pay)}</b>
                </li>
              )}
              <li className="plus">
                <span>مكافأة {number(person.points.bonus_blue ?? 0)} نقطة زرقاء</span>
                <b>+ {money(person.pay.bonus)}</b>
              </li>
              <li className="minus">
                <span>خصم {number(person.points.net_black)} نقطة سوداء</span>
                <b>− {money(person.pay.deduction)}</b>
              </li>
              {data?.adjustments.map((item) => (
                <li key={item.adjustment_id} className={item.amount < 0 ? "minus" : "plus"}>
                  <span>
                    {item.note}
                    {!paid && (
                      <button
                        className="link-button"
                        onClick={() => void run(() => api(`/headoffice/payroll/adjustments/${item.adjustment_id}`, { method: "DELETE" }), "حُذفت التسوية.")}
                      >
                        حذف
                      </button>
                    )}
                  </span>
                  <b>
                    {item.amount < 0 ? "− " : "+ "}
                    {money(Math.abs(item.amount))}
                  </b>
                </li>
              ))}
              <li className="total">
                <span>الإجمالي</span>
                <b>{money(person.pay.total)}</b>
              </li>
            </ul>
          )}
          {!paid && (
            <form
              className="adjust-form"
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  () =>
                    api("/headoffice/payroll/adjustments", {
                      method: "POST",
                      body: JSON.stringify({ user_id: id, month, amount: Number(adjustment.amount), note: adjustment.note }),
                    }),
                  "أُضيفت التسوية.",
                ).then((saved) => saved && setAdjustment({ amount: "", note: "" }));
              }}
            >
              <label className="field">
                <span>تسوية (موجب = إضافة، سالب = خصم)</span>
                <input type="number" step={10} placeholder="250 أو ‎-100" value={adjustment.amount} onChange={(event) => setAdjustment({ ...adjustment, amount: event.target.value })} />
              </label>
              <label className="field">
                <span>البيان</span>
                <input placeholder="بدل انتقال، سلفة…" value={adjustment.note} onChange={(event) => setAdjustment({ ...adjustment, note: event.target.value })} />
              </label>
              <button className="btn ghost" disabled={busy || !Number(adjustment.amount) || !adjustment.note.trim()}>
                إضافة تسوية
              </button>
            </form>
          )}
        </section>

        <section className="glass panel">
          <div className="panel-heading">
            <h2>العمل في {monthLabel(month)}</h2>
          </div>
          {person && (
            <div className="work-stats">
              {person.staff_group === "investigator" ? (
                <>
                  <span>
                    <b>{number(person.cases.approved)}</b>تقرير معتمد
                  </span>
                  <span>
                    <b>{percent(person.cases.on_time, person.cases.with_deadline)}</b>في الموعد
                  </span>
                  <span>
                    <b>{number(person.cases.negative)}</b>استعلام سلبي
                  </span>
                  <span>
                    <b>{number(person.cases.active)}</b>قيد التنفيذ الآن
                  </span>
                  <span>
                    <b>{money(person.cases.revenue)}</b>إيراد للشركة
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <b>{number(person.cases.created)}</b>استعلام أرسله
                  </span>
                  <span>
                    <b>{number(person.cases.reviewed)}</b>تقرير راجعه
                  </span>
                  <span>
                    <b>{number(person.cases.returned)}</b>أعاده للتعديل
                  </span>
                  <span>
                    <b>{hoursLabel(person.cases.avg_review_hours)}</b>متوسط زمن المراجعة
                  </span>
                </>
              )}
            </div>
          )}
          <div className="panel-heading sub-heading">
            <h2>الشكاوى</h2>
          </div>
          <ul className="mini-list">
            {data?.complaints.map((item) => (
              <li key={item.complaint_id}>
                <Link to={`/complaints?open=${item.complaint_id}`}>
                  <span className="mono">{item.reference}</span> {item.subject}
                </Link>
                <small>{COMPLAINT_STATUS[item.status]}</small>
              </li>
            ))}
          </ul>
          {!data?.complaints.length && <p className="hint">لا توجد شكاوى.</p>}
        </section>
      </div>
    </div>
  );
}
