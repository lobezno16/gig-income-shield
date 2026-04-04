import { Link, useSearchParams } from "react-router-dom";
import { useMemo } from "react";
import { CheckCircle, CloudRain, ShieldAlert, TriangleAlert } from "lucide-react";

import { Card } from "../../design-system/components/Card";
import { Badge } from "../../design-system/components/Badge";
import { StatusIndicator } from "../../design-system/components/StatusIndicator";
import { useWorkerStore } from "../../store/workerStore";
import { MOCK_CLAIMS, MOCK_TRIGGER_EVENTS } from "../../utils/mockData";
import { formatDateTime, formatINR } from "../../utils/formatters";
import { useSSE } from "../../hooks/useSSE";

const statusMap = {
  covered: "COVERED",
  alert: "ALERT INCOMING",
  processing: "PAYOUT PROCESSING",
  action_req: "ACTION NEEDED",
  inactive: "INACTIVE",
} as const;

export function WorkerDashboardPage() {
  const [searchParams] = useSearchParams();
  const demoMode = searchParams.get("demo") === "true";
  const { currentWorker, status } = useWorkerStore();
  const claimsFeed = useSSE("/api/sse/claims");

  const liveTrigger = useMemo(() => {
    if (demoMode) return MOCK_TRIGGER_EVENTS[0];
    const triggerEvent = claimsFeed.events.find((e) => e.type === "trigger_fired");
    return triggerEvent ? ({ ...MOCK_TRIGGER_EVENTS[0], ...triggerEvent.data } as typeof MOCK_TRIGGER_EVENTS[number]) : null;
  }, [claimsFeed.events, demoMode]);

  return (
    <main className="layout" style={{ maxWidth: 720 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>Worker Dashboard</p>
            <h1 style={{ margin: "4px 0 0 0", fontSize: "var(--text-xl)" }}>{currentWorker.name}</h1>
          </div>
          <Badge tone={currentWorker.tier === "gold" ? "warning" : currentWorker.tier === "silver" ? "muted" : "danger"}>
            {currentWorker.tier}
          </Badge>
        </div>
        <div style={{ height: 12 }} />
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div
            className={status === "covered" ? "pulse" : ""}
            style={{
              width: 80,
              height: 80,
              borderRadius: 999,
              border: "2px solid var(--bg-border)",
              background: status === "covered" ? "var(--success)" : status === "processing" ? "var(--info)" : status === "alert" ? "var(--warning)" : "var(--danger)",
            }}
          />
          <div>
            <StatusIndicator status={status} />
            <h2 style={{ margin: "8px 0", fontSize: "var(--text-lg)" }}>{statusMap[status]}</h2>
            <p className="mono" style={{ margin: 0 }}>
              Policy: SOT-2026-001847
            </p>
            <p style={{ margin: "6px 0 0 0", fontWeight: 800, fontSize: "var(--text-lg)" }}>
              Protected {formatINR(currentWorker.max_payout_week)}
            </p>
          </div>
        </div>
      </Card>

      {liveTrigger ? (
        <Card style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <ShieldAlert size={18} />
            <strong>{liveTrigger.label}</strong>
          </div>
          <p style={{ marginBottom: 0 }}>
            {demoMode ? "Payout Processing..." : "Live trigger received via SSE"}
          </p>
        </Card>
      ) : null}

      <div style={{ display: "flex", gap: 12, marginTop: 12, overflowX: "auto" }}>
          {[
            { label: "This Week Premium", value: formatINR(currentWorker.weekly_premium) },
            { label: "Total Claimed", value: formatINR(MOCK_CLAIMS.filter((c) => c.worker_id === currentWorker.id).reduce((s, c) => s + c.amount, 0)) },
            { label: "Active Since", value: "Mar 2026" },
          ].map((s) => (
            <Card key={s.label} style={{ minWidth: 180 }}>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>{s.label}</p>
            <p style={{ margin: "6px 0 0 0", fontSize: "var(--text-lg)", fontWeight: 700 }}>{s.value}</p>
          </Card>
        ))}
      </div>

      <Card style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Risk Forecast</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
            <div key={d} className="surface" style={{ padding: 8, textAlign: "center" }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>{d}</div>
              <div style={{ marginTop: 6 }}>{i % 3 === 0 ? <CloudRain size={14} /> : <CheckCircle size={14} />}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <Badge tone="warning">MODERATE</Badge>
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Recent Claims</h3>
        {MOCK_CLAIMS.slice(0, 3).map((claim) => (
          <div key={claim.claim_number} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--bg-border)" }}>
            <div>
              <p className="mono" style={{ margin: 0 }}>
                {claim.claim_number}
              </p>
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>{formatDateTime(claim.date)}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0, fontWeight: 700 }}>{formatINR(claim.amount)}</p>
              <Badge tone="success">{claim.status}</Badge>
            </div>
          </div>
        ))}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 12 }}>
        <Link to={`/policy${demoMode ? "?demo=true" : ""}`} className="surface touch-target" style={{ display: "grid", placeItems: "center" }}>
          View Policy
        </Link>
        <Link to={`/claims${demoMode ? "?demo=true" : ""}`} className="surface touch-target" style={{ display: "grid", placeItems: "center" }}>
          Claim History
        </Link>
        <Link to={`/premium${demoMode ? "?demo=true" : ""}`} className="surface touch-target" style={{ display: "grid", placeItems: "center" }}>
          Change Plan
        </Link>
      </div>
    </main>
  );
}
