import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getHeatmap, getLiquidityForecast } from "../../api/client";
import { Badge } from "../../design-system/components/Badge";
import { Card } from "../../design-system/components/Card";
import { LastUpdatedIndicator } from "../../design-system/components/LastUpdatedIndicator";
import { formatHex, formatINR } from "../../utils/formatters";
import { AdminLayout } from "./AdminLayout";

interface LiquidityForecastPoint {
  week: number;
  projected_claims: number;
  projected_premiums: number;
  projected_bcr: number;
}

interface HeatmapHex {
  h3_hex: string;
  city: string;
  peril: string;
  trigger_prob: number;
}

interface EnvMetrics {
  aqi: number;
  rainMmPerHr: number;
  trafficDelayMinPerKm: number;
}

interface EnvDayRow {
  day: string;
  delhi: EnvMetrics;
  mumbai: EnvMetrics;
  bangalore: EnvMetrics;
}

interface RiskHexRow extends HeatmapHex {
  expected_claims: number;
  action: string;
  tone: "success" | "warning" | "danger";
}

const ENV_FORECAST: EnvDayRow[] = [
  { day: "Mon", delhi: { aqi: 338, rainMmPerHr: 24, trafficDelayMinPerKm: 44 }, mumbai: { aqi: 126, rainMmPerHr: 72, trafficDelayMinPerKm: 52 }, bangalore: { aqi: 94, rainMmPerHr: 38, trafficDelayMinPerKm: 48 } },
  { day: "Tue", delhi: { aqi: 351, rainMmPerHr: 28, trafficDelayMinPerKm: 50 }, mumbai: { aqi: 132, rainMmPerHr: 78, trafficDelayMinPerKm: 56 }, bangalore: { aqi: 98, rainMmPerHr: 42, trafficDelayMinPerKm: 53 } },
  { day: "Wed", delhi: { aqi: 362, rainMmPerHr: 22, trafficDelayMinPerKm: 46 }, mumbai: { aqi: 118, rainMmPerHr: 74, trafficDelayMinPerKm: 58 }, bangalore: { aqi: 102, rainMmPerHr: 45, trafficDelayMinPerKm: 55 } },
  { day: "Thu", delhi: { aqi: 345, rainMmPerHr: 18, trafficDelayMinPerKm: 40 }, mumbai: { aqi: 124, rainMmPerHr: 69, trafficDelayMinPerKm: 49 }, bangalore: { aqi: 96, rainMmPerHr: 40, trafficDelayMinPerKm: 47 } },
  { day: "Fri", delhi: { aqi: 332, rainMmPerHr: 20, trafficDelayMinPerKm: 42 }, mumbai: { aqi: 116, rainMmPerHr: 64, trafficDelayMinPerKm: 45 }, bangalore: { aqi: 92, rainMmPerHr: 35, trafficDelayMinPerKm: 43 } },
  { day: "Sat", delhi: { aqi: 320, rainMmPerHr: 16, trafficDelayMinPerKm: 38 }, mumbai: { aqi: 110, rainMmPerHr: 58, trafficDelayMinPerKm: 41 }, bangalore: { aqi: 90, rainMmPerHr: 32, trafficDelayMinPerKm: 39 } },
  { day: "Sun", delhi: { aqi: 308, rainMmPerHr: 14, trafficDelayMinPerKm: 36 }, mumbai: { aqi: 104, rainMmPerHr: 55, trafficDelayMinPerKm: 40 }, bangalore: { aqi: 88, rainMmPerHr: 30, trafficDelayMinPerKm: 37 } },
];

const SUPPORTED_PERILS = new Set(["aqi", "rain", "curfew"]);

function formatLakhs(amount: number): string {
  return `INR ${(amount / 100_000).toFixed(1)}L`;
}

function bcrTone(bcr: number): "success" | "warning" | "danger" {
  if (bcr < 0.7) return "success";
  if (bcr <= 0.85) return "warning";
  return "danger";
}

function bcrStatus(bcr: number): "HEALTHY" | "WARNING" {
  return bcr < 0.7 ? "HEALTHY" : "WARNING";
}

function probabilityTone(probability: number): "success" | "warning" | "danger" {
  if (probability < 0.1) return "success";
  if (probability < 0.2) return "warning";
  return "danger";
}

function probabilityAction(probability: number): string {
  if (probability < 0.1) return "Monitor";
  if (probability < 0.2) return "Increase reserve";
  return "Escalate + pre-fund";
}

