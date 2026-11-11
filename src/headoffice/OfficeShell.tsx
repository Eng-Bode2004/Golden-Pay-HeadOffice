import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { GlassNav, type NavItem } from "../components/GlassNav";
import { Ambient, Avatar, Brand, Icon } from "../components/ui";
import { Preferences } from "../preferences";

export function OfficeShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [openComplaints, setOpenComplaints] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      api<{ open: { complaints: number; messages: number } }>("/headoffice/complaints?status=open")
        .then((data) => active && setOpenComplaints(data.open.complaints + data.open.messages))
        .catch(() => active && setOpenComplaints(null));
    load();
    const interval = window.setInterval(load, 60000);
    window.addEventListener("gp-complaints-changed", load);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("gp-complaints-changed", load);
    };
  }, []);

  useEffect(() => {
    // Light follows the pointer across glass surfaces; metric cards also tilt.
    const move = (event: PointerEvent) => {
      const surface = (event.target as Element).closest<HTMLElement>(".glass, .card");
      if (!surface) return;
      const box = surface.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      surface.style.setProperty("--mx", `${x * 100}%`);
      surface.style.setProperty("--my", `${y * 100}%`);
      if (surface.classList.contains("metric")) {
        surface.style.setProperty("--rx", `${(0.5 - y) * 11}deg`);
        surface.style.setProperty("--ry", `${(x - 0.5) * 11}deg`);
      }
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);

  const links: NavItem[] = [
    { to: "/", label: "نظرة عامة", icon: "home" },
    { to: "/staff", label: "الموظفون", icon: "users" },
    { to: "/attendance", label: "الحضور", icon: "history" },
    { to: "/payroll", label: "الرواتب", icon: "badge" },
    { to: "/expenses", label: "المصروفات", icon: "file" },
    { to: "/complaints", label: "الشكاوى والرسائل", icon: "message", badge: openComplaints },
    { to: "/templates", label: "القوالب والتقارير", icon: "grid" },
    { to: "/rules", label: "الدوام والنقاط", icon: "star" },
    { to: "/app-updates", label: "تحديثات التطبيق", icon: "refresh" },
  ];

  return (
    <div className="app office-app" dir={document.documentElement.dir}>
      <Ambient />
      <a href="#main-content" className="skip-link">
        انتقل إلى المحتوى
      </a>
      <header className="workspace-header">
        <Link to="/" className="brand-link office-brand">
          <Brand />
          <span className="office-tag">الإدارة العليا</span>
        </Link>
        <GlassNav items={links} label="التنقل الرئيسي" className="pill-nav" />
        <div className="header-tools">
          <Preferences />
          <span className="header-avatar" title={user?.full_name ?? ""}>
            <Avatar name={user?.full_name ?? "جولدن باي"} small />
            <i />
          </span>
        </div>
      </header>
      <aside className="icon-rail">
        <Brand compact />
        <GlassNav items={links} label="اختصارات الإدارة العليا" className="rail-links" iconOnly />
        <button className="rail-logout" onClick={() => void logout()} aria-label="تسجيل الخروج" title="تسجيل الخروج">
          <Icon name="logout" />
        </button>
      </aside>
      <main className="main" id="main-content" tabIndex={-1}>
        <div className="route-stage" key={location.pathname}>
          <Outlet />
        </div>
      </main>
      <footer className="workspace-footer">
        <span>
          جولدن باي للخدمات <i>·</i> الإدارة العليا
        </span>
      </footer>
    </div>
  );
}
