import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../auth";
import { Ambient, Brand, Emblem, Icon } from "../components/ui";
import { LoginPage } from "../pages/Login";
import { AppUpdatesPage } from "./AppUpdates";
import { AttendancePage } from "./Attendance";
import { ComplaintsPage } from "./Complaints";
import { ExpensesPage } from "./Expenses";
import { OfficeOverviewPage } from "./OfficeOverview";
import { OfficeShell } from "./OfficeShell";
import { PayrollPage } from "./Payroll";
import { RulesPage } from "./Rules";
import { StaffPage } from "./Staff";
import { StaffProfilePage } from "./StaffProfile";
import { TemplateDetailPage } from "./templates/TemplateDetail";
import { TemplatesLibraryPage } from "./templates/TemplatesLibrary";
import { VersionWorkspacePage } from "./templates/VersionWorkspace";

/** Signed in, but the account is not head office. */
function NotHeadOffice() {
  const { user, logout } = useAuth();
  return (
    <div className="auth-shell" dir={document.documentElement.dir}>
      <Ambient />
      <header className="auth-header">
        <Brand />
      </header>
      <div className="auth-content page-enter office-denied">
        <section className="auth-card">
          <div className="auth-card-head">
            <span className="lock-icon">
              <Icon name="lock" size={22} />
            </span>
            <h2>هذه اللوحة للإدارة العليا فقط.</h2>
            <p className="hint">
              الحساب {user?.full_name} ليس لديه صلاحية الإدارة العليا. استخدم لوحة الإدارة المعتادة، أو سجّل الدخول بحساب
              الإدارة العليا.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => void logout()}>
            <Icon name="logout" size={17} />
            تسجيل الخروج
          </button>
        </section>
      </div>
    </div>
  );
}

export function OfficeApp() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="boot-screen" role="status">
        <Emblem className="boot-emblem" />
        <span>جارٍ تجهيز لوحة الإدارة العليا…</span>
        <i />
      </div>
    );
  if (!user)
    return (
      <Routes>
        <Route path="*" element={<LoginPage office />} />
      </Routes>
    );
  if (!user.roles.includes("head_office")) return <NotHeadOffice />;

  return (
    <Routes>
      <Route path="/" element={<OfficeShell />}>
        <Route index element={<OfficeOverviewPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="staff/:id" element={<StaffProfilePage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="complaints" element={<ComplaintsPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="app-updates" element={<AppUpdatesPage />} />
        <Route path="templates" element={<TemplatesLibraryPage />} />
        <Route path="templates/versions/:versionId" element={<VersionWorkspacePage />} />
        <Route path="templates/:templateId" element={<TemplateDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
