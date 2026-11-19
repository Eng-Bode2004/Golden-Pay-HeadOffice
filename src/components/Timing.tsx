import { date, number } from "./ui";

/** "3 د" / "2 س 10 د" / "1 ي 4 س" for a number of minutes. */
export function minutesLabel(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return "—";
  if (minutes < 1) return `${number(Math.max(1, Math.round(minutes * 60)))} ث`;
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${number(total)} د`;
  const hours = Math.floor(total / 60);
  if (hours < 24) return `${number(hours)} س ${total % 60 ? `${number(total % 60)} د` : ""}`.trim();
  return `${number(Math.floor(hours / 24))} ي ${hours % 24 ? `${number(hours % 24)} س` : ""}`.trim();
}

export function between(from: string | null | undefined, to: string | null | undefined): string {
  if (!from || !to) return "—";
  return minutesLabel((new Date(to).getTime() - new Date(from).getTime()) / 60000);
}

/** A time with the gap since the previous step underneath. */
export function Stamp({ at, after }: { at: string | null | undefined; after?: string | null }) {
  if (!at) return <span className="stamp muted">—</span>;
  return (
    <span className="stamp">
      {date(at)}
      {after && <small>بعد {between(after, at)}</small>}
    </span>
  );
}

export const OFFER_RESPONSE: Record<string, string> = {
  accepted: "قبِل",
  declined: "رفض",
  expired: "انتهت المهلة",
  cancelled: "أُلغي",
  taken: "قبِله مستعلم آخر",
};

export const EVENT_LABEL: Record<string, string> = {
  created: "أنشأ الاستعلام",
  offered: "عُرض على",
  seen: "شاهده",
  accepted: "قبِله",
  declined: "رفضه",
  expired: "انتهت مهلة",
  unassigned: "لم يقبله أحد",
  redispatched: "أُعيد توزيعه",
  timed_out: "سُحب لانتهاء مهلة الإنجاز",
  excused: "اعتذر عنه بعد القبول",
  report_edited: "عدّل المدير التقرير",
  started: "بدأ العمل",
  submitted: "أرسل التقرير",
  resubmitted: "أعاد إرسال التقرير",
  returned: "طُلب تعديله",
  approved: "اعتُمد",
  cancelled: "أُلغي",
  waiting: "بانتظار مستعلم متاح",
  manually_assigned: "أُسند يدويًا إلى",
  reassigned: "نُقل إلى",
  accept_conflict: "حاول القبول بعد أن قبِله غيره",
  fairness: "عدالة التوزيع",
};
