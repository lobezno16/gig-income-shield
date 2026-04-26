import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

type WorkerTab = "home" | "policy" | "claims" | "plan";

interface WorkerLayoutProps {
  activeTab: WorkerTab;
  children: ReactNode;
  maxWidth?: number;
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V10.5z" stroke={active ? "var(--accent)" : "var(--text-secondary)"} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function PolicyIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke={active ? "var(--accent)" : "var(--text-secondary)"} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M15 3v5h5" stroke={active ? "var(--accent)" : "var(--text-secondary)"} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 12h6M9 16h6" stroke={active ? "var(--accent)" : "var(--text-secondary)"} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ClaimsIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 4h12v16H6z" stroke={active ? "var(--accent)" : "var(--text-secondary)"} strokeWidth="1.8" />
      <path d="M9 9h6M9 13h6M9 17h4" stroke={active ? "var(--accent)" : "var(--text-secondary)"} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlanIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v4M12 17v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M3 12h4M17 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" stroke={active ? "var(--accent)" : "var(--text-secondary)"} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="4" stroke={active ? "var(--accent)" : "var(--text-secondary)"} strokeWidth="1.8" />
    </svg>
  );
}

export function WorkerLayout({ activeTab, children, maxWidth = 900 }: WorkerLayoutProps) {
  const location = useLocation();
  const keepDemo = location.search.includes("demo=true");
  const suffix = keepDemo ? "?demo=true" : "";

  const navItems: Array<{ key: WorkerTab; label: string; to: string }> = [
    { key: "home", label: "Home", to: `/dashboard${suffix}` },
    { key: "policy", label: "Policy", to: `/policy${suffix}` },
    { key: "claims", label: "Claims", to: `/claims${suffix}` },
    { key: "plan", label: "Plan", to: `/premium${suffix}` },
  ];

  return (
    <>
      <main className="layout worker-layout" style={{ maxWidth }}>
        {children}
      </main>
      <nav className="worker-bottom-nav" aria-label="Worker Navigation">
        <div className="worker-bottom-nav__inner">
          {navItems.map((item) => {
            const active = item.key === activeTab;
            return (
              <Link
                key={item.key}
                to={item.to}
                className="worker-bottom-nav__item"
                aria-current={active ? "page" : undefined}
              >
                {item.key === "home" ? <HomeIcon active={active} /> : null}
                {item.key === "policy" ? <PolicyIcon active={active} /> : null}
                {item.key === "claims" ? <ClaimsIcon active={active} /> : null}
                {item.key === "plan" ? <PlanIcon active={active} /> : null}
                <span style={{ color: active ? "var(--accent)" : "var(--text-secondary)" }}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
