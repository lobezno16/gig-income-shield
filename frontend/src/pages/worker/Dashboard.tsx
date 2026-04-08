import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, RefreshCcw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";

import { getHeatmap } from "../../api/client";
import { WorkerShell } from "../../components/WorkerShell";
import { Badge } from "../../design-system/components/Badge";
import { Button } from "../../design-system/components/Button";
import { Card } from "../../design-system/components/Card";
import { useAuthGuard } from "../../hooks/useAuthGuard";
import { useClaims } from "../../hooks/useClaims";
import { usePolicy } from "../../hooks/usePolicy";
import { useSSE } from "../../hooks/useSSE";
import { useWorkerStore } from "../../store/workerStore";
import { formatDateTime, formatINR } from "../../utils/formatters";

type HeroStatus = "covered" | "alert" | "inactive";

interface PolicyResponse {
  data?: {
    policy_number: string;
    coverage: {
      status: "active" | "lapsed" | "suspended";
      weekly_premium_inr: number;
      max_payout_per_week_inr: number;
      activated_at: string | null;
      expires_at: string | null;
      pool: string;
      plan: "lite" | "standard" | "pro";
    };
  };
}

interface ClaimItem {
  id: string;
  claim_number: string;
  status: string;
  payout_amount: number;
  created_at: string;
  settled_at: string | null;
}

interface ClaimsResponse {
  data?: {
    claims: ClaimItem[];
  };
}

interface HeatmapHex {
  h3_hex: string;
  peril: string;
  city: string;
  pool_id: string;
  trigger_prob: number;
  trigger_prob_p10: number;
  trigger_prob_p90: number;
}

interface HeatmapResponse {
  data?: {
    hexes: HeatmapHex[];
  };
}

interface SseEventItem {
  type: string;
  data: {
    trigger_id?: string;
    id?: string;
    peril?: string;
    payout_pct?: number;
    h3_hex?: string;
    label?: string;
    city?: string;
  };
  timestamp: string;
}

interface ForecastPoint {
  day: string;
  probability: number;
  lowRisk: number;
  midRisk: number;
  highRisk: number;
}

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const demoClaims: ClaimItem[] = [
  {
    id: "demo-1",
    claim_number: "CLM-2026-00041823",
    status: "paid",
    payout_amount: 420,
    created_at: "2026-04-01T13:30:00+05:30",
    settled_at: "2026-04-01T14:05:00+05:30",
  },
  {
    id: "demo-2",
    claim_number: "CLM-2026-00041829",
    status: "processing",
    payout_amount: 280,
    created_at: "2026-04-03T11:10:00+05:30",
    settled_at: null,
  },
];

const demoForecast: ForecastPoint[] = [
  { day: "Mon", probability: 9, lowRisk: 9, midRisk: 0, highRisk: 0 },
  { day: "Tue", probability: 12, lowRisk: 0, midRisk: 12, highRisk: 0 },
  { day: "Wed", probability: 18, lowRisk: 0, midRisk: 18, highRisk: 0 },
  { day: "Thu", probability: 24, lowRisk: 0, midRisk: 0, highRisk: 24 },
  { day: "Fri", probability: 20, lowRisk: 0, midRisk: 20, highRisk: 0 },
  { day: "Sat", probability: 13, lowRisk: 0, midRisk: 13, highRisk: 0 },
  { day: "Sun", probability: 8, lowRisk: 8, midRisk: 0, highRisk: 0 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toMonthYear(value: string | null | undefined): string {
  if (!value) return "Not started";
  return new Date(value).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const now = new Date();
  const expiry = new Date(value);
  const ms = expiry.getTime() - now.getTime();
  const rawDays = ms / (1000 * 60 * 60 * 24);
  return rawDays >= 0 ? Math.ceil(rawDays) : Math.floor(rawDays);
}

function periodGreeting(name: string): string {
  const hour = new Date().getHours();
  const period = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `Good ${period}, ${name} 👋`;
}

function tierTone(tier: string | undefined): "warning" | "muted" | "info" | "danger" {
  if (tier === "gold") return "warning";
  if (tier === "silver") return "muted";
  if (tier === "bronze") return "info";
  return "danger";
}

function formatZoneName(poolId: string | null | undefined, city: string | undefined): string {
  if (poolId) {
    return poolId
      .replace(/_/g, " ")
      .replace(/\b\w/g, (part) => part.toUpperCase())
      .replace(" Pool", " Zone");
  }
  if (city) return `${city.charAt(0).toUpperCase() + city.slice(1)} Zone`;
  return "Coverage Zone";
}

function isNetworkError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    return !error.response || error.code === "ERR_NETWORK";
  }
  return false;
}

