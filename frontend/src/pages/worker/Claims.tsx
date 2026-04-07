import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Calculator, CheckCircle, IndianRupee, Shield, Zap } from "lucide-react";

import { Card } from "../../design-system/components/Card";
import { Badge } from "../../design-system/components/Badge";
import { CLAIM_STEPS, MOCK_CLAIMS } from "../../utils/mockData";
import { formatDateTime, formatINR } from "../../utils/formatters";
import { useAuthGuard } from "../../hooks/useAuthGuard";
import { useWorkerStore } from "../../store/workerStore";
import { useClaims } from "../../hooks/useClaims";

const iconMap = {
  AlertTriangle,
  Shield,
  CheckCircle,
  Calculator,
  Zap,
  IndianRupee,
} as const;

export function WorkerClaimsPage() {
  const [searchParams] = useSearchParams();
  const demoMode = searchParams.get("demo") === "true";
  const { isAuthenticated, isLoading } = useAuthGuard();
  const { currentWorker } = useWorkerStore();
  const query = useClaims(currentWorker?.id ?? "");
  const [activeIndex, setActiveIndex] = useState(5);

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated || !currentWorker) {
    return null;
  }

  useEffect(() => {
    if (!demoMode) return;
    setActiveIndex(2);
    const t1 = window.setTimeout(() => setActiveIndex(3), 3000);
    const t2 = window.setTimeout(() => setActiveIndex(4), 6500);
    const t3 = window.setTimeout(() => setActiveIndex(5), 10000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [demoMode]);

  const claims = query.data?.data?.claims ?? MOCK_CLAIMS.map((c) => ({ ...c, created_at: c.date }));

  const timeline = useMemo(
    () =>
      CLAIM_STEPS.map((step, idx) => ({
        ...step,
        state: idx < activeIndex ? "completed" : idx === activeIndex ? "active" : "future",
      })),
    [activeIndex]
  );

  return (
    <main className="layout" style={{ maxWidth: 840 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>Claims Management</h1>
        <p style={{ color: "var(--text-secondary)", marginTop: 0 }}>
          Zero-touch trigger → ARGUS verification → UPI settlement timeline
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          {timeline.map((step) => {
            const Icon = iconMap[step.icon as keyof typeof iconMap] ?? CheckCircle;
            return (
              <div key={step.id} style={{ display: "grid", gridTemplateColumns: "48px 1fr", gap: 12, alignItems: "start" }}>
                <div
                  className={step.state === "active" ? "pulse" : ""}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 999,
                    border: "2px solid " + (step.state === "completed" ? "var(--success)" : step.state === "active" ? "var(--accent)" : "var(--bg-border)"),
                    display: "grid",
                    placeItems: "center",
                    background: step.state === "completed" ? "rgba(0,217,126,0.12)" : "transparent",
                    color: step.state === "future" ? "var(--text-disabled)" : "var(--text-primary)",
                  }}
                >
                  <Icon size={16} />
                </div>
                <div style={{ borderLeft: "2px solid var(--bg-border)", paddingLeft: 12 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{step.label}</strong>
                    <Badge tone={step.state === "completed" ? "success" : step.state === "active" ? "info" : "muted"}>{step.state}</Badge>
                  </div>
                  <p style={{ margin: "4px 0", color: "var(--text-secondary)" }}>{step.description}</p>
                  <p className="mono" style={{ margin: 0, fontSize: "var(--text-sm)" }}>
                    {step.timestamp}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Recent Claims</h2>
        {claims.map((c: any) => (
          <div key={c.claim_number} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--bg-border)", padding: "8px 0" }}>
            <div>
              <p className="mono" style={{ margin: 0 }}>
                {c.claim_number}
              </p>
              <p style={{ margin: 0, color: "var(--text-secondary)" }}>{formatDateTime(c.created_at || c.date)}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0 }}>{formatINR(c.amount ?? c.payout_amount)}</p>
              <Badge tone={c.status === "paid" ? "success" : c.status === "processing" ? "info" : "warning"}>{c.status}</Badge>
            </div>
          </div>
        ))}
      </Card>

      <div style={{ marginTop: 12 }}>
        <Link to={`/dashboard${demoMode ? "?demo=true" : ""}`} className="surface touch-target" style={{ display: "grid", placeItems: "center" }}>
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