function cityRiskScore(metrics: EnvMetrics): number {
  const score = (metrics.aqi / 500) * 0.4 + (metrics.rainMmPerHr / 60) * 0.3 + (metrics.trafficDelayMinPerKm / 60) * 0.3;
  return Math.round(score * 100);
}

function riskDotColor(score: number): string {
  if (score < 35) return "var(--success)";
  if (score < 60) return "var(--warning)";
  return "var(--danger)";
}

function EnvCell({ metrics }: { metrics: EnvMetrics }) {
  const score = cityRiskScore(metrics);
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span
          aria-hidden="true"
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: riskDotColor(score),
            border: "1px solid var(--bg-border)",
          }}
        />
        <strong>{score}</strong>
      </div>
      <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
        AQI {metrics.aqi} | Rain {metrics.rainMmPerHr} mm/hr | Traffic {metrics.trafficDelayMinPerKm} min/km
      </span>
    </div>
  );
}

export function ForecastDashboardPage() {
  const forecastQuery = useQuery({
    queryKey: ["admin-forecast-liquidity"],
    queryFn: getLiquidityForecast,
    refetchInterval: 30_000,
  });

  const heatmapQuery = useQuery({
    queryKey: ["admin-forecast-heatmap"],
    queryFn: getHeatmap,
    refetchInterval: 30_000,
  });

  const forecast = useMemo(
    () => ((forecastQuery.data?.data?.forecast ?? []) as LiquidityForecastPoint[]).slice(0, 8),
    [forecastQuery.data?.data?.forecast]
  );

  const week1 = forecast.find((item) => item.week === 1) ?? forecast[0] ?? null;
  const expectedClaims = Number(week1?.projected_claims ?? 0);
  const reserveNeeded = expectedClaims * 1.3;
  const week1Bcr = Number(week1?.projected_bcr ?? 0);
  const statusTone = bcrTone(week1Bcr);
  const statusLabel = bcrStatus(week1Bcr);

  const topRiskHexes = useMemo(() => {
    const hexes = (heatmapQuery.data?.data?.hexes ?? []) as HeatmapHex[];
    const sorted = [...hexes]
      .filter((hex) => SUPPORTED_PERILS.has(String(hex.peril).toLowerCase()))
      .filter((hex) => Number.isFinite(hex.trigger_prob))
      .sort((left, right) => Number(right.trigger_prob) - Number(left.trigger_prob))
      .slice(0, 5);

    const totalTopRiskProb = sorted.reduce((sum, hex) => sum + Math.max(0, Number(hex.trigger_prob)), 0);

    return sorted.map((hex) => ({
      ...hex,
      expected_claims:
        totalTopRiskProb > 0 ? expectedClaims * (Math.max(0, Number(hex.trigger_prob)) / totalTopRiskProb) : 0,
      action: probabilityAction(Number(hex.trigger_prob)),
      tone: probabilityTone(Number(hex.trigger_prob)),
    })) as RiskHexRow[];
  }, [expectedClaims, heatmapQuery.data?.data?.hexes]);

  const lastUpdatedAt = Math.max(forecastQuery.dataUpdatedAt || 0, heatmapQuery.dataUpdatedAt || 0);
  const isLoading = forecastQuery.isLoading || heatmapQuery.isLoading;

  return (
    <AdminLayout>
      <Card>
        <div className="admin-page-head">
          <h1 className="admin-page-head__title">PYTHIA - Predictive Analytics</h1>
          <LastUpdatedIndicator updatedAt={lastUpdatedAt} />
        </div>

        <div className="admin-page-head" style={{ marginTop: 12 }}>
          <h2 className="admin-page-head__subtitle">Next Week Forecast</h2>
          {week1 ? <Badge tone={statusTone}>Week 1 BCR {week1Bcr.toFixed(2)}</Badge> : null}
        </div>

        {forecastQuery.isLoading ? <p className="admin-muted-text">Loading liquidity forecast...</p> : null}
        {forecastQuery.isError ? (
          <p role="alert" className="admin-error-text">
            Unable to load liquidity forecast.
          </p>
        ) : null}

        {!forecastQuery.isLoading && !forecastQuery.isError && forecast.length > 0 ? (
          <div style={{ marginTop: 12, height: 300 }}>
            <ResponsiveContainer>
              <ComposedChart data={forecast}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="week" tick={{ fill: "#9a9a9a", fontSize: 12 }} tickFormatter={(value) => `W${value}`} />
                <YAxis
                  yAxisId="claims"
                  tick={{ fill: "#9a9a9a", fontSize: 12 }}
                  tickFormatter={(value) => formatLakhs(Number(value))}
                  width={80}
                />
                <YAxis
                  yAxisId="bcr"
                  orientation="right"
                  domain={[0, 1.4]}
                  tick={{ fill: "#9a9a9a", fontSize: 12 }}
                  tickFormatter={(value) => Number(value).toFixed(2)}
                  width={48}
                />
                <Tooltip
                  contentStyle={{ background: "#111111", border: "1px solid #2a2a2a" }}
                  formatter={(value: number, name: string) => {
                    if (name === "Projected BCR") return [Number(value).toFixed(2), name];
                    return [formatINR(Number(value)), name];
                  }}
                  labelFormatter={(label) => `Week ${label}`}
                />
                <Legend />
                <Bar yAxisId="claims" dataKey="projected_claims" fill="rgba(0,217,126,0.75)" name="Projected Claims" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="claims" dataKey="projected_premiums" fill="rgba(59,158,255,0.75)" name="Projected Premiums" radius={[4, 4, 0, 0]} />
                <Line yAxisId="bcr" type="monotone" dataKey="projected_bcr" stroke="#f5a623" strokeWidth={2} dot={{ r: 3 }} name="Projected BCR" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : null}

        <div style={{ marginTop: 12, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
          <div className={`admin-kpi-card admin-kpi-card--${statusTone}`}>
            <p className="admin-kpi-card__value">{formatINR(expectedClaims)}</p>
            <p className="admin-kpi-card__label">Expected claims next week</p>
          </div>
          <div className={`admin-kpi-card admin-kpi-card--${statusTone}`}>
            <p className="admin-kpi-card__value">{formatINR(reserveNeeded)}</p>
            <p className="admin-kpi-card__label">Reserve needed</p>
          </div>
          <div className={`admin-kpi-card admin-kpi-card--${statusTone}`}>
            <p className="admin-kpi-card__value">{statusLabel}</p>
            <p className="admin-kpi-card__label">Pool status</p>
            <div className="admin-kpi-card__trend">
              <Badge tone={statusTone}>{statusLabel}</Badge>
            </div>
          </div>
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div className="admin-page-head">
          <h2 className="admin-page-head__subtitle">Disruption Probability Heatmap</h2>
          <Badge tone="warning">Top 5 next week</Badge>
        </div>

        {heatmapQuery.isLoading ? <p className="admin-muted-text">Loading risk hexes...</p> : null}
        {heatmapQuery.isError ? (
          <p role="alert" className="admin-error-text">
            Unable to load disruption probabilities.
          </p>
        ) : null}

        {!heatmapQuery.isLoading && !heatmapQuery.isError && topRiskHexes.length === 0 ? (
          <div className="surface admin-empty-state">
            <p>No data yet.</p>
          </div>
        ) : null}

        {!heatmapQuery.isLoading && !heatmapQuery.isError && topRiskHexes.length > 0 ? (
          <table className="table mono" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Zone</th>
                <th>City</th>
                <th>Primary Peril</th>
                <th>Trigger Probability</th>
                <th>Expected Claims</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {topRiskHexes.map((hex) => (
                <tr key={`${hex.h3_hex}-${hex.peril}`}>
                  <td>{formatHex(hex.h3_hex)}</td>
                  <td>{hex.city}</td>
                  <td>{hex.peril.toUpperCase()}</td>
                  <td>
                    <Badge tone={hex.tone}>{(Number(hex.trigger_prob) * 100).toFixed(1)}%</Badge>
                  </td>
                  <td>{formatINR(hex.expected_claims)}</td>
                  <td>
                    <Badge tone={hex.tone}>{hex.action}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div className="admin-page-head">
          <h2 className="admin-page-head__subtitle">Environmental Risk Forecast</h2>
          <Badge tone={isLoading ? "info" : "accent"}>{isLoading ? "Syncing live context" : "Forecast matrix (Mon-Sun)"}</Badge>
        </div>

        <table className="table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ width: 90 }}>Day</th>
              <th>Delhi</th>
              <th>Mumbai</th>
              <th>Bangalore</th>
            </tr>
          </thead>
          <tbody>
            {ENV_FORECAST.map((row) => (
              <tr key={row.day}>
                <td className="mono">{row.day}</td>
                <td>
                  <EnvCell metrics={row.delhi} />
                </td>
                <td>
                  <EnvCell metrics={row.mumbai} />
                </td>
                <td>
                  <EnvCell metrics={row.bangalore} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </AdminLayout>
  );
}
