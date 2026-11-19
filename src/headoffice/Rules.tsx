import { useEffect, useState } from "react";
import { api, ApiRequestError } from "../api";
import { money } from "../components/Finance";
import { WEEKDAYS } from "../components/Points";
import { ErrorMessage, Icon, number } from "../components/ui";
import type { PointRules, Schedule } from "./types";

interface Settings {
  schedules: { admin: Schedule; investigator: Schedule };
  points: PointRules;
  tracking_since: string;
}

function ScheduleCard({ title, value, onChange }: { title: string; value: Schedule; onChange: (value: Schedule) => void }) {
  const set = (patch: Partial<Schedule>) => onChange({ ...value, ...patch });
  return (
    <section className="glass panel rules-card">
      <div className="panel-heading">
        <h2>{title}</h2>
        <Icon name="clock" size={18} />
      </div>
      <div className="form-row">
        <label className="field">
          <span>بداية الدوام</span>
          <input type="time" value={value.start} onChange={(event) => set({ start: event.target.value })} />
        </label>
        <label className="field">
          <span>نهاية الدوام</span>
          <input type="time" value={value.end} onChange={(event) => set({ end: event.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>دقائق السماح قبل اعتبار الحضور تأخيرًا</span>
        <input type="number" min={0} max={180} value={value.grace_minutes} onChange={(event) => set({ grace_minutes: Number(event.target.value) })} />
      </label>
      <div className="field">
        <span>أيام الإجازة الأسبوعية</span>
        <div className="day-chips">
          {WEEKDAYS.map((name, day) => (
            <label key={name} className={value.off_days.includes(day) ? "on" : ""}>
              <input
                type="checkbox"
                checked={value.off_days.includes(day)}
                onChange={(event) =>
                  set({ off_days: event.target.checked ? [...value.off_days, day] : value.off_days.filter((item) => item !== day) })
                }
              />
              {name}
            </label>
          ))}
        </div>
      </div>
      <div className="form-row">
        <label className="field">
          <span>نقطة زرقاء بعد العمل بعد نهاية الدوام بـ (دقيقة)</span>
          <input type="number" min={0} max={600} value={value.overtime_minutes} onChange={(event) => set({ overtime_minutes: Number(event.target.value) })} />
        </label>
        <label className="field">
          <span>نقطة زرقاء للعمل في الإجازة لمدة (دقيقة)</span>
          <input type="number" min={0} max={720} value={value.offday_min_minutes} onChange={(event) => set({ offday_min_minutes: Number(event.target.value) })} />
        </label>
      </div>
      <p className="hint">
        نقطة خضراء لمن يبدأ قبل {value.start} بـ {number(value.grace_minutes)} دقيقة سماح ويبقى حتى {value.end}، وسوداء لمن يتأخر بعد
        ذلك.
      </p>
    </section>
  );
}

/** How long an investigator has, after accepting, before the case goes to someone else. */
function WorkTimeCard() {
  const [minutes, setMinutes] = useState<number | null | undefined>(undefined);
  const [hours, setHours] = useState("");
  const [penalty, setPenalty] = useState(0);
  const [penaltyDraft, setPenaltyDraft] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<{ work_minutes: number | null; excuse_penalty: number }>("/investigations/dispatch/work-time")
      .then((data) => {
        setMinutes(data.work_minutes);
        setPenalty(data.excuse_penalty);
        setPenaltyDraft(String(data.excuse_penalty));
        setHours(data.work_minutes ? String(Math.round((data.work_minutes / 60) * 100) / 100) : "");
      })
      .catch(() => setError("تعذّر تحميل مهلة الإنجاز."));
  }, []);

  const save = async (value: number | null, charge = penalty) => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const data = await api<{ work_minutes: number | null; excuse_penalty: number }>("/investigations/dispatch/work-time", {
        method: "PATCH",
        body: JSON.stringify({ work_minutes: value, excuse_penalty: charge }),
      });
      setMinutes(data.work_minutes);
      setPenalty(data.excuse_penalty);
      setPenaltyDraft(String(data.excuse_penalty));
      if (!data.work_minutes) setHours("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "تعذّر حفظ المهلة.");
    } finally {
      setBusy(false);
    }
  };
  const wanted = hours.trim() ? Math.round(Number(hours) * 60) : null;
  const charge = Math.max(0, Number(penaltyDraft) || 0);

  return (
    <section className="glass panel rules-card">
      <div className="panel-heading">
        <h2>المهلة والاعتذار عن الاستعلام</h2>
        <Icon name="clock" size={18} />
      </div>
      <p className="hint">
        بعد أن يقبل المستعلم الاستعلام (أو من موعد الزيارة في الاستعلامات المجدولة)، إذا لم يرسل التقرير خلال هذه المدة
        يُسحب منه ويُرسل لمستعلم آخر في نفس المنطقة.
      </p>
      <ErrorMessage message={error} />
      {saved && <p className="success-message">حُفظت الإعدادات وتُطبَّق من الآن.</p>}
      {minutes !== undefined && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save(wanted, charge);
          }}
        >
          <div className="form-row">
            <label className="field">
              <span>المهلة بالساعات</span>
              <input
                type="number"
                min={0.25}
                max={336}
                step={0.25}
                placeholder="بدون مهلة"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            </label>
            <label className="field">
              <span>خصم الاعتذار بعد القبول (ج.م)</span>
              <input type="number" min={0} step={5} value={penaltyDraft} onChange={(event) => setPenaltyDraft(event.target.value)} />
            </label>
          </div>
          <p className="hint">
            إذا قبل المستعلم الاستعلام ثم اعتذر عنه، يُرسل فورًا لمستعلم آخر في المنطقة، ويظهر الاعتذار لك في صفحة المحققين،
            ويُخصم هذا المبلغ من مستحقاته هذا الشهر{charge ? ` (${money(charge)})` : " (0 = بدون خصم)"}.
          </p>
          <p className="hint">
            {minutes ? `المهلة الحالية: ${number(Math.round((minutes / 60) * 100) / 100)} ساعة.` : "المهلة الحالية: بدون مهلة."}
          </p>
          <div className="inline">
            <button className="btn btn-primary" disabled={busy || (wanted === minutes && charge === penalty) || (wanted !== null && !(wanted >= 15))}>
              <Icon name="check" size={16} />
              حفظ
            </button>
            {minutes ? (
              <button type="button" className="btn ghost" disabled={busy} onClick={() => void save(null, charge)}>
                إلغاء المهلة
              </button>
            ) : null}
          </div>
        </form>
      )}
    </section>
  );
}

