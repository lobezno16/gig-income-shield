import type { LucideIcon } from "lucide-react";
import {
  AlertOctagon,
  BarChart2,
  BrainCircuit,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Map,
} from "lucide-react";
import type { PropsWithChildren } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { logout } from "../../api/client";
import { useWorkerStore } from "../../store/workerStore";

interface AdminLink {
  to: string;
  label: string;
  icon: LucideIcon;
}

const links: AdminLink[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/bcr", label: "BCR Monitor", icon: BarChart2 },
  { to: "/admin/claims", label: "Claims Queue", icon: ClipboardList },
  { to: "/admin/heatmap", label: "H3 Heatmap", icon: Map },
  { to: "/admin/fraud", label: "Fraud Alerts", icon: AlertOctagon },
  { to: "/admin/ml", label: "ML Engine", icon: BrainCircuit },
];

function SoteriaAdminBrand() {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
      <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>S</span>
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="var(--text-primary)" strokeWidth="1.6" />
        <path d="M12 6.5l4.4 1.7v3.2c0 2.8-1.7 5.3-4.4 6.1-2.7-.8-4.4-3.3-4.4-6.1V8.2L12 6.5z" fill="none" stroke="var(--text-primary)" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>teria</span>
    </div>
  );
}

export function AdminLayout({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const clearAuth = useWorkerStore((state) => state.clearAuth);

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Continue logout locally if API call fails.
    } finally {
      clearAuth();
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("soteria_worker_v1");
      }
      navigate("/register", { replace: true });
    }
  }

  return (
    <main className="layout grid-2">
      <aside className="card admin-shell__sidebar">
        <div>
          <div style={{ marginBottom: 14 }}>
            <SoteriaAdminBrand />
            <p style={{ margin: "6px 0 0 0", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>Admin Console</p>
          </div>
          <nav style={{ display: "grid", gap: 8 }}>
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === "/admin"}
                  className={({ isActive }) => `admin-shell__nav-link touch-target ${isActive ? "is-active" : ""}`}
                >
                  <Icon size={16} />
                  <span>{link.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
        <button type="button" className="admin-shell__logout touch-target" onClick={handleLogout}>
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </aside>
      <section>{children}</section>
    </main>
  );
}
