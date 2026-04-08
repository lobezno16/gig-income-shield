import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Check, Loader2, MapPin, Smartphone } from "lucide-react";

import { getPremiumHistory, updatePolicyPlan } from "../../api/client";
import { WorkerShell } from "../../components/WorkerShell";
import { Badge } from "../../design-system/components/Badge";
import { Button } from "../../design-system/components/Button";
import { Card } from "../../design-system/components/Card";
import { useAuthGuard } from "../../hooks/useAuthGuard";
import { usePolicy } from "../../hooks/usePolicy";
import { usePremium } from "../../hooks/usePremium";
import { useWorkerStore } from "../../store/workerStore";
import type { Plan } from "../../types";
import { formatINR } from "../../utils/formatters";
import { H3_ZONES } from "../../utils/mockData";

interface PolicyResponseData {
  policy_number: string;
  coverage: {
    plan: Plan;
    status: "active" | "lapsed" | "suspended";
    weekly_premium_inr: number;
    max_payout_per_week_inr: number;
    coverage_days_per_week: number;
    activated_at: string | null;
  };
}

interface PremiumResponseData {
  formula_breakdown: {
    trigger_probability: number;
  };
}

interface PremiumHistoryPoint {
  week_start: string;
  final_premium: number;
  base_formula: number;
  ml_adjustment: number;
}

interface PremiumHistoryResponse {
  data?: {
    history: PremiumHistoryPoint[];
  };
}

interface HistoryChartPoint {
  week: string;
  premium: number;
}

const planMeta: Record<
  Plan,
  {
    label: string;
    minCost: number;
    maxCost: number;
    maxPayout: number;
    coverageDays: number;
    features: string[];
  }
> = {
  lite: {
    label: "Lite",
    minCost: 20,
    maxCost: 30,
    maxPayout: 400,
    coverageDays: 3,
    features: ["Basic disruption coverage", "3 days/week", "Up to INR 400"],
  },
  standard: {
    label: "Standard",
    minCost: 30,
    maxCost: 40,
    maxPayout: 700,
    coverageDays: 5,
    features: ["Extended coverage", "5 days/week", "Up to INR 700", "Priority claims"],
  },
  pro: {
    label: "Pro",
    minCost: 40,
    maxCost: 50,
    maxPayout: 1200,
    coverageDays: 6,
    features: ["Full coverage", "6 days/week", "Up to INR 1200", "Instant payout"],
  },
};

const planRank: Record<Plan, number> = { lite: 1, standard: 2, pro: 3 };

function formatWeekLabel(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function nextMondayLabel(): string {
  const now = new Date();
  const day = now.getDay();
  const delta = ((8 - day) % 7) || 7;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + delta);
  return nextMonday.toLocaleDateString("en-IN", { weekday: "long", month: "short", day: "numeric" });
}

function classifyRisk(probability: number): "LOW" | "MEDIUM" | "HIGH" {
  if (probability >= 0.2) return "HIGH";
  if (probability >= 0.1) return "MEDIUM";
  return "LOW";
}

function zoneDisplayFromHex(hex: string | undefined): string {
  if (!hex) return "your zone";
  const zone = H3_ZONES[hex as keyof typeof H3_ZONES];
  if (!zone) return "your zone";
  return `${zone.area_display}, ${zone.city.charAt(0).toUpperCase() + zone.city.slice(1)}`;
}

