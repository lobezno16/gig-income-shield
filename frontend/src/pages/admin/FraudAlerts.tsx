import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AdminLayout } from "./AdminLayout";
import { Card } from "../../design-system/components/Card";
import { Badge } from "../../design-system/components/Badge";
import { Button } from "../../design-system/components/Button";
import { getFraudAlerts } from "../../api/client";

export function FraudAlertsPage() {
  const [selected, setSelected] = useState<any | null>(null);
  const query = useQuery({
    queryKey: ["fraud-alerts"],
    queryFn: getFraudAlerts,
    refetchInterval: 20_000,
  });

  const alerts =
    query.data?.data?.alerts ??
    [
      { claim_number: "CLM-2026-00049011", fraud_score: 0.83, flags: ["high_combined_risk"], cluster_size: 4, hexes: ["872a1072bffffff", "872a1078bffffff"], trigger: "aqi", temporal_window: "45 minutes" },
      { claim_number: "CLM-2026-00049810", fraud_score: 0.79, flags: ["soft_flag_review"], cluster_size: 3, hexes: ["872be924bffffff"], trigger: "rain", temporal_window: "30 minutes" },
    ];

  return (
    <AdminLayout>
      <Card>
        <h1 style={{ marginTop: 0 }}>Fraud Alerts</h1>
        <div style={{ display: "grid", gap: 12 }}>
          {alerts.map((a: any) => (
            <div key={a.claim_number} className="surface" style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p className="mono" style={{ margin: 0 }}>
                  {a.claim_number}
                </p>
                <Badge tone={a.fraud_score > 0.8 ? "danger" : "warning"}>Score {Number(a.fraud_score).toFixed(2)}</Badge>
              </div>
              <p style={{ margin: "8px 0", color: "var(--text-secondary)" }}>
                Cluster size: {a.cluster_size ?? 3} · Trigger: {a.trigger ?? "mixed"} · Window: {a.temporal_window ?? "20 mins"}
              </p>
              <Button variant="secondary" onClick={() => setSelected(a)}>
                Triage
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {selected ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "grid", placeItems: "center", padding: 16 }}>
          <Card style={{ width: "min(560px, 100%)" }}>
            <h2 style={{ marginTop: 0 }}>Triage Cluster</h2>
            <p className="mono">{selected.claim_number}</p>
            <p style={{ color: "var(--text-secondary)" }}>Individual worker verdicts loaded. Confirmed legitimate cases can be partially released.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <Button>Release 80% payout</Button>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </AdminLayout>
  );
}

