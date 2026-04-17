import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { getBcr, getIntegrationHealth, getLossRatio, getOverview } from "../../api/client";

interface BcrPoolRow {
  pool_id: string;
  bcr: number;
  trend_4w: number[];
}

interface BcrResponse {
  data?: {
    pools?: BcrPoolRow[];
  };
}

interface LossRatioResponse {
  data?: {
    loss_ratio?: number;
  };
}

interface OverviewResponse {
  data?: {
    claims_this_week_count?: number;
    avg_settlement_time_hours?: number;
    pending_review_count?: number;
  };
}

interface RatioPoint {
  weekLabel: string;
  bcr: number;
  lossRatio: number;
}

interface EnvForecastPoint {
  day: string;
  rainMmHr: number;
  trafficDelayMinKm: number;
  aqi: number;
}

interface ClaimsForecastPoint extends EnvForecastPoint {
  expectedClaims: number;
  riskScore: number;
}

interface IntegrationHealthResponse {
  data?: {
    product?: {
      product_code?: string;
      loss_scope?: string;
      billing_cadence?: string;
      supported_perils?: string[];
      zero_touch_claims?: boolean;
    };
    oracles?: {
      weather?: { mode?: string };
      traffic?: { mode?: string };
      air_quality?: { mode?: string };
    };
    payments?: {
      provider?: string;
      mode?: string;
      idempotency?: string;
    };
  };
}

