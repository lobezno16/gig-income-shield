import { useQuery } from "@tanstack/react-query";

import { AdminLayout } from "./AdminLayout";
import { Card } from "../../design-system/components/Card";
import { getOverview } from "../../api/client";
import { formatINR } from "../../utils/formatters";

export function AdminOverviewPage() {
  const query = useQuery({
    queryKey: ["admin-overview"],
    queryFn: getOverview,
    refetchInterval: 20_000,
  });

  const metrics =
    query.data?.data ??
    {
      active_policies: 50,
      total_workers: 50,
      premiums_this_week: 1820000,
      claims_paid: 1260000,
      avg_fraud_score: 0.33,
      pool_bcr: 0.69,
    };

  const cards = [
    { label: "Active Policies", value: metrics.active_policies },
    { label: "Total Workers", value: metrics.total_workers },
    { label: "Premiums This Week", value: formatINR(metrics.premiums_this_week) },
    { label: "Claims Paid", value: formatINR(metrics.claims_paid) },
    { label: "Avg Fraud Score", value: metrics.avg_fraud_score.toFixed(2) },
    { label: "Pool BCR", value: metrics.pool_bcr.toFixed(2) },
  ];

  return (
    <AdminLayout>
      <Card>
        <h1 style={{ marginTop: 0 }}>Admin Overview</h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          {cards.map((c) => (
            <div key={c.label} className="surface" style={{ padding: 12 }}>
              <p style={{ margin: 0, color: "var(--text-secondary)" }}>{c.label}</p>
              <p className="mono" style={{ margin: "8px 0 0 0", fontSize: "var(--text-lg)", fontWeight: 700 }}>
                {c.value}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </AdminLayout>
  );
}

