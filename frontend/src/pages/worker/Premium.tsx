import { Link, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card } from "../../design-system/components/Card";
import { useAuthGuard } from "../../hooks/useAuthGuard";
import { useWorkerStore } from "../../store/workerStore";
import { usePremium } from "../../hooks/usePremium";
import { formatINR } from "../../utils/formatters";

const fallbackBreakdown = {
  trigger_probability: 0.12,
  avg_daily_income: 950,
  days_covered: 5,
  base_cost: 57,
  city_factor: 0.95,
  peril_factor: 0.9,
  worker_tier_factor: 1.0,
  ml_adjustment_inr: 2,
  raw_premium: 50.74,
  final_premium: 35,
};

const fallbackShap = [
  { feature: "forecast_rain_next_7d", value: 3.1 },
  { feature: "historical_claim_freq_hex", value: 1.2 },
  { feature: "past_week_avg_aqi", value: -1.5 },
  { feature: "season", value: -0.8 },
];

export function WorkerPremiumPage() {
  const [searchParams] = useSearchParams();
  const demoMode = searchParams.get("demo") === "true";
  const { isAuthenticated, isLoading } = useAuthGuard();
  const { currentWorker } = useWorkerStore();
  const query = usePremium(currentWorker?.id ?? "");

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated || !currentWorker) {
    return null;
  }

  const breakdown = query.data?.data?.formula_breakdown ?? fallbackBreakdown;
  const shapRaw = query.data?.data?.shap_values;
  const shapData = shapRaw
    ? Object.entries(shapRaw).map(([feature, value]) => ({ feature, value: Number(value) }))
    : fallbackShap;

  return (
    <main className="layout" style={{ maxWidth: 900 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>Premium Breakdown</h1>
        <table className="table mono">
          <tbody>
            <tr>
              <td>Trigger Probability</td>
              <td>{breakdown.trigger_probability}</td>
            </tr>
            <tr>
              <td>× Avg Daily Income</td>
              <td>{formatINR(breakdown.avg_daily_income)}</td>
            </tr>
            <tr>
              <td>× Days Covered</td>
              <td>{breakdown.days_covered}</td>
            </tr>
            <tr>
              <td>= Base Cost</td>
              <td>{formatINR(breakdown.base_cost)}</td>
            </tr>
            <tr>
              <td>City Factor</td>
              <td>×{breakdown.city_factor}</td>
            </tr>
            <tr>
              <td>Peril Factor</td>
              <td>×{breakdown.peril_factor}</td>
            </tr>
            <tr>
              <td>Worker Tier</td>
              <td>×{breakdown.worker_tier_factor}</td>
            </tr>
            <tr>
              <td>ML Adjustment</td>
              <td>{breakdown.ml_adjustment_inr > 0 ? "+" : ""}{formatINR(Math.abs(breakdown.ml_adjustment_inr))}</td>
            </tr>
            <tr>
              <td>Raw Premium</td>
              <td>{formatINR(breakdown.raw_premium)}</td>
            </tr>
            <tr>
              <td>FINAL PREMIUM</td>
              <td>{formatINR(breakdown.final_premium)}/week</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>SHAP Explanation</h2>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={shapData} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid stroke="var(--bg-border)" />
              <XAxis type="number" stroke="var(--text-secondary)" />
              <YAxis dataKey="feature" type="category" stroke="var(--text-secondary)" width={180} className="mono" />
              <Tooltip />
              <Bar dataKey="value" fill="var(--accent)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Assumptions Disclosed (IRDAI)</summary>
          <ul style={{ marginBottom: 0 }}>
            <li>Bayesian posterior probability per H3 hex is updated weekly from trigger history.</li>
            <li>City/peril multipliers are calibrated for parametric payout adequacy and pool sustainability.</li>
            <li>Model explanations are generated from Random Forest contribution values for transparency.</li>
          </ul>
        </details>
      </Card>

      <div style={{ marginTop: 12 }}>
        <Link to={`/dashboard${demoMode ? "?demo=true" : ""}`} className="surface touch-target" style={{ display: "grid", placeItems: "center" }}>
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