function buildForecast(zone: HeatmapHex | null): ForecastPoint[] {
  if (!zone) return [];
  const base = Number(zone.trigger_prob || 0);
  const p10 = Number(zone.trigger_prob_p10 || base);
  const p90 = Number(zone.trigger_prob_p90 || base);
  const factors = [0.86, 0.92, 1.0, 1.18, 1.1, 0.95, 0.88];

  return dayLabels.map((day, idx) => {
    const raw = base * factors[idx];
    const pct = Math.round(clamp(raw, Math.min(p10, p90), Math.max(p10, p90)) * 100);
    return {
      day,
      probability: pct,
      lowRisk: pct < 10 ? pct : 0,
      midRisk: pct >= 10 && pct <= 20 ? pct : 0,
      highRisk: pct > 20 ? pct : 0,
    };
  });
}

function ShieldHeroIcon({ status }: { status: HeroStatus }) {
  const tone = status === "covered" ? "var(--success)" : status === "alert" ? "var(--warning)" : "var(--accent)";
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.7l7 2.9v5.1c0 4.8-3 9-7 10.6-4-1.6-7-5.8-7-10.6V5.6l7-2.9z"
        fill="none"
        stroke={tone}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8.6 12.2l2.1 2.1 4.7-4.7" stroke={tone} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatTrend({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") {
    return (
      <span className="dashboard-stat-trend dashboard-stat-trend--up">
        <ArrowUpRight size={14} /> Up
      </span>
    );
  }
  if (direction === "down") {
    return (
      <span className="dashboard-stat-trend dashboard-stat-trend--down">
        <ArrowDownRight size={14} /> Down
      </span>
    );
  }
  return (
    <span className="dashboard-stat-trend">
      <ArrowRight size={14} /> Stable
    </span>
  );
}