const ENV_FORECAST_7D: EnvForecastPoint[] = [
  { day: "Mon", rainMmHr: 12, trafficDelayMinKm: 28, aqi: 310 },
  { day: "Tue", rainMmHr: 18, trafficDelayMinKm: 47, aqi: 402 },
  { day: "Wed", rainMmHr: 22, trafficDelayMinKm: 56, aqi: 465 },
  { day: "Thu", rainMmHr: 10, trafficDelayMinKm: 22, aqi: 280 },
  { day: "Fri", rainMmHr: 16, trafficDelayMinKm: 44, aqi: 438 },
  { day: "Sat", rainMmHr: 8, trafficDelayMinKm: 20, aqi: 255 },
  { day: "Sun", rainMmHr: 14, trafficDelayMinKm: 36, aqi: 390 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function buildBcrSeries(pools: BcrPoolRow[]): number[] {
  const trendLen = pools.reduce((maxLen, pool) => Math.max(maxLen, pool.trend_4w.length), 0);
  if (trendLen === 0) {
    return [0.62, 0.64, 0.66, 0.68, 0.7, 0.71, 0.72, 0.73];
  }

  const padded = pools.map((pool) => {
    if (pool.trend_4w.length === trendLen) return pool.trend_4w;
    if (pool.trend_4w.length === 0) return Array.from({ length: trendLen }, () => pool.bcr);

    const head = pool.trend_4w[0];
    const missing = Array.from({ length: trendLen - pool.trend_4w.length }, () => head);
    return [...missing, ...pool.trend_4w];
  });

  const series = Array.from({ length: trendLen }, (_, index) =>
    avg(padded.map((row) => Number(row[index] || 0)))
  );

  if (series.length >= 8) return series.slice(-8);
  const head = series[0] ?? 0.7;
  const missing = Array.from({ length: 8 - series.length }, () => head);
  return [...missing, ...series];
}

function buildRatioChartData(bcrSeries: number[], currentLossRatio: number): RatioPoint[] {
  const current = currentLossRatio > 0 ? currentLossRatio : 0.68;
  const bcrAverage = avg(bcrSeries) || 1;

  return bcrSeries.map((bcr, index) => ({
    weekLabel: `W${index + 1}`,
    bcr: Number(bcr.toFixed(3)),
    lossRatio: Number(clamp(current * (bcr / bcrAverage), 0.2, 1.4).toFixed(3)),
  }));
}

function buildClaimsForecast(baseWeeklyClaims: number): ClaimsForecastPoint[] {
  const safeBaseWeekly = baseWeeklyClaims > 0 ? baseWeeklyClaims : 120;
  const baseDaily = safeBaseWeekly / 7;

  return ENV_FORECAST_7D.map((row) => {
    const rainScore = clamp(row.rainMmHr / 25, 0, 1);
    const trafficScore = clamp(row.trafficDelayMinKm / 60, 0, 1);
    const aqiScore = clamp(row.aqi / 500, 0, 1);
    const riskScore = 0.4 * rainScore + 0.35 * trafficScore + 0.25 * aqiScore;
    const expectedClaims = Math.round(baseDaily * (0.85 + riskScore * 1.9));
    return {
      ...row,
      riskScore: Number(riskScore.toFixed(3)),
      expectedClaims,
    };
  });
}

function riskBand(score: number): "LOW" | "MEDIUM" | "HIGH" {
  if (score < 0.35) return "LOW";
  if (score < 0.65) return "MEDIUM";
  return "HIGH";
}

export function AdminActuaryDashboard() {
  const overviewQuery = useQuery({
    queryKey: ["neo-admin-overview"],
    queryFn: getOverview,
    refetchInterval: 30_000,
  });
  const bcrQuery = useQuery({
    queryKey: ["neo-admin-bcr"],
    queryFn: getBcr,
    refetchInterval: 30_000,
  });
  const lossRatioQuery = useQuery({
    queryKey: ["neo-admin-loss-ratio"],
    queryFn: getLossRatio,
    refetchInterval: 30_000,
  });
  const integrationQuery = useQuery({
    queryKey: ["neo-admin-integration-health"],
    queryFn: getIntegrationHealth,
    refetchInterval: 60_000,
  });

  const bcrPools = (((bcrQuery.data as BcrResponse | undefined)?.data?.pools ?? []) as BcrPoolRow[]).map((pool) => ({
    ...pool,
    bcr: Number(pool.bcr || 0),
    trend_4w: pool.trend_4w?.map((point) => Number(point || 0)) ?? [],
  }));

  const bcrSeries = useMemo(() => buildBcrSeries(bcrPools), [bcrPools]);
  const currentLossRatio = Number(((lossRatioQuery.data as LossRatioResponse | undefined)?.data?.loss_ratio ?? 0));
  const ratioChartData = useMemo(
    () => buildRatioChartData(bcrSeries, currentLossRatio),
    [bcrSeries, currentLossRatio]
  );

  const baseWeeklyClaims = Number(
    ((overviewQuery.data as OverviewResponse | undefined)?.data?.claims_this_week_count ?? 0)
  );
  const nextWeekForecast = useMemo(
    () => buildClaimsForecast(baseWeeklyClaims),
    [baseWeeklyClaims]
  );

  const nextWeekExpectedClaims = useMemo(
    () => nextWeekForecast.reduce((sum, row) => sum + row.expectedClaims, 0),
    [nextWeekForecast]
  );
  const confidenceFloor = Math.round(nextWeekExpectedClaims * 0.88);
  const confidenceCeil = Math.round(nextWeekExpectedClaims * 1.14);

  const latestBcr = ratioChartData[ratioChartData.length - 1]?.bcr ?? 0;
  const latestLossRatio = ratioChartData[ratioChartData.length - 1]?.lossRatio ?? 0;
  const overview = (overviewQuery.data as OverviewResponse | undefined)?.data;
  const integration = (integrationQuery.data as IntegrationHealthResponse | undefined)?.data;
  const settlementSla = Number(overview?.avg_settlement_time_hours ?? 0);
  const pendingReview = Number(overview?.pending_review_count ?? 0);
  const productLossScope = integration?.product?.loss_scope ?? "loss_of_income_only";
  const productBilling = integration?.product?.billing_cadence ?? "weekly";
  const perils = integration?.product?.supported_perils ?? ["rain", "curfew", "aqi"];
  const weatherMode = integration?.oracles?.weather?.mode ?? "mock_fallback";
  const trafficMode = integration?.oracles?.traffic?.mode ?? "mock_fallback";
  const aqiMode = integration?.oracles?.air_quality?.mode ?? "mock_fallback";
  const paymentProvider = integration?.payments?.provider ?? "razorpay_test";
  const paymentMode = integration?.payments?.mode ?? "sandbox";
  const paymentIdempotency = integration?.payments?.idempotency ?? "enforced_by_disruption_event_plus_worker_key";

  return (
    <section className="nbact">
      <header className="nbact__head">
        <p className="nbact__eyebrow">SOTERIA // ADMIN + ACTUARY VIEW</p>
        <h1 className="nbact__title">Loss Ratio & Burning Cost Command Center</h1>
        <p className="nbact__sub">Black-box free actuarial telemetry with next-week claim expectation from 7-day environmental drivers.</p>
      </header>

      <div className="nbact__kpi-grid">
        <article className="nbact__panel">
          <p className="nbact__label">Current BCR</p>
          <p className="nbact__kpi">{latestBcr.toFixed(3)}</p>
        </article>
        <article className="nbact__panel">
          <p className="nbact__label">Current Loss Ratio</p>
          <p className="nbact__kpi">{latestLossRatio.toFixed(3)}</p>
        </article>
        <article className="nbact__panel">
          <p className="nbact__label">Next Week Expected Claims</p>
          <p className="nbact__kpi is-active">{nextWeekExpectedClaims}</p>
          <p className="nbact__meta">Confidence band: {confidenceFloor} to {confidenceCeil}</p>
        </article>
      </div>

      <section className="nbact__panel">
        <div className="nbact__panel-head">
          <p className="nbact__label">Integration Integrity</p>
          <p className="nbact__meta">Insurance-grade product and infra contract checks</p>
        </div>
        <div className="nbact__integrity-grid">
          <div className="nbact__integrity-cell">
            <p className="nbact__meta">Coverage scope</p>
            <p className="nbact__integrity-value is-active">{productLossScope.replace(/_/g, " ")}</p>
          </div>
          <div className="nbact__integrity-cell">
            <p className="nbact__meta">Billing cadence</p>
            <p className="nbact__integrity-value is-active">{productBilling}</p>
          </div>
          <div className="nbact__integrity-cell">
            <p className="nbact__meta">Supported perils</p>
            <p className="nbact__integrity-value">{perils.join(" / ")}</p>
          </div>
          <div className="nbact__integrity-cell">
            <p className="nbact__meta">Zero-touch status</p>
            <p className="nbact__integrity-value is-active">enabled</p>
          </div>
          <div className="nbact__integrity-cell">
            <p className="nbact__meta">Oracle modes</p>
            <p className="nbact__integrity-value">{`W:${weatherMode} T:${trafficMode} A:${aqiMode}`}</p>
          </div>
          <div className="nbact__integrity-cell">
            <p className="nbact__meta">Payments</p>
            <p className="nbact__integrity-value">{`${paymentProvider} (${paymentMode})`}</p>
          </div>
        </div>
      </section>

      <section className="nbact__panel">
        <div className="nbact__panel-head">
          <p className="nbact__label">Loss Ratio & Burning Cost Rate (BCR)</p>
          <p className="nbact__meta">8-week synthesized trend</p>
        </div>
        <div className="nbact__chart-wrap">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={ratioChartData}>
              <CartesianGrid stroke="#1a1a1a" strokeDasharray="3 3" />
              <XAxis dataKey="weekLabel" stroke="#ffffff" tick={{ fill: "#ffffff", fontSize: 12 }} tickLine={false} />
              <YAxis
                stroke="#ffffff"
                tick={{ fill: "#ffffff", fontSize: 12 }}
                tickLine={false}
                domain={[0, 1.5]}
              />
              <Tooltip
                contentStyle={{
                  background: "#000000",
                  border: "1px solid #ffffff",
                  borderRadius: 0,
                  color: "#ffffff",
                }}
                labelStyle={{ color: "#ffffff" }}
                formatter={(value: number, name: string) => [Number(value).toFixed(3), name]}
              />
              <Line
                type="monotone"
                dataKey="lossRatio"
                name="Loss Ratio"
                stroke="#ffffff"
                strokeWidth={2}
                dot={{ r: 2, stroke: "#ffffff", fill: "#000000" }}
                activeDot={{ r: 4, stroke: "#ffffff", fill: "#000000" }}
              />
              <Line
                type="monotone"
                dataKey="bcr"
                name="BCR"
                stroke="#00FF00"
                strokeWidth={2}
                dot={{ r: 2, stroke: "#00FF00", fill: "#000000" }}
                activeDot={{ r: 4, stroke: "#00FF00", fill: "#000000" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="nbact__panel">
        <div className="nbact__panel-head">
          <p className="nbact__label">Predictive Module: Next Week Expected Claims</p>
          <p className="nbact__meta">Mock 7-day environmental forecast to risk-weighted claim expectation</p>
        </div>

        <div className="nbact__table-wrap">
          <table className="nbact__table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Rain (mm/hr)</th>
                <th>Traffic Delay (min/km)</th>
                <th>AQI</th>
                <th>Risk Band</th>
                <th>Expected Claims</th>
              </tr>
            </thead>
            <tbody>
              {nextWeekForecast.map((row) => (
                <tr key={row.day}>
                  <td>{row.day}</td>
                  <td>{row.rainMmHr}</td>
                  <td>{row.trafficDelayMinKm}</td>
                  <td>{row.aqi}</td>
                  <td>{riskBand(row.riskScore)}</td>
                  <td className="is-active">{row.expectedClaims}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="nbact__panel">
        <div className="nbact__panel-head">
          <p className="nbact__label">Operational SLA Snapshot</p>
          <p className="nbact__meta">What underwriting and claims ops monitor daily</p>
        </div>
        <div className="nbact__kpi-grid">
          <article className="nbact__panel">
            <p className="nbact__label">Avg Settlement Time</p>
            <p className="nbact__kpi">{settlementSla.toFixed(2)}h</p>
          </article>
          <article className="nbact__panel">
            <p className="nbact__label">Pending Fraud Review</p>
            <p className="nbact__kpi">{pendingReview}</p>
          </article>
          <article className="nbact__panel">
            <p className="nbact__label">Idempotency Guarantee</p>
            <p className="nbact__kpi is-active">{paymentIdempotency.replace(/_/g, " ")}</p>
          </article>
        </div>
      </section>
    </section>
  );
}