export function RulesPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ settings: Settings }>("/headoffice/settings")
      .then((data) => setSettings(data.settings))
      .catch(() => setError("تعذّر تحميل الإعدادات."));
  }, []);

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const data = await api<{ settings: Settings }>("/headoffice/settings", { method: "PATCH", body: JSON.stringify(settings) });
      setSettings(data.settings);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "تعذّر حفظ الإعدادات.");
    } finally {
      setBusy(false);
    }
  };
  const points = settings?.points;
  const setPoints = (patch: Partial<PointRules>) => settings && setSettings({ ...settings, points: { ...settings.points, ...patch } });

  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            الإدارة العليا <span>/</span> الدوام والنقاط
          </p>
          <h1>
            قواعد واضحة. <span>للجميع.</span>
          </h1>
          <p className="page-description">مواعيد الدوام لكل فريق، وقيمة النقاط في الراتب، وكم نقطة زرقاء تمحو نقطة سوداء.</p>
        </div>
        <button className="btn btn-primary" disabled={busy || !settings} onClick={() => void save()}>
          <Icon name="check" size={16} />
          حفظ الإعدادات
        </button>
      </div>
      <ErrorMessage message={error} />
      {saved && <p className="success-message">حُفظت الإعدادات وتُطبَّق من الآن.</p>}
      {settings && points && (
        <>
          <div className="finance-grid">
            <ScheduleCard title="دوام المديرين" value={settings.schedules.admin} onChange={(admin) => setSettings({ ...settings, schedules: { ...settings.schedules, admin } })} />
            <ScheduleCard
              title="دوام المستعلمين"
              value={settings.schedules.investigator}
              onChange={(investigator) => setSettings({ ...settings, schedules: { ...settings.schedules, investigator } })}
            />
          </div>
          <section className="glass panel rules-card">
            <div className="panel-heading">
              <h2>قيمة النقاط</h2>
              <Icon name="badge" size={18} />
            </div>
            <div className="form-row three">
              <label className="field">
                <span>كم نقطة زرقاء تمحو نقطة سوداء؟</span>
                <input type="number" min={0} max={50} value={points.blue_per_black} onChange={(event) => setPoints({ blue_per_black: Number(event.target.value) })} />
              </label>
              <label className="field">
                <span>مكافأة كل نقطة زرقاء متبقية (ج.م)</span>
                <input type="number" min={0} step={10} value={points.blue_bonus} onChange={(event) => setPoints({ blue_bonus: Number(event.target.value) })} />
              </label>
              <label className="field">
                <span>خصم كل نقطة سوداء متبقية (ج.م)</span>
                <input type="number" min={0} step={10} value={points.black_deduction} onChange={(event) => setPoints({ black_deduction: Number(event.target.value) })} />
              </label>
            </div>
            <label className="price-toggle">
              <input type="checkbox" checked={points.absence_black} onChange={(event) => setPoints({ absence_black: event.target.checked })} />
              نقطة سوداء تلقائية عن كل يوم عمل بلا حضور
            </label>
            <div className="rules-example">
              <strong>مثال:</strong>{" "}
              {points.blue_per_black > 0
                ? `من لديه نقطتان سوداوان و${number(points.blue_per_black)} نقاط زرقاء في الشهر تُمحى له نقطة سوداء واحدة، ويُخصم منه ${money(points.black_deduction)} عن النقطة الباقية. وكل نقطة زرقاء زائدة تضيف ${money(points.blue_bonus)}`
                : `النقاط الزرقاء لا تمحو السوداء؛ كل سوداء تخصم ${money(points.black_deduction)} وكل زرقاء تضيف ${money(points.blue_bonus)}`}
            </div>
            <p className="hint">يُحسب الغياب من {settings.tracking_since}، تاريخ بدء استخدام النظام.</p>
          </section>
          <WorkTimeCard />
        </>
      )}
    </div>
  );
}
