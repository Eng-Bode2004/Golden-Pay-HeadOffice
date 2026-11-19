import { useEffect, useState } from "react";
import { api } from "../api";
import { ReviewDrawer, SecureImage } from "../components/ReviewDrawer";
import { Avatar, Empty, ErrorMessage, Icon, number, Status } from "../components/ui";

interface RequestRow {
  user_id: string;
  full_name: string;
  employee_number: string | null;
  account_type: string;
  status: string;
  created_at: string;
}

const filters = [
  { value: "", label: "الكل" },
  { value: "existing_employee", label: "موظفون حاليون" },
  { value: "new_investigator", label: "متقدمون جدد" },
];

export function RequestsPage() {
  const [type, setType] = useState("");
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    const query = new URLSearchParams({ status: "pending", limit: "48" });
    if (type) query.set("account_type", type);
    api<{ users: RequestRow[]; pagination: { total: number } }>(`/admin/users?${query}`)
      .then((data) => {
        if (!active) return;
        setRows(data.users);
        setTotal(data.pagination.total);
      })
      .catch(() => {
        if (active) setError("تعذّر تحميل الطلبات.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [type, reload]);

  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            مساحة العمل <span>/</span> طلبات التفعيل
          </p>
          <h1>
            طلبات جاهزة. <span>قرار واحد.</span>
          </h1>
          <p className="page-description">
            راجع بيانات كل موظف وصورته، ثم فعّل حسابه بضغطة.
          </p>
        </div>
        <button
          className="icon-button"
          onClick={() => setReload((value) => value + 1)}
          disabled={busy}
          title="تحديث البيانات"
          aria-label="تحديث البيانات"
        >
          <Icon name="refresh" className={busy ? "spinning" : ""} />
        </button>
      </div>
      <ErrorMessage message={error} />
      {notice && (
        <div className="success-message" role="status">
          {notice}
        </div>
      )}
      <div className="requests-toolbar">
        <div className="segmented" role="tablist">
          {filters.map((filter) => (
            <button
              key={filter.value}
              role="tab"
              aria-selected={type === filter.value}
              className={type === filter.value ? "active" : ""}
              onClick={() => setType(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <span className="count-label">
          {number(total)} طلب بانتظار قرارك
        </span>
      </div>
      {!busy && !rows.length && !error && (
        <section className="glass panel">
          <Empty>لا توجد طلبات بانتظار التفعيل.</Empty>
        </section>
      )}
      <div className="request-grid" aria-busy={busy}>
        {rows.map((row, index) => (
          <article
            className="glass request-card"
            key={row.user_id}
            style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
          >
            <div className="request-photo">
              <SecureImage
                path={`/admin/users/${row.user_id}/photo`}
                alt={row.full_name}
                fallback={<Avatar name={row.full_name} color={index} />}
              />
            </div>
            <h2>{row.full_name}</h2>
            <p className="mono">{row.employee_number ?? "—"}</p>
            <div className="request-meta">
              <Status status={row.status} />
              <span className="badge">
                {row.account_type === "existing_employee" ? "موظف حالي" : "متقدم جديد"}
              </span>
            </div>
            <button
              className="btn btn-primary btn-block"
              onClick={() => {
                setNotice("");
                setReviewing(row.user_id);
              }}
            >
              مراجعة وتفعيل
              <Icon name="arrow" size={16} />
            </button>
          </article>
        ))}
      </div>
      {reviewing && (
        <ReviewDrawer
          userId={reviewing}
          onClose={() => setReviewing(null)}
          onDecided={(message) => {
            setReviewing(null);
            setNotice(message);
            setReload((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