export function WorkerPremiumPage() {
  const { isAuthenticated, isLoading } = useAuthGuard();
  const { currentWorker } = useWorkerStore();
  const workerId = currentWorker?.id ?? "";
  const queryClient = useQueryClient();
  const policyQuery = usePolicy(workerId);
  const premiumQuery = usePremium(workerId);
  const historyQuery = useQuery({
    queryKey: ["premium-history", workerId],
    queryFn: () => getPremiumHistory(workerId),
    enabled: Boolean(workerId),
    staleTime: 60_000,
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  const policyData = policyQuery.data?.data as PolicyResponseData | undefined;
  const premiumData = premiumQuery.data?.data as PremiumResponseData | undefined;
  const historyData = historyQuery.data as PremiumHistoryResponse | undefined;
  const currentPlan = policyData?.coverage.plan ?? "standard";
  const currentPlanMeta = planMeta[currentPlan];

  const chartData: HistoryChartPoint[] = useMemo(() => {
    const history = historyData?.data?.history ?? [];
    const ordered = [...history].sort((a, b) => new Date(a.week_start).getTime() - new Date(b.week_start).getTime());
    const latest8 = ordered.slice(-8);
    return latest8.map((item) => ({
      week: formatWeekLabel(item.week_start),
      premium: Number(item.final_premium),
    }));
  }, [historyData?.data?.history]);

  const premiumRangeSummary = useMemo(() => {
    if (!chartData.length) return "Your premium history will appear after your first policy week.";
    const premiums = chartData.map((entry) => entry.premium);
    const min = Math.min(...premiums);
    const max = Math.max(...premiums);
    return `Your premium has ranged from ${formatINR(min)} to ${formatINR(max)} over the past 8 weeks.`;
  }, [chartData]);

  const planMutation = useMutation({
    mutationFn: (plan: Plan) => updatePolicyPlan(workerId, plan),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["policy", workerId] }),
        queryClient.invalidateQueries({ queryKey: ["premium", workerId] }),
        queryClient.invalidateQueries({ queryKey: ["premium-history", workerId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", workerId] }),
      ]);
      setSelectedPlan(null);
      setToastMessage("Plan updated!");
    },
    onError: () => {
      setToastMessage("Could not switch plan. Please try again.");
    },
  });

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const triggerProbability = premiumData?.formula_breakdown?.trigger_probability ?? 0.12;
  const riskLevel = classifyRisk(triggerProbability);
  const estimatedTriggers = Math.max(1, Math.round(triggerProbability * 30));
  const zoneLabel = zoneDisplayFromHex(currentWorker?.h3_hex);
  const currentTier = (currentWorker?.tier ?? "silver").toUpperCase();
  const activeDays = currentWorker?.active_days_30 ?? 0;

  if (isLoading) return null;
  if (!isAuthenticated || !currentWorker) return null;

  return (
    <WorkerShell activeTab="premium" pageTitle="Coverage Plan" maxWidth={960}>
      <section className="premium-page-stack">
        <Card>
          <h1 style={{ marginTop: 0, marginBottom: 4 }}>Your Coverage Plan</h1>
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>
            Switch plans based on your workload and weekly protection target.
          </p>
        </Card>

        <Card className="premium-current-card">
          {policyQuery.isLoading ? (
            <div className="premium-skeleton-group">
              <div className="skeleton premium-skeleton-line premium-skeleton-line--sm" />
              <div className="skeleton premium-skeleton-line premium-skeleton-line--lg" />
              <div className="skeleton premium-skeleton-line premium-skeleton-line--md" />
            </div>
          ) : (
            <>
              <h2 style={{ marginTop: 0, marginBottom: 8 }}>Your current plan</h2>
              <p style={{ margin: 0, fontWeight: 800, fontSize: "var(--text-xl)" }}>
                You&apos;re currently on {currentPlanMeta.label.toUpperCase()} - {formatINR(policyData?.coverage.weekly_premium_inr ?? currentPlanMeta.maxCost)}/week
              </p>
              <div className="premium-current-meta">
                <Badge tone="accent">{currentPlanMeta.label.toUpperCase()}</Badge>
                <Badge tone={policyData?.coverage.status === "active" ? "success" : "danger"}>
                  {(policyData?.coverage.status ?? "lapsed").toUpperCase()}
                </Badge>
              </div>
              <p style={{ margin: 0, color: "var(--text-secondary)" }}>
                Max payout: {formatINR(policyData?.coverage.max_payout_per_week_inr ?? currentPlanMeta.maxPayout)} / week | Coverage: {policyData?.coverage.coverage_days_per_week ?? currentPlanMeta.coverageDays} days/week
              </p>
              {currentPlan === "pro" ? (
                <p style={{ margin: 0, color: "var(--success)", fontWeight: 700 }}>You&apos;re on the best plan.</p>
              ) : null}
            </>
          )}
        </Card>

        <Card>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>Compare plans</h2>
          <div className="premium-plan-grid">
            {(Object.keys(planMeta) as Plan[]).map((plan) => {
              const meta = planMeta[plan];
              const isCurrent = plan === currentPlan;
              const isUpgrade = planRank[plan] > planRank[currentPlan];
              return (
                <article key={plan} className={`premium-plan-card ${isCurrent ? "is-current" : ""}`}>
                  <div className="premium-plan-header">
                    <p className="premium-plan-title">{meta.label.toUpperCase()}</p>
                    {isCurrent ? <Badge tone="success">Current Plan</Badge> : null}
                  </div>
                  <p className="premium-plan-price">
                    INR {meta.minCost}-INR {meta.maxCost}/week
                  </p>
                  <p className="premium-plan-sub">Days covered: {meta.coverageDays} days/week</p>
                  <p className="premium-plan-sub">Max payout: Up to {formatINR(meta.maxPayout)}/week</p>
                  <ul className="premium-plan-features">
                    {meta.features.map((feature) => (
                      <li key={feature}>
                        <Check size={14} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <Button variant="ghost" disabled>
                      Current Plan
                    </Button>
                  ) : (
                    <Button variant={isUpgrade ? "primary" : "ghost"} onClick={() => setSelectedPlan(plan)} disabled={planMutation.isPending}>
                      Switch to this plan
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>Why your premium is {formatINR(policyData?.coverage.weekly_premium_inr ?? currentPlanMeta.maxCost)}</h2>
          <div className="premium-reason-list">
            <article className="premium-reason-item">
              <MapPin size={18} color="var(--info)" />
              <p>
                <strong>Location:</strong> Your zone ({zoneLabel}) has <strong>{riskLevel}</strong> disruption history.
              </p>
            </article>
            <article className="premium-reason-item">
              <Smartphone size={18} color="var(--warning)" />
              <p>
                <strong>Platform:</strong> {currentWorker.platform.charAt(0).toUpperCase() + currentWorker.platform.slice(1)} partners in your zone have had {estimatedTriggers} trigger events in the last 30 days.
              </p>
            </article>
            <article className="premium-reason-item">
              <Activity size={18} color="var(--success)" />
              <p>
                <strong>Your activity:</strong> You&apos;ve worked {activeDays} of the last 30 days - <strong>{currentTier}</strong> tier.
              </p>
            </article>
          </div>
          <p className="premium-summary-line">
            Your premium adjusts weekly based on real weather and disruption data in your specific delivery zone.
          </p>
        </Card>

        <Card>
          <h2 style={{ marginTop: 0, marginBottom: 8 }}>This week&apos;s premium history</h2>
          {historyQuery.isLoading ? (
            <div className="premium-history-skeleton">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="skeleton premium-history-skeleton-bar" />
              ))}
            </div>
          ) : chartData.length ? (
            <div className="premium-history-chart">
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="week" tick={{ fill: "#9a9a9a", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#9a9a9a", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value: number) => formatINR(value)} contentStyle={{ background: "#111111", border: "1px solid #2a2a2a" }} />
                  <Bar dataKey="premium" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>Premium history is not available yet.</p>
          )}
          <p className="premium-summary-line">{premiumRangeSummary}</p>
        </Card>
      </section>

      {selectedPlan ? (
        <div className="premium-modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm plan switch">
          <div className="surface premium-modal-sheet">
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Switch to {planMeta[selectedPlan].label.toUpperCase()} Plan?</h3>
            <p className="premium-modal-line">
              New weekly premium: INR {planMeta[selectedPlan].minCost}-INR {planMeta[selectedPlan].maxCost}/week
            </p>
            <p className="premium-modal-line">Max payout increases to: {formatINR(planMeta[selectedPlan].maxPayout)}/week</p>
            <p className="premium-modal-line">Effective from: {nextMondayLabel()}</p>
            <div className="premium-modal-actions">
              <Button variant="ghost" onClick={() => setSelectedPlan(null)} disabled={planMutation.isPending}>
                Cancel
              </Button>
              <Button onClick={() => planMutation.mutate(selectedPlan)} disabled={planMutation.isPending}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {planMutation.isPending ? <Loader2 size={15} className="premium-spin-icon" /> : null}
                  {planMutation.isPending ? "Updating..." : "Confirm Switch"}
                </span>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="surface premium-toast" role="status">
          {toastMessage}
        </div>
      ) : null}
    </WorkerShell>
  );
}
