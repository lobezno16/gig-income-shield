import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getFraudAlerts, getLossRatio, getOverview, overrideAdminClaim } from "../../api/client";
import { Badge } from "../../design-system/components/Badge";
import { Button } from "../../design-system/components/Button";
import { Card } from "../../design-system/components/Card";
import { ConfirmDialog } from "../../design-system/components/ConfirmDialog";
import { LastUpdatedIndicator } from "../../design-system/components/LastUpdatedIndicator";
import { formatINR } from "../../utils/formatters";
import { AdminLayout } from "./AdminLayout";

interface PoolUtilization {
  pool_id: string | null;
  bcr: number;
  status: string | null;
}

interface PreviousWeekMetrics {
  active_policies: number;
  claims_paid: number;
  claims_this_week_count: number;
  avg_fraud_score: number;
}

interface OverviewMetrics {
  active_policies: number;
  claims_this_week_count: number;
  claims_paid: number;
  avg_fraud_score: number;
  pending_review_count: number;
  pool_utilization: PoolUtilization;
  week_bcr: number;
  loss_ratio_30d: number;
  previous_week: PreviousWeekMetrics;
}

interface LossRatioData {
  loss_ratio: number;
}

type FraudAlert = {
  claim_id: string;
  claim_number: string;
  fraud_score: number;
  flags: string[];
  cluster_size: number;
  hexes: string[];
  trigger: string;
  temporal_window: string;
  status: string;
  created_at?: string;
};

interface PendingAction {
  claimId: string;
  claimNumber: string;
  releasePct: number;
}

function percentDelta(current: number, previous: number): number {
  if (previous === 0) {
    if (current === 0) {
      return 0;
    }
    return 100;
  }
  return ((current - previous) / previous) * 100;
}

