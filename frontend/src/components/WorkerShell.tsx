import type { PropsWithChildren } from "react";
import { useMemo, useRef, useState } from "react";
import { Home, FileText, Shield, TrendingUp } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { logout } from "../api/client";
import { useClickOutside } from "../hooks/useClickOutside";
import { useWorkerStore } from "../store/workerStore";

type WorkerTab = "home" | "policy" | "claims" | "premium";

interface WorkerShellProps extends PropsWithChildren {
  activeTab: WorkerTab;
  maxWidth?: number;
  pageTitle?: string;
}

function maskPhone(phone: string): string {
  if (!phone) return "+91 ****0000";
  const digits = phone.replace(/[^\d]/g, "");
  const lastFour = digits.slice(-4) || "0000";
  return `+91 ****${lastFour}`;
}

function SoteriaWordmark() {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
      <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.02em", color: "var(--text-primary)", lineHeight: 1 }}>
        S
      </span>
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 2.7l7 2.9v5.1c0 4.8-3 9-7 10.6-4-1.6-7-5.8-7-10.6V5.6l7-2.9z"
          fill="none"
          stroke="var(--text-primary)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.02em", color: "var(--text-primary)", lineHeight: 1 }}>
        teria
      </span>
    </div>
  );
}

export function WorkerShell({ activeTab, children, maxWidth = 920, pageTitle }: WorkerShellProps) {
  const navigate = useNavigate();
  const { currentWorker, clearAuth } = useWorkerStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);
  const workerName = currentWorker?.name ?? "Worker";
  const avatarLetter = workerName.charAt(0).toUpperCase() || "W";
  const maskedPhone = useMemo(() => maskPhone(currentWorker?.phone ?? ""), [currentWorker?.phone]);

  useClickOutside(avatarMenuRef, () => setMenuOpen(false), menuOpen);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // Continue sign-out flow even when API logout fails.
    } finally {
      clearAuth();
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("soteria_worker_v1");
      }
      setMenuOpen(false);
      setLoggingOut(false);
      navigate("/register", { replace: true });
    }
  }

  const tabs: Array<{
    key: WorkerTab;
    label: string;
    to: string;
    icon: typeof Home;
  }> = [
    { key: "home", label: "Home", to: "/dashboard", icon: Home },
    { key: "policy", label: "Policy", to: "/policy", icon: Shield },
    { key: "claims", label: "Claims", to: "/claims", icon: FileText },
    { key: "premium", label: "Premium", to: "/premium", icon: TrendingUp },
  ];
  const resolvedTitle =
    pageTitle ?? tabs.find((tab) => tab.key === activeTab)?.label ?? "Soteria";

  return (
    <div className="worker-shell">
      <header className="worker-shell__header">
        <div className="worker-shell__inner worker-shell__header-row" style={{ maxWidth }}>
          <Link to="/dashboard" className="worker-shell__brand touch-target" aria-label="Soteria Dashboard">
            <SoteriaWordmark />
          </Link>
          <div className="worker-shell__header-spacer">
            <p className="worker-shell__page-title">{resolvedTitle}</p>
          </div>

          <div ref={avatarMenuRef} style={{ position: "relative" }}>
            <button
              type="button"
              className="worker-shell__avatar touch-target"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Open account menu"
            >
              {avatarLetter}
            </button>
            {menuOpen ? (
              <div className="worker-shell__menu surface" role="menu">
                <p style={{ margin: 0, fontWeight: 700 }}>{workerName}</p>
                <p className="mono" style={{ margin: "4px 0 10px 0", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
                  {maskedPhone}
                </p>
                <button
                  type="button"
                  className="worker-shell__logout touch-target"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  role="menuitem"
                >
                  {loggingOut ? "Logging out..." : "Logout"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="worker-shell__desktop-nav-wrap">
          <nav className="worker-shell__desktop-nav worker-shell__inner" style={{ maxWidth }} aria-label="Worker Navigation">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = tab.key === activeTab;
              return (
                <Link
                  key={tab.key}
                  to={tab.to}
                  className={`worker-shell__desktop-link touch-target ${active ? "is-active" : ""}`}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="layout worker-shell__content" style={{ maxWidth }}>
        {children}
      </main>

      <nav className="worker-shell__bottom-nav" aria-label="Worker Navigation">
        <div className="worker-shell__bottom-inner" style={{ maxWidth }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.key === activeTab;
            return (
              <Link key={tab.key} to={tab.to} className="worker-shell__bottom-link touch-target">
                <span className={`worker-shell__bottom-dot ${active ? "is-active" : ""}`} />
                <Icon size={20} color={active ? "#5b4fff" : "#9a9a9a"} />
                <span style={{ color: active ? "#5b4fff" : "#9a9a9a" }}>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
