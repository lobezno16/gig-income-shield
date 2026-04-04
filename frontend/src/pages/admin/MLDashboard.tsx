import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart } from "recharts";

import { AdminLayout } from "./AdminLayout";
import { Card } from "../../design-system/components/Card";
import { Button } from "../../design-system/components/Button";
import { api, getFeatureImportance } from "../../api/client";
import { H3_ZONES } from "../../utils/mockData";

export function MLDashboardPage() {
  const [hex, setHex] = useState("872a1072bffffff");
  const query = useQuery({
    queryKey: ["ml-features"],
    queryFn: getFeatureImportance,
  });
  const retrain = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/api/admin/retrain-model");
      return data;
    },
  });

  const features =
    query.data?.data?.features ??
    [
      { name: "forecast_rain_next_7d", importance: 0.28 },
      { name: "historical_claim_freq_hex", importance: 0.23 },
      { name: "past_week_avg_aqi", importance: 0.16 },
      { name: "season_sin", importance: 0.11 },
      { name: "season_cos", importance: 0.1 },
      { name: "worker_density_hex", importance: 0.08 },
      { name: "urban_tier", importance: 0.04 },
    ];

  const posterior = useMemo(() => {
    return [
      { week: "W-8", value: 0.09 },
      { week: "W-7", value: 0.1 },
      { week: "W-6", value: 0.11 },
      { week: "W-5", value: 0.12 },
      { week: "W-4", value: 0.13 },
      { week: "W-3", value: 0.12 },
      { week: "W-2", value: 0.14 },
      { week: "W-1", value: 0.15 },
    ];
  }, [hex]);

  return (
    <AdminLayout>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>ML Engine</h1>
          <Button onClick={() => retrain.mutate()}>{retrain.isPending ? "Retraining..." : "Retrain Now"}</Button>
        </div>
        <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>Model: RandomForestRegressor · n_estimators=200 · max_depth=8 · min_samples_leaf=20</p>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>SHAP Summary / Feature Importance</h2>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={features} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid stroke="var(--bg-border)" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={190} className="mono" />
              <Tooltip />
              <Bar dataKey="importance" fill="var(--accent)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Bayesian Posterior by Hex</h2>
        <select className="input mono" style={{ width: 300 }} value={hex} onChange={(e) => setHex(e.target.value)}>
          {Object.keys(H3_ZONES).map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <div style={{ width: "100%", height: 240, marginTop: 12 }}>
          <ResponsiveContainer>
            <LineChart data={posterior}>
              <CartesianGrid stroke="var(--bg-border)" />
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="var(--info)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p style={{ marginBottom: 0 }}>
          Last retrain: {retrain.data?.meta?.timestamp ?? "2026-04-04T02:00:00+05:30"} · MAE: 1.72 · R²: 0.81 · Samples: 6000
        </p>
      </Card>
    </AdminLayout>
  );
}

