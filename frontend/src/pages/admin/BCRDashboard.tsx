import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";

import { getBcr, runStressTest } from "../../api/client";
import { Badge } from "../../design-system/components/Badge";
import { Button } from "../../design-system/components/Button";
import { Card } from "../../design-system/components/Card";
import { LastUpdatedIndicator } from "../../design-system/components/LastUpdatedIndicator";
import { formatINR } from "../../utils/formatters";
import { AdminLayout } from "./AdminLayout";

interface BcrPool {
  pool_id: string;
  bcr: number;
  status: string;
  trend_4w: number[];
  suspended: boolean;
  total_premiums?: number;
  total_claims?: number;
}

interface StressResult {
  workers_exposed: number;
  mean_total_liability: number;
  ci_90: [number, number];
  pool_reserves: number;
  pool_adequacy: number;
  mean_bcr: number;
  recommended_reserve_buffer: number;
  action: string;
}

function zoneColor(bcr: number): string {
  if (bcr < 0.7) return "var(--success)";
  if (bcr < 0.85) return "var(--warning)";
  if (bcr < 1) return "var(--danger)";
  return "var(--danger)";
}

function bcrStatusLabel(bcr: number): { label: string; tone: "success" | "warning" | "danger" } {
  if (bcr < 0.7) {
    return { label: "HEALTHY - Pool well-funded", tone: "success" };
  }
  if (bcr < 0.85) {
    return { label: "CAUTION - Monitor closely", tone: "warning" };
  }
  if (bcr < 1.0) {
    return { label: "CRITICAL - Consider premium increase", tone: "danger" };
  }
  return { label: "INSOLVENT - Immediate action required", tone: "danger" };
}

function inferScenario(poolId: string): string {
  const value = poolId.toLowerCase();
  if (value.includes("rain") || value.includes("flood") || value.includes("monsoon")) {
    return "14_day_monsoon";
  }
  if (value.includes("aqi")) {
    return "diwali_aqi";
  }
  if (value.includes("heat")) {
    return "summer_multiperil";
  }
  return "flash_strike_wave";
}

export function BCRDashboardPage() {
  const [expandedPool, setExpandedPool] = useState<string | null>(null);
  const [stressByPool, setStressByPool] = useState<Record<string, StressResult>>({});

  const query = useQuery({
    queryKey: ["bcr-dashboard"],
    queryFn: getBcr,
    refetchInterval: 20_000,
  });

  const stressMutation = useMutation({
    mutationFn: async ({ poolId, scenario }: { poolId: string; scenario: string }) => {
      const response = await runStressTest(scenario);
      return {
        poolId,
        result: response.data?.result as StressResult,
      };
    },
    onSuccess: ({ poolId, result }) => {
      setStressByPool((prev) => ({ ...prev, [poolId]: result }));
      setExpandedPool(poolId);
    },
  });

  const pools = (query.data?.data?.pools ?? []) as BcrPool[];

  return (
    <AdminLayout>
      <Card>
        <div className="admin-page-head">
          <h1 style={{ marginTop: 0, marginBottom: 0 }}>BCR Dashboard</h1>
          <LastUpdatedIndicator updatedAt={query.dataUpdatedAt} />
        </div>
        <p style={{ color: "var(--text-secondary)", marginTop: 4 }}>
          BCR = total claims paid / total premiums collected for each pool in the current month.
        </p>

        {query.isLoading ? <p style={{ color: "var(--text-secondary)" }}>Loading live pool metrics...</p> : null}
        {query.isError ? (
          <p role="alert" style={{ color: "var(--danger)" }}>
            Live BCR data unavailable.
          </p>
        ) : null}
        {!query.isLoading && !query.isError && pools.length === 0 ? (
          <div className="surface" style={{ padding: 12 }}>
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>No data yet.</p>
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
          {pools.map((pool) => {
            const label = bcrStatusLabel(pool.bcr);
            const scenario = inferScenario(pool.pool_id);
            const isPending = stressMutation.isPending && stressMutation.variables?.poolId === pool.pool_id;
            const stress = stressByPool[pool.pool_id];

            return (
              <div key={pool.pool_id} className="surface" style={{ padding: 12, position: "relative", display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                  <p className="mono" style={{ margin: 0 }}>
                    {pool.pool_id}
                  </p>
                  {pool.suspended ? <Badge tone="danger">SUSPENDED</Badge> : null}
                </div>
                <p style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 800, color: zoneColor(pool.bcr) }}>{pool.bcr.toFixed(2)}</p>
                <Badge tone={label.tone}>{label.label}</Badge>
                <div style={{ marginTop: 2, height: 10, background: "var(--bg-base)", border: "1px solid var(--bg-border)", borderRadius: 4 }}>
                  <div style={{ width: `${Math.min(pool.bcr, 1) * 100}%`, height: "100%", background: zoneColor(pool.bcr), borderRadius: 4 }} />
                </div>
                <div style={{ height: 40 }}>
                  <ResponsiveContainer>
                    <LineChart data={pool.trend_4w.map((v, i) => ({ i, v }))}>
                      <Tooltip />
                      <Line type="monotone" dataKey="v" stroke={zoneColor(pool.bcr)} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
                  <span>Premiums: {pool.total_premiums !== undefined ? formatINR(pool.total_premiums) : "No data"}</span>
                  <span>Claims: {pool.total_claims !== undefined ? formatINR(pool.total_claims) : "No data"}</span>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button
                    variant="secondary"
                    onClick={() => stressMutation.mutate({ poolId: pool.pool_id, scenario })}
                    disabled={isPending}
                  >
                    {isPending ? "Running..." : "Stress Test"}
                  </Button>
                  {stress ? (
                    <Button
                      variant="ghost"
                      onClick={() => setExpandedPool((prev) => (prev === pool.pool_id ? null : pool.pool_id))}
                    >
                      {expandedPool === pool.pool_id ? "Hide Result" : "Show Result"}
                    </Button>
                  ) : null}
                </div>

                {expandedPool === pool.pool_id && stress ? (
                  <div className="surface" style={{ padding: 10, border: "1px dashed var(--bg-border)" }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>Stress Test Output</p>
                    <p style={{ margin: "6px 0 0 0", color: "var(--text-secondary)" }}>
                      Workers exposed: {stress.workers_exposed.toLocaleString()}
                    </p>
                    <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)" }}>
                      Mean liability: {formatINR(stress.mean_total_liability)}
                    </p>
                    <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)" }}>
                      Pool adequacy: {stress.pool_adequacy.toFixed(2)}
                    </p>
                    <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)" }}>
                      Recommended buffer: {formatINR(stress.recommended_reserve_buffer)}
                    </p>
                    <p style={{ margin: "4px 0 0 0", color: "var(--warning)", fontWeight: 700 }}>
                      Action: {stress.action}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
    </AdminLayout>
  );
}