function formatTrend(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}% vs last week`;
}

function sparklinePoints(previous: number, current: number): number[] {
  if (previous === 0 && current === 0) {
    return [0, 0, 0, 0];
  }
  return [previous * 0.92, previous, current * 0.96, current];
}

function Sparkline({ values, tone }: { values: number[]; tone: "success" | "warning" | "danger" }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - ((value - min) / span) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  const stroke = tone === "success" ? "var(--success)" : tone === "warning" ? "var(--warning)" : "var(--danger)";

  return (
    <svg viewBox="0 0 100 100" className="admin-kpi__sparkline" aria-hidden="true">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const startPoint = polarToCartesian(cx, cy, r, end);
  const endPoint = polarToCartesian(cx, cy, r, start);
  const largeArcFlag = end - start <= 180 ? "0" : "1";
  return `M ${startPoint.x} ${startPoint.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${endPoint.x} ${endPoint.y}`;
}

function Gauge({
  label,
  value,
  maxValue,
  unit = "",
  showBcrBands = false,
}: {
  label: string;
  value: number;
  maxValue: number;
  unit?: string;
  showBcrBands?: boolean;
}) {
  const clamped = Math.max(0, Math.min(value, maxValue));
  const toAngle = (input: number) => 180 - (input / maxValue) * 180;

  const baseSegments = showBcrBands
    ? [
        { start: 0, end: 0.7, color: "var(--success)" },
        { start: 0.7, end: 0.85, color: "var(--warning)" },
        { start: 0.85, end: maxValue, color: "var(--danger)" },
      ]
    : [
        { start: 0, end: maxValue * 0.6, color: "var(--success)" },
        { start: maxValue * 0.6, end: maxValue * 0.8, color: "var(--warning)" },
        { start: maxValue * 0.8, end: maxValue, color: "var(--danger)" },
      ];

  const activeColor = clamped < maxValue * 0.6 ? "var(--success)" : clamped < maxValue * 0.85 ? "var(--warning)" : "var(--danger)";

  return (
    <div className="admin-gauge-card surface">
      <p className="admin-gauge-card__label">{label}</p>
      <svg viewBox="0 0 200 120" className="admin-gauge-card__svg" aria-hidden="true">
        {baseSegments.map((segment) => (
          <path
            key={`${segment.start}-${segment.end}`}
            d={arcPath(100, 100, 72, toAngle(segment.end), toAngle(segment.start))}
            stroke={segment.color}
            strokeWidth="12"
            fill="none"
            strokeLinecap="round"
            opacity={0.4}
          />
        ))}
        <path
          d={arcPath(100, 100, 72, toAngle(clamped), toAngle(0))}
          stroke={activeColor}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      <p className="admin-gauge-card__value">
        {value.toFixed(2)}
        {unit}
      </p>
    </div>
  );
}

function metricTone(metric: "active" | "claims" | "paid" | "fraud", value: number, delta: number): "success" | "warning" | "danger" {
  if (metric === "active") {
    if (delta >= 0) return "success";
    if (delta >= -10) return "warning";
    return "danger";
  }
  if (metric === "fraud") {
    if (value < 0.35) return "success";
    if (value < 0.65) return "warning";
    return "danger";
  }
  if (delta <= 0) return "success";
  if (delta <= 20) return "warning";
  return "danger";
}

export function AdminOverviewPage() {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const overviewQuery = useQuery({
    queryKey: ["admin-overview"],
    queryFn: getOverview,
    refetchInterval: 30_000,
  });

  const lossRatioQuery = useQuery({
    queryKey: ["admin-loss-ratio"],
    queryFn: getLossRatio,
    refetchInterval: 30_000,
  });

  const fraudAlertsQuery = useQuery({
    queryKey: ["fraud-alerts"],
    queryFn: getFraudAlerts,
    refetchInterval: 20_000,
  });

  const overrideMutation = useMutation({
    mutationFn: (payload: PendingAction) =>
      overrideAdminClaim(
        payload.claimId,
        payload.releasePct,
        payload.releasePct <= 0 ? "Blocked by admin from overview panel" : "Approved by admin from overview panel"
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fraud-alerts"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      setPendingAction(null);
    },
  });

  const metrics = (overviewQuery.data?.data ?? null) as OverviewMetrics | null;
  const lossRatio = ((lossRatioQuery.data?.data ?? null) as LossRatioData | null)?.loss_ratio ?? metrics?.loss_ratio_30d ?? 0;
  const alerts = ((fraudAlertsQuery.data?.data?.alerts ?? []) as FraudAlert[]).slice(0, 3);
  const isLoading = overviewQuery.isLoading || lossRatioQuery.isLoading;
  const hasError = overviewQuery.isError || lossRatioQuery.isError;

  const lastUpdatedAt = Math.max(overviewQuery.dataUpdatedAt || 0, lossRatioQuery.dataUpdatedAt || 0, fraudAlertsQuery.dataUpdatedAt || 0);

  const kpis = useMemo(() => {
    if (!metrics) {
      return [];
    }
    const previous = metrics.previous_week;
    const activeDelta = percentDelta(metrics.active_policies, previous.active_policies);
    const claimsDelta = percentDelta(metrics.claims_this_week_count, previous.claims_this_week_count);
    const paidDelta = percentDelta(metrics.claims_paid, previous.claims_paid);
    const fraudDelta = percentDelta(metrics.avg_fraud_score, previous.avg_fraud_score);

    return [
      {
        label: "Active Policies",
        value: metrics.active_policies.toLocaleString(),
        delta: activeDelta,
        tone: metricTone("active", metrics.active_policies, activeDelta),
        spark: sparklinePoints(previous.active_policies, metrics.active_policies),
      },
      {
        label: "Claims This Week",
        value: metrics.claims_this_week_count.toLocaleString(),
        delta: claimsDelta,
        tone: metricTone("claims", metrics.claims_this_week_count, claimsDelta),
        spark: sparklinePoints(previous.claims_this_week_count, metrics.claims_this_week_count),
      },
      {
        label: "Total Paid Out",
        value: formatINR(metrics.claims_paid),
        delta: paidDelta,
        tone: metricTone("paid", metrics.claims_paid, paidDelta),
        spark: sparklinePoints(previous.claims_paid, metrics.claims_paid),
      },
      {
        label: "Avg Fraud Score",
        value: metrics.avg_fraud_score.toFixed(2),
        delta: fraudDelta,
        tone: metricTone("fraud", metrics.avg_fraud_score, fraudDelta),
        spark: sparklinePoints(previous.avg_fraud_score, metrics.avg_fraud_score),
      },
    ];
  }, [metrics]);

  return (
    <AdminLayout>
      <Card>
        <div className="admin-page-head">
          <h1 className="admin-page-head__title">Operations Overview</h1>
          <LastUpdatedIndicator updatedAt={lastUpdatedAt} />
        </div>
        {hasError ? (
          <p role="alert" className="admin-error-text">
            Live metrics are temporarily unavailable.
          </p>
        ) : null}
        {isLoading ? <p className="admin-muted-text">Loading live metrics...</p> : null}

        <div className="admin-kpi-grid">
          {kpis.map((kpi) => (
            <div key={kpi.label} className={`admin-kpi-card admin-kpi-card--${kpi.tone}`}>
              <p className="admin-kpi-card__value">{kpi.value}</p>
              <p className="admin-kpi-card__label">{kpi.label}</p>
              <div className="admin-kpi-card__trend">
                <Sparkline values={kpi.spark} tone={kpi.tone} />
                <span>{formatTrend(kpi.delta)}</span>
              </div>
            </div>
          ))}
          {!isLoading && kpis.length === 0 ? (
            <div className="surface admin-empty-state">
              <p>No data yet.</p>
            </div>
          ) : null}
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div className="admin-gauge-grid">
          <Gauge label="BCR" value={metrics?.week_bcr ?? 0} maxValue={1.2} showBcrBands />
          <Gauge label="Loss Ratio (30d)" value={lossRatio} maxValue={1.2} />
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <div className="admin-pending-head">
          <h2 className="admin-page-head__subtitle">Pending Review</h2>
          <Badge tone="warning">{metrics?.pending_review_count ?? 0} open</Badge>
        </div>
        {fraudAlertsQuery.isLoading ? <p className="admin-muted-text">Loading flagged claims...</p> : null}
        {fraudAlertsQuery.isError ? (
          <p role="alert" className="admin-error-text">
            Unable to load pending review claims.
          </p>
        ) : null}
        {!fraudAlertsQuery.isLoading && !fraudAlertsQuery.isError && alerts.length === 0 ? (
          <div className="surface admin-empty-state">
            <p>No flagged claims right now.</p>
          </div>
        ) : null}
        <div className="admin-pending-list">
          {alerts.map((alert) => (
            <div key={alert.claim_id} className="admin-pending-item">
              <div>
                <p className="mono admin-pending-item__claim">{alert.claim_number}</p>
                <p className="admin-pending-item__meta">
                  Trigger: {alert.trigger.toUpperCase()} | Flags: {alert.flags.join(", ") || "none"}
                </p>
              </div>
              <div className="admin-pending-item__actions">
                <Button
                  variant="secondary"
                  onClick={() =>
                    setPendingAction({
                      claimId: alert.claim_id,
                      claimNumber: alert.claim_number,
                      releasePct: 1.0,
                    })
                  }
                >
                  Approve
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    setPendingAction({
                      claimId: alert.claim_id,
                      claimNumber: alert.claim_number,
                      releasePct: 0.0,
                    })
                  }
                >
                  Block
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction?.releasePct === 0 ? "Block claim payout?" : "Approve claim payout?"}
        message={
          pendingAction?.releasePct === 0
            ? `This will block payout for ${pendingAction?.claimNumber}.`
            : `This will release full payout for ${pendingAction?.claimNumber}.`
        }
        confirmLabel={pendingAction?.releasePct === 0 ? "Block Claim" : "Approve Claim"}
        tone={pendingAction?.releasePct === 0 ? "danger" : "primary"}
        isLoading={overrideMutation.isPending}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (pendingAction) {
            overrideMutation.mutate(pendingAction);
          }
        }}
      />
    </AdminLayout>
  );
}
