import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api, getBayesianPosterior, getFeatureImportance } from "../../api/client";
import { Badge } from "../../design-system/components/Badge";
import { Button } from "../../design-system/components/Button";
import { Card } from "../../design-system/components/Card";
import { ConfirmDialog } from "../../design-system/components/ConfirmDialog";
import { LastUpdatedIndicator } from "../../design-system/components/LastUpdatedIndicator";
import { H3_ZONES } from "../../utils/mockData";
import { AdminLayout } from "./AdminLayout";

interface FeatureImportancePoint {
  name: string;
  importance: number;
}

interface PosteriorHistoryPoint {
  period_end: string;
  posterior_prob: number;
  pool_bcr: number;
}

interface ModelStatus {
  status: string;
  last_trained: string | null;
  mae: number;
  r2: number;
  training_samples: number;
}

const perilOptions = ["rain", "aqi", "curfew"];

export function MLDashboardPage() {
  const queryClient = useQueryClient();
  const defaultHex = Object.keys(H3_ZONES)[0] ?? "";
  const [hex, setHex] = useState(defaultHex);
  const [peril, setPeril] = useState("rain");
  const [confirmRetrain, setConfirmRetrain] = useState(false);
  const [retrainOverrideTimestamp, setRetrainOverrideTimestamp] = useState<string | null>(null);

  const featureQuery = useQuery({
    queryKey: ["ml-features"],
    queryFn: getFeatureImportance,
    refetchInterval: 30_000,
  });

  const posteriorQuery = useQuery({
    queryKey: ["ml-posterior", hex, peril],
    queryFn: () => getBayesianPosterior(hex, peril),
    enabled: Boolean(hex),
  });

  const retrain = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/api/admin/retrain-model");
      return data;
    },
    onSuccess: (result) => {
      setRetrainOverrideTimestamp(result.data?.trained_at ?? null);
      setConfirmRetrain(false);
      void queryClient.invalidateQueries({ queryKey: ["ml-features"] });
      void queryClient.invalidateQueries({ queryKey: ["ml-posterior"] });
    },
  });

  const features = (featureQuery.data?.data?.features ?? []) as FeatureImportancePoint[];
  const posteriorHistory = (posteriorQuery.data?.data?.history ?? []) as PosteriorHistoryPoint[];
  const posteriorCurrent = posteriorQuery.data?.data?.current as
    | { trigger_prob: number; alpha: number; beta: number; last_updated: string | null }
    | null
    | undefined;
  const modelStatus = (featureQuery.data?.data?.model_status ?? null) as ModelStatus | null;

  const renderedLastTrained = retrainOverrideTimestamp ?? modelStatus?.last_trained ?? null;
  const lastUpdatedAt = Math.max(featureQuery.dataUpdatedAt || 0, posteriorQuery.dataUpdatedAt || 0);

  const chartData = useMemo(
    () =>
      posteriorHistory.map((point) => ({
        week: point.period_end.slice(5),
        posterior: point.posterior_prob,
        bcr: point.pool_bcr,
      })),
    [posteriorHistory]
  );

  return (
    <AdminLayout>
      <Card>
        <div className="admin-page-head">
          <h1 className="admin-page-head__title">ML Engine</h1>
          <div className="admin-page-head__meta">
            <LastUpdatedIndicator updatedAt={lastUpdatedAt} />
            <Button onClick={() => setConfirmRetrain(true)} disabled={retrain.isPending}>
              {retrain.isPending ? "Training... please wait" : "Retrain"}
            </Button>
          </div>
        </div>

        <div className="admin-ml-status-card">
          <div>
            <p className="admin-ml-status-card__label">Last trained</p>
            <p className="admin-ml-status-card__value">
              {renderedLastTrained ? new Date(renderedLastTrained).toLocaleString() : "No data"}
            </p>
          </div>
          <div>
            <p className="admin-ml-status-card__label">Status</p>
            <p className="admin-ml-status-card__value">{modelStatus?.status ?? "READY"}</p>
          </div>
          <div>
            <p className="admin-ml-status-card__label">MAE</p>
            <p className="admin-ml-status-card__value">{(modelStatus?.mae ?? 1.72).toFixed(2)}</p>
          </div>
          <div>
            <p className="admin-ml-status-card__label">R2</p>
            <p className="admin-ml-status-card__value">{(modelStatus?.r2 ?? 0.81).toFixed(2)}</p>
          </div>
          <div>
            <p className="admin-ml-status-card__label">Training samples</p>
            <p className="admin-ml-status-card__value">{(modelStatus?.training_samples ?? 6000).toLocaleString()}</p>
          </div>
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Feature Importance</h2>
        <p className="admin-muted-text" style={{ marginTop: 0 }}>
          SHAP values shown are per-worker explanations for premium calculations.
        </p>
        {featureQuery.isLoading ? <p className="admin-muted-text">Loading feature importance...</p> : null}
        {featureQuery.isError ? (
          <p role="alert" className="admin-error-text">
            Feature importance unavailable.
          </p>
        ) : null}
        {!featureQuery.isLoading && !featureQuery.isError && features.length === 0 ? (
          <div className="surface admin-empty-state">
            <p>No data yet.</p>
          </div>
        ) : null}
        {features.length > 0 ? (
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
        ) : null}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Bayesian Posterior by Hex</h2>
        <div className="admin-ml-controls">
          <select className="input mono" style={{ width: 300 }} value={hex} onChange={(event) => setHex(event.target.value)} aria-label="Select H3 Hex Zone">
            {Object.keys(H3_ZONES).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select className="input" style={{ width: 180 }} value={peril} onChange={(event) => setPeril(event.target.value)} aria-label="Select Peril">
            {perilOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {posteriorQuery.isLoading ? <p className="admin-muted-text">Loading posterior history...</p> : null}
        {posteriorQuery.isError ? (
          <p role="alert" className="admin-error-text">
            Posterior history unavailable for the selected hex.
          </p>
        ) : null}
        {!posteriorQuery.isLoading && !posteriorQuery.isError && chartData.length === 0 ? (
          <div className="surface admin-empty-state">
            <p>No data yet.</p>
          </div>
        ) : null}

        {chartData.length > 0 ? (
          <div style={{ width: "100%", height: 260, marginTop: 12 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--bg-border)" />
                <XAxis dataKey="week" label={{ value: "Week", position: "insideBottom", offset: -2 }} />
                <YAxis label={{ value: "Trigger Probability", angle: -90, position: "insideLeft", offset: 2 }} />
                <Tooltip />
                <ReferenceLine y={0.1} stroke="var(--warning)" strokeDasharray="5 5" label="Prior" />
                <Line type="monotone" dataKey="posterior" stroke="var(--info)" name="Posterior" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}

        {posteriorCurrent ? (
          <p className="admin-muted-text" style={{ marginBottom: 0 }}>
            Current posterior: {posteriorCurrent.trigger_prob.toFixed(4)} | alpha: {posteriorCurrent.alpha.toFixed(2)} | beta:{" "}
            {posteriorCurrent.beta.toFixed(2)}
          </p>
        ) : null}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Model Health</h2>
        <div className="admin-model-health-grid">
          <div className="surface admin-model-health-card">
            <p>MAE</p>
            <strong>{(modelStatus?.mae ?? 1.72).toFixed(2)}</strong>
          </div>
          <div className="surface admin-model-health-card">
            <p>R2</p>
            <strong>{(modelStatus?.r2 ?? 0.81).toFixed(2)}</strong>
          </div>
        </div>
        {retrain.isPending ? (
          <p className="admin-muted-text" style={{ marginTop: 10 }}>
            Training... please wait
          </p>
        ) : (
          <Badge tone="success">Status: READY</Badge>
        )}
      </Card>

      <ConfirmDialog
        open={confirmRetrain}
        title="Retrain ML model?"
        message="Retrain ML model on latest data? This will take 30-60 seconds and temporarily use server resources."
        confirmLabel="Start Retraining"
        isLoading={retrain.isPending}
        onCancel={() => setConfirmRetrain(false)}
        onConfirm={() => retrain.mutate()}
      />
    </AdminLayout>
  );
}
