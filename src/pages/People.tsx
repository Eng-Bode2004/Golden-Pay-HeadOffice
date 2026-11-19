import { useEffect, useRef, useState } from "react";
import { DeleteInvestigatorDrawer } from "../components/DeleteInvestigatorDrawer";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { money } from "../components/Finance";
import { api, ApiRequestError } from "../api";
import { ReviewDrawer } from "../components/ReviewDrawer";
import {
  Avatar,
  Empty,
  ErrorMessage,
  Icon,
  number,
  Status,
  statusLabels,
} from "../components/ui";

interface UserRow {
  user_id: string;
  full_name: string;
  email: string | null;
  employee_number: string | null;
  status: string;
  account_type: string;
}
interface Pagination {
  page: number;
  pages: number;
  total: number;
}
interface Performance {
  user_id: string;
  total: number;
  active: number;
  approved_month: number;
  earned_month: number;
}
interface WorkArea {
  user_id: string;
  governorate: string | null;
  district: string | null;
  /** Every area served ("الجيزة - الدقي | القاهرة"), the primary one first. */
  areas_label?: string | null;
  areas_count?: number;
}

export function PeoplePage() {
  const navigate = useNavigate();
  // Head office manages investigators at /investigators (the admin dashboard used /people).
  const base = useLocation().pathname.startsWith("/investigators") ? "/investigators" : "/people";
  const [performance, setPerformance] = useState<Map<string, Performance>>(new Map());
  const [areas, setAreas] = useState<Map<string, WorkArea>>(new Map());
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const status = params.get("status") ?? "";
  const page = Number(params.get("page") ?? 1);
  const [draftSearch, setDraftSearch] = useState(search);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pages: 1,
    total: 0,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState("");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    national_id_number: "",
    email: "",
  });
  const [created, setCreated] = useState<{
    number: string;
    password: string | null;
  } | null>(null);
  const createRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    setDraftSearch(search);
  }, [search]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    const query = new URLSearchParams({
      search,
      status,
      page: String(page),
      limit: "10",
    });
    api<{ users: UserRow[]; pagination: Pagination }>(`/admin/users?${query}`)
      .then((data) => {
        if (active) {
          setUsers(data.users);
          setPagination(data.pagination);
        }
      })
      .catch(() => {
        if (active) setError("تعذّر تحميل المحققين. حاول مجدداً.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [search, status, page, reload]);
  useEffect(() => {
    api<{ investigators: Performance[] }>("/investigations/performance")
      .then((data) => setPerformance(new Map(data.investigators.map((row) => [row.user_id, row]))))
      .catch(() => {});
    api<{ investigators: WorkArea[] }>("/investigators")
      .then((data) => setAreas(new Map(data.investigators.map((row) => [row.user_id, row]))))
      .catch(() => {});
  }, [reload]);
  useEffect(() => {
    if (params.get("create"))
      createRef.current?.querySelector("input")?.focus();
  }, [params]);
  function updateQuery(values: Record<string, string>) {
    setParams({ ...Object.fromEntries(params), ...values });
  }
  async function action(
    id: string,
    type: "suspend" | "reactivate",
  ) {
    if (
      type === "suspend" &&
      !window.confirm("هل تريد إيقاف هذا الحساب؟ سيتم إنهاء جلساته.")
    )
      return;
    setActionId(id);
    setError("");
    try {
      await api(`/admin/users/${id}/${type}`, {
        method: "POST",
        body: "{}",
      });
      setReload((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "تعذّر تحديث الحساب.",
      );
    } finally {
      setActionId("");
    }
  }
  async function createInvestigator(event: React.FormEvent) {
    event.preventDefault();
    setActionId("create");
    setError("");
    setCreated(null);
    try {
      const data = await api<{
        user: UserRow;
        employee_record: { employee_number: string };
        temporary_password: string | null;
      }>("/admin/investigators", {
        method: "POST",
        body: JSON.stringify({ ...form, email: form.email || undefined }),
      });
      setCreated({
        number: data.employee_record.employee_number,
        password: data.temporary_password,
      });
      setForm({ full_name: "", phone: "", national_id_number: "", email: "" });
      setReload((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "تعذّر إنشاء الحساب.",
      );
    } finally {
      setActionId("");
    }
  }
  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            مساحة العمل <span>/</span> المحققون
          </p>
          <h1>الفريق الذي يصنع الفارق.</h1>
          <p className="page-description">
            إدارة الحسابات ومراجعة طلبات الانضمام، من مكان واحد.
          </p>
        </div>
        <button
          className="btn"
          onClick={() => createRef.current?.querySelector("input")?.focus()}
        >
          <Icon name="plus" size={17} />
          محقق جديد
        </button>
      </div>
      <ErrorMessage message={error} />
      {created && (
        <div className="success-message" role="status">
          <strong>تم إنشاء حساب المحقق بنجاح.</strong>
          <p>
            رقم الموظف: <bdi className="mono">{created.number}</bdi>
          </p>
          {created.password && (
            <p>
              كلمة المرور المؤقتة:{" "}
              <bdi className="mono">{created.password}</bdi>
            </p>
          )}
          <small>سلّم بيانات الدخول للمحقق بطريقة آمنة.</small>
          <button
            className="icon-button"
            onClick={() => setCreated(null)}
            aria-label="إخفاء بيانات الدخول"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      <div className="split">
        <section className="glass panel" aria-busy={busy}>
          <div className="directory-toolbar">
            <div>
              <h2>دليل المحققين</h2>
              <span className="count-label">
                {number(pagination.total)} حساب مسجّل
              </span>
            </div>
            <form
              className="search-input"
              onSubmit={(e) => {
                e.preventDefault();
                updateQuery({ search: draftSearch, page: "1" });
              }}
            >
              <Icon name="search" size={17} />
              <input
                aria-label="بحث في المحققين"
                placeholder="اسم أو رقم موظف"
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
              />
            </form>
            <select
              className="filter-select"
              aria-label="تصفية حسب الحالة"
              value={status}
              onChange={(e) =>
                updateQuery({ status: e.target.value, page: "1" })
              }
            >
              <option value="">جميع الحالات</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>المحقق</th>
                  <th>رقم الموظف</th>
                  <th>الحالة</th>
                  <th>المنطقة</th>
                  <th>الاستعلامات</th>
                  <th>أرباح الشهر</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {users.map((person, i) => (
                  <tr
                    key={person.user_id}
                    className="clickable"
                    onClick={() => navigate(`${base}/${person.user_id}`)}
                  >
                    <td>
                      <div className="person-cell">
                        <Avatar name={person.full_name} small color={i} />
                        <div>
                          <strong>{person.full_name}</strong>
                          <small dir="ltr">
                            {person.email ??
                              (person.account_type === "existing_employee"
                                ? "موظف حالي"
                                : "محقق جديد")}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td className="mono">{person.employee_number ?? "—"}</td>
                    <td>
                      <Status status={person.status} />
                    </td>
                    <td title={areas.get(person.user_id)?.areas_label?.split(" | ").join("، ") ?? undefined}>
                      {[areas.get(person.user_id)?.governorate, areas.get(person.user_id)?.district]
                        .filter(Boolean)
                        .join(" - ") || "—"}
                      {(areas.get(person.user_id)?.areas_count ?? 0) > 1 && (
                        <small className="more-areas"> +{number((areas.get(person.user_id)?.areas_count ?? 1) - 1)} مناطق</small>
                      )}
                    </td>
                    <td>
                      {performance.get(person.user_id)
                        ? `${number(performance.get(person.user_id)!.total)} · ${number(performance.get(person.user_id)!.active)} نشط`
                        : "—"}
                    </td>
                    <td>{money(performance.get(person.user_id)?.earned_month)}</td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <div className="row-actions">
                        {person.status.includes("pending") ? (
                          <button
                            className="btn small btn-primary"
                            onClick={() => setReviewing(person.user_id)}
                          >
                            مراجعة وتفعيل
                          </button>
                        ) : person.status === "active" ? (
                          <button
                            disabled={actionId === person.user_id}
                            className="btn ghost small"
                            onClick={() =>
                              void action(person.user_id, "suspend")
                            }
                          >
                            إيقاف
                          </button>
                        ) : person.status === "suspended" ? (
                          <button
                            disabled={actionId === person.user_id}
                            className="btn small"
                            onClick={() =>
                              void action(person.user_id, "reactivate")
                            }
                          >
                            إعادة تنشيط
                          </button>
                        ) : null}
                        <button
                          className="btn ghost small btn-danger"
                          title="حذف المستعلم وكل بياناته نهائيًا"
                          onClick={() => setDeleting(person)}
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!busy && !users.length && <Empty>لا توجد حسابات تطابق البحث.</Empty>}
          <div className="table-footer">
            <span>
              {busy
                ? "جارٍ التحميل…"
                : `الصفحة ${number(pagination.page)} من ${number(Math.max(1, pagination.pages))}`}
            </span>
            <div className="inline">
              <button
                className="btn small ghost"
                disabled={page <= 1 || busy}
                onClick={() => updateQuery({ page: String(page - 1) })}
              >
                السابق
              </button>
              <button
                className="btn small ghost"
                disabled={page >= pagination.pages || busy}
                onClick={() => updateQuery({ page: String(page + 1) })}
              >
                التالي
              </button>
            </div>
          </div>
        </section>
        <div className="side-stack">
        <form className="card" ref={createRef} onSubmit={createInvestigator}>
          <span className="eyebrow">توسّع بثقة</span>
          <h2>إضافة محقق جديد</h2>
          <p className="hint">
            أنشئ حساباً نشطاً برقم موظف يتعرف عليه التطبيق مباشرة.
          </p>
          <label className="field">
            <span>الاسم الكامل</span>
            <input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              required
              autoComplete="name"
            />
          </label>
          <label className="field">
            <span>رقم الهاتف</span>
            <input
              dir="ltr"
              type="tel"
              placeholder="01XXXXXXXXX"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>الرقم القومي</span>
            <input
              dir="ltr"
              inputMode="numeric"
              maxLength={14}
              minLength={14}
              value={form.national_id_number}
              onChange={(e) =>
                setForm({ ...form, national_id_number: e.target.value })
              }
              required
            />
          </label>
          <label className="field">
            <span>
              البريد الإلكتروني <small>(اختياري)</small>
            </span>
            <input
              dir="ltr"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <button
            className="btn btn-primary btn-block"
            disabled={actionId === "create"}
          >
            <Icon name="plus" size={17} />
            {actionId === "create" ? "جارٍ الإنشاء…" : "إنشاء حساب المحقق"}
          </button>
          <p className="hint" style={{ marginTop: 15, fontSize: 10 }}>
            <Icon name="lock" size={12} /> ستظهر كلمة المرور المؤقتة مرة واحدة
            بعد الإنشاء.
          </p>
        </form>
        </div>
      </div>
      {deleting && (
        <DeleteInvestigatorDrawer
          user={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setReload((value) => value + 1);
          }}
        />
      )}
      {reviewing && (
        <ReviewDrawer
          userId={reviewing}
          onClose={() => setReviewing(null)}
          onDecided={() => {
            setReviewing(null);
            setReload((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
