import type { PropsWithChildren } from "react";
import { Link, useLocation } from "react-router-dom";

const links = [
  { to: "/admin", label: "Overview" },
  { to: "/admin/bcr", label: "BCR Monitor" },
  { to: "/admin/claims", label: "Claims Queue" },
  { to: "/admin/heatmap", label: "H3 Heatmap" },
  { to: "/admin/fraud", label: "Fraud Alerts" },
  { to: "/admin/ml", label: "ML Engine" },
];

export function AdminLayout({ children }: PropsWithChildren) {
  const location = useLocation();
  return (
    <main className="layout grid-2">
      <aside className="card" style={{ height: "fit-content", position: "sticky", top: 16 }}>
        <p className="mono" style={{ marginTop: 0, marginBottom: 12 }}>
          SOTERIA_ADMIN
        </p>
        <nav style={{ display: "grid", gap: 8 }}>
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="touch-target surface mono"
              style={{
                display: "grid",
                placeItems: "center",
                borderColor: location.pathname === link.to ? "var(--accent)" : "var(--bg-border)",
                color: location.pathname === link.to ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <section>{children}</section>
    </main>
  );
}