export function WorkerDashboardPage() {
  const [searchParams] = useSearchParams();
  const demoMode = searchParams.get("demo") === "true";
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuthGuard();
  const { currentWorker } = useWorkerStore();
  const workerId = currentWorker?.id ?? "";
  const workerName = currentWorker?.name ?? "Worker";

  const policyQuery = usePolicy(demoMode ? "" : workerId);
  const claimsQuery = useClaims(demoMode ? "" : workerId);
  const heatmapQuery = useQuery({
    queryKey: ["zones-heatmap"],
    queryFn: getHeatmap,
    enabled: !demoMode && Boolean(workerId),
    staleTime: 60_000,
  });
  const claimsFeed = useSSE(demoMode ? "" : "/api/sse/claims");

  const policyData = policyQuery.data as PolicyResponse | undefined;
  const claimsData = claimsQuery.data as ClaimsResponse | undefined;
  const heatmapData = heatmapQuery.data as HeatmapResponse | undefined;

  const claims: ClaimItem[] = useMemo(() => {
    if (demoMode) return demoClaims;
    return claimsData?.data?.claims ?? [];
  }, [claimsData?.data?.claims, demoMode]);

  const totalClaimed = useMemo(
    () => claims.reduce((sum, item) => sum + Number(item.payout_amount || 0), 0),
    [claims]
  );

  const policyStatus = policyData?.data?.coverage.status ?? currentWorker?.policy_status ?? "lapsed";
  const policyNumber = policyData?.data?.policy_number ?? currentWorker?.policy_number ?? "Pending issuance";
  const weeklyPremium = policyData?.data?.coverage.weekly_premium_inr ?? currentWorker?.weekly_premium ?? 0;
  const maxPayout = policyData?.data?.coverage.max_payout_per_week_inr ?? currentWorker?.max_payout_week ?? 0;
  const activatedAt = policyData?.data?.coverage.activated_at ?? null;
  const expiresAt = policyData?.data?.coverage.expires_at ?? null;
  const expiresInDays = daysUntil(expiresAt);
  const expiryDisplayText =
    expiresInDays === null
      ? "Expiry pending"
      : expiresInDays <= 0
        ? "EXPIRED"
        : `Expires in ${expiresInDays} day${expiresInDays === 1 ? "" : "s"}`;
  const expiryToneClass =
    expiresInDays === null
      ? "dashboard-expiry--neutral"
      : expiresInDays <= 0
        ? "dashboard-expiry--danger"
        : expiresInDays <= 3
          ? "dashboard-expiry--warning"
          : "dashboard-expiry--success";
  const expiryPulseClass = expiresInDays !== null && expiresInDays > 0 && expiresInDays <= 3 ? "dashboard-expiry--pulse" : "";

  const networkDown =
    !demoMode &&
    (isNetworkError(policyQuery.error) ||
      isNetworkError(claimsQuery.error) ||
      isNetworkError(heatmapQuery.error));

  const retryAll = () => {
    void policyQuery.refetch();
    void claimsQuery.refetch();
    void heatmapQuery.refetch();
  };

  const zoneHeatmap = useMemo(() => {
    const hexes = heatmapData?.data?.hexes ?? [];
    if (!currentWorker?.h3_hex) return null;
    return hexes.find((hex) => hex.h3_hex === currentWorker.h3_hex) ?? null;
  }, [currentWorker?.h3_hex, heatmapData?.data?.hexes]);

  const forecastData = useMemo(() => {
    if (demoMode) return demoForecast;
    return buildForecast(zoneHeatmap);
  }, [demoMode, zoneHeatmap]);

  const highestRisk = useMemo(() => {
    if (!forecastData.length) return "Unavailable";
    return forecastData.reduce((acc, item) => (item.probability > acc.probability ? item : acc)).day;
  }, [forecastData]);

  const liveTrigger = useMemo(() => {
    if (demoMode) {
      return {
        id: "demo-trigger",
        peril: "rain",
        city: currentWorker?.city ?? "delhi",
        payoutPct: 0.4,
        zoneLabel: formatZoneName("demo_rain_pool", currentWorker?.city),
      };
    }
    const events = claimsFeed.events as unknown as SseEventItem[];
    const match = events.find(
      (event) =>
        event.type === "trigger_fired" &&
        event.data &&
        (!event.data.h3_hex || event.data.h3_hex === currentWorker?.h3_hex)
    );
    if (!match) return null;
    return {
      id: match.data.trigger_id ?? match.data.id ?? match.timestamp,
      peril: match.data.peril ?? "disruption",
      city: match.data.city ?? currentWorker?.city ?? "your",
      payoutPct: Number(match.data.payout_pct ?? 0.3),
      zoneLabel: formatZoneName(zoneHeatmap?.pool_id, currentWorker?.city),
    };
  }, [claimsFeed.events, currentWorker?.city, currentWorker?.h3_hex, demoMode, zoneHeatmap?.pool_id]);

  const [dismissedTriggerId, setDismissedTriggerId] = useState<string | null>(null);
  useEffect(() => {
    if (liveTrigger && liveTrigger.id !== dismissedTriggerId) {
      setDismissedTriggerId(null);
    }
  }, [dismissedTriggerId, liveTrigger]);

  const shouldShowTrigger = Boolean(liveTrigger && dismissedTriggerId !== liveTrigger.id);

  const heroStatus: HeroStatus = useMemo(() => {
    if (expiresInDays !== null && expiresInDays <= 0) return "inactive";
    if (policyStatus !== "active") return "inactive";
    if (shouldShowTrigger) return "alert";
    return "covered";
  }, [expiresInDays, policyStatus, shouldShowTrigger]);

  const heroGradient = {
    covered: "linear-gradient(135deg, rgba(0,217,126,0.08), transparent)",
    alert: "linear-gradient(135deg, rgba(245,166,35,0.11), transparent)",
    inactive: "linear-gradient(135deg, rgba(255,255,255,0.02), transparent)",
  }[heroStatus];

  const showClaimsLoading = !demoMode && claimsQuery.isLoading;
  const showPolicyLoading = !demoMode && policyQuery.isLoading;
  const showForecastLoading = !demoMode && heatmapQuery.isLoading;

  if (isLoading) {
    return null;
  }
  if (!isAuthenticated || !currentWorker) {
    return null;
  }

  return (
    <WorkerShell activeTab="home" pageTitle="Dashboard" maxWidth={920}>
      <section className="dashboard-stack">
        {networkDown ? (
          <div className="dashboard-connection-banner" role="alert">
            <p style={{ margin: 0 }}>Connection error. We can&apos;t load your latest coverage data.</p>
            <button type="button" onClick={retryAll} className="dashboard-banner-action touch-target">
              <RefreshCcw size={14} />
              Retry
            </button>
          </div>
        ) : null}

        <Card style={{ background: heroGradient, borderRadius: 10 }}>
          <div className="dashboard-hero-grid">
            <ShieldHeroIcon status={heroStatus} />
            <div>
              <h2 style={{ margin: 0, letterSpacing: "0.05em" }}>
                {heroStatus === "covered"
                  ? "COVERED THIS WEEK"
                  : heroStatus === "alert"
                    ? "TRIGGER ALERT"
                    : "ACTIVATE COVERAGE"}
              </h2>
              <p className="mono" style={{ margin: "6px 0 0 0", color: "var(--text-secondary)" }}>
                {policyNumber}
              </p>
              <p className={`dashboard-expiry ${expiryToneClass} ${expiryPulseClass}`} style={{ margin: "6px 0 0 0" }}>
                {expiryDisplayText}
              </p>
            </div>
            {heroStatus === "inactive" ? (
              <Button variant="secondary" onClick={() => navigate("/premium")} style={{ justifySelf: "end" }}>
                Activate Coverage
              </Button>
            ) : null}
          </div>
        </Card>

        <Card style={{ borderRadius: 10 }}>
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>{periodGreeting(workerName)}</h3>
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>
            Check your policy status, forecast risk, and recent payouts in one place.
          </p>
          <div style={{ marginTop: 8 }}>
            <Badge tone={tierTone(currentWorker?.tier)}>{(currentWorker?.tier ?? "restricted").toUpperCase()} TIER</Badge>
          </div>
        </Card>

        <section className="dashboard-stats-grid">
          {showClaimsLoading || showPolicyLoading ? (
            [1, 2, 3].map((item) => (
              <Card key={item} className="dashboard-stat-card">
                <div className="skeleton" style={{ height: 12, borderRadius: 6, width: "48%" }} />
                <div className="skeleton" style={{ height: 28, borderRadius: 6, width: "70%" }} />
                <div className="skeleton" style={{ height: 14, borderRadius: 6, width: "40%" }} />
              </Card>
            ))
          ) : (
            <>
              <Card className="dashboard-stat-card">
                <p className="dashboard-stat-label">This Week Premium</p>
                <p className="dashboard-stat-value">{formatINR(weeklyPremium)}</p>
                <StatTrend direction="flat" />
              </Card>
              <Card className="dashboard-stat-card">
                <p className="dashboard-stat-label">Total Claimed</p>
                <p className="dashboard-stat-value">{formatINR(totalClaimed)}</p>
                <StatTrend direction={totalClaimed > 0 ? "up" : "flat"} />
              </Card>
              <Card className="dashboard-stat-card">
                <p className="dashboard-stat-label">Active Since</p>
                <p className="dashboard-stat-value">{toMonthYear(activatedAt)}</p>
                <StatTrend direction="flat" />
              </Card>
            </>
          )}
        </section>

        {shouldShowTrigger && liveTrigger ? (
          <div className="dashboard-trigger-banner" role="status">
            <div className="dashboard-trigger-copy">
              <p style={{ margin: 0, fontWeight: 700 }}>
                {liveTrigger.peril.toUpperCase()} alert in {liveTrigger.zoneLabel}
              </p>
              <p style={{ margin: 0, color: "var(--text-secondary)" }}>
                {liveTrigger.city} disruption detected. Estimated payout: {formatINR(maxPayout * liveTrigger.payoutPct)}
              </p>
            </div>
            <button
              type="button"
              className="dashboard-trigger-dismiss touch-target"
              onClick={() => setDismissedTriggerId(liveTrigger.id)}
              aria-label="Dismiss trigger alert"
            >
              ×
            </button>
          </div>
        ) : null}

        <Card style={{ borderRadius: 10 }}>
          <div className="dashboard-section-head">
            <h3 style={{ margin: 0 }}>Risk Forecast</h3>
            {zoneHeatmap?.peril ? <Badge tone="warning">{zoneHeatmap.peril.toUpperCase()}</Badge> : null}
          </div>

          {showForecastLoading ? (
            <div className="dashboard-forecast-skeleton">
              {dayLabels.map((day) => (
                <div key={day} className="skeleton dashboard-forecast-skeleton-bar" />
              ))}
            </div>
          ) : !forecastData.length || heatmapQuery.isError ? (
            <div className="dashboard-forecast-empty">
              <AlertTriangle size={18} color="var(--text-secondary)" />
              <p style={{ margin: 0, color: "var(--text-secondary)" }}>Forecast unavailable</p>
            </div>
          ) : (
            <div className="dashboard-forecast-chart">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={forecastData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="day" tick={{ fill: "#9a9a9a", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: "#9a9a9a", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 30]}
                    unit="%"
                    width={34}
                  />
                  <Tooltip
                    formatter={(value: number) => `${value}%`}
                    labelFormatter={(label) => `${label}`}
                    contentStyle={{ background: "#111111", border: "1px solid #2a2a2a" }}
                  />
                  <Area type="stepAfter" dataKey="lowRisk" stroke="#00d97e" fill="rgba(0,217,126,0.25)" />
                  <Area type="stepAfter" dataKey="midRisk" stroke="#f5a623" fill="rgba(245,166,35,0.25)" />
                  <Area type="stepAfter" dataKey="highRisk" stroke="#ff3b3b" fill="rgba(255,59,59,0.26)" />
                </AreaChart>
              </ResponsiveContainer>
              <div style={{ marginTop: 8 }}>
                <Badge tone="warning">Highest risk: {highestRisk}</Badge>
              </div>
            </div>
          )}
        </Card>

        <Card style={{ borderRadius: 10 }}>
          <h3 style={{ marginTop: 0 }}>Recent Claims</h3>
          {showClaimsLoading ? (
            <div className="dashboard-claims-list">
              {[1, 2, 3].map((item) => (
                <div key={item} className="skeleton dashboard-claims-skeleton-row" />
              ))}
            </div>
          ) : claims.length === 0 ? (
            <div className="dashboard-empty-claims">
              <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 2.7l7 2.9v5.1c0 4.8-3 9-7 10.6-4-1.6-7-5.8-7-10.6V5.6l7-2.9z"
                  fill="none"
                  stroke="var(--success)"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path d="M8.5 12.2l2.2 2.2 4.8-4.8" stroke="var(--success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <p style={{ margin: 0, fontWeight: 700 }}>No claims yet</p>
                <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)" }}>
                  When a disruption triggers in your zone, your payout appears here automatically.
                </p>
              </div>
            </div>
          ) : (
            <div className="dashboard-claims-list">
              {claims.slice(0, 3).map((claim) => (
                <div key={claim.id} className="dashboard-claim-row">
                  <div>
                    <p className="mono" style={{ margin: 0 }}>
                      {claim.claim_number}
                    </p>
                    <p style={{ margin: "2px 0 0 0", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
                      {formatDateTime(claim.settled_at ?? claim.created_at)}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{formatINR(Number(claim.payout_amount || 0))}</p>
                    <p style={{ margin: "2px 0 0 0", color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
                      {claim.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </WorkerShell>
  );
}
