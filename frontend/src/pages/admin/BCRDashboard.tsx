import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";

import { AdminLayout } from "./AdminLayout";
import { Card } from "../../design-system/components/Card";
import { Badge } from "../../design-system/components/Badge";
import { getBcr } from "../../api/client";

function zoneColor(bcr: number): string {
  if (bcr < 0.7) return "var(--success)";
  if (bcr < 0.85) return "var(--warning)";
  return "var(--danger)";
}

export function BCRDashboardPage() {
  const query = useQuery({
    queryKey: ["bcr-dashboard"],
    queryFn: getBcr,
    refetchInterval: 20_000,
  });
  const pools =
    query.data?.data?.pools ??
    [
      { pool_id: "delhi_aqi_pool", bcr: 0.64, status: "healthy", trend_4w: [0.58, 0.61, 0.63, 0.64], suspended: false },
      { pool_id: "mumbai_rain_pool", bcr: 0.72, status: "warning", trend_4w: [0.69, 0.7, 0.71, 0.72], suspended: false },
      { pool_id: "chennai_rain_pool", bcr: 0.68, status: "healthy", trend_4w: [0.66, 0.67, 0.67, 0.68], suspended: false },
      { pool_id: "bangalore_mixed_pool", bcr: 0.62, status: "healthy", trend_4w: [0.58, 0.6, 0.61, 0.62], suspended: false },
      { pool_id: "kolkata_flood_pool", bcr: 0.88, status: "critical", trend_4w: [0.74, 0.79, 0.84, 0.88], suspended: true },
      { pool_id: "hyderabad_heat_pool", bcr: 0.67, status: "healthy", trend_4w: [0.63, 0.65, 0.66, 0.67], suspended: false },
    ];

  return (
    <AdminLayout>
      <Card>
        <h1 style={{ marginTop: 0 }}>BCR Dashboard</h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
          {pools.map((pool: any) => (
            <div key={pool.pool_id} className="surface" style={{ padding: 12, position: "relative" }}>
              {pool.suspended ? (
                <div style={{ position: "absolute", right: 8, top: 8 }}>
                  <Badge tone="danger">SUSPENDED</Badge>
                </div>
              ) : null}
              <p className="mono" style={{ margin: 0 }}>
                {pool.pool_id}
              </p>
              <p style={{ margin: "6px 0 0 0", fontSize: "var(--text-lg)", fontWeight: 800, color: zoneColor(pool.bcr) }}>{pool.bcr.toFixed(2)}</p>
              <div style={{ marginTop: 8, height: 10, background: "var(--bg-base)", border: "1px solid var(--bg-border)", borderRadius: 4 }}>
                <div style={{ width: `${Math.min(pool.bcr, 1) * 100}%`, height: "100%", background: zoneColor(pool.bcr), borderRadius: 4 }} />
              </div>
              <div style={{ height: 40, marginTop: 8 }}>
                <ResponsiveContainer>
                  <LineChart data={pool.trend_4w.map((v: number, i: number) => ({ i, v }))}>
                    <Tooltip />
                    <Line type="monotone" dataKey="v" stroke={zoneColor(pool.bcr)} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </AdminLayout>
  );
}

