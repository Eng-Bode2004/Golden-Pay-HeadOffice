import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { money } from "../components/Finance";
import { date, Icon, number } from "../components/ui";

interface Excuse {
  excuse_id: string;
  reference: string | null;
  reason: string;
  penalty: number;
  created_at: string;
  user_id: string;
  full_name: string;
  employee_number: string | null;
  status: string | null;
  subject_name: string | null;
  now_with: string | null;
}

const NOW: Record<string, string> = {
  open: "يُعرض على مستعلم آخر",
  unassigned: "لم يقبله أحد — يحتاج تدخل الإدارة",
  assigned: "مع",
  in_progress: "مع",
  returned: "مع",
  submitted: "أُرسل التقرير",
  approved: "اعتُمد",
};

/** Investigators who excused themselves from cases they had accepted, newest first. */
export function ExcusesPanel() {
  const [rows, setRows] = useState<Excuse[] | null>(null);
  useEffect(() => {
    api<{ excuses: Excuse[] }>("/investigations/excuses")
      .then((data) => setRows(data.excuses))
      .catch(() => setRows([]));
  }, []);
  if (!rows?.length) return null;
  const recent = rows.slice(0, 8);
  return (
    <section className="glass panel excuses-panel page-enter">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">اعتذارات بعد القبول</span>
          <h2>
            اعتذر عن {number(rows.length)} {rows.length === 1 ? "استعلام" : "استعلامات"}
          </h2>
        </div>
        <Icon name="message" size={18} />
      </div>
      <ul className="excuse-list">
        {recent.map((row) => (
          <li key={row.excuse_id}>
            <div>
              <Link to={`/investigators/${row.user_id}`} className="excuse-who">
                {row.full_name}
              </Link>
              <span className="mono">{row.reference ?? "—"}</span>
              <small>{date(row.created_at)}</small>
            </div>
            <p>«{row.reason}»</p>
            <div className="excuse-meta">
              {row.penalty > 0 ? <span className="badge danger-badge">خُصم {money(row.penalty)}</span> : <span className="badge">بدون خصم</span>}
              <span className="hint">
                {row.status ? `${NOW[row.status] ?? row.status}${row.now_with ? ` ${row.now_with}` : ""}` : "حُذف الاستعلام"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
