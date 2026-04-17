import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { getHeatmap } from "../../api/client";
import { useClaims } from "../../hooks/useClaims";
import { usePolicy } from "../../hooks/usePolicy";
import { useSSE } from "../../hooks/useSSE";
import type { Worker } from "../../types";
import { formatINR } from "../../utils/formatters";

interface WorkerDashboardProps {
  worker: Worker;
}

interface WorkerPolicyResponse {
  data?: {
    policy_number?: string;
    coverage?: {
      status?: "active" | "lapsed" | "suspended";
      plan?: "lite" | "standard" | "pro";
      weekly_premium_inr?: number;
      max_payout_per_week_inr?: number;
      expires_at?: string | null;
      pool?: string;
      covered_perils?: string[];
    };
    irdai_compliance?: {
      loss_scope?: string;
      billing_cadence?: string;
      peril_trigger_rules?: Record<string, string>;
    };
  };
}

interface WorkerClaimRow {
  id: string;
  claim_number: string;
  status: string;
  payout_amount: number;
  created_at: string;
  settled_at: string | null;
  upi_ref?: string | null;
}

interface WorkerClaimsResponse {
  data?: {
    claims?: WorkerClaimRow[];
  };
}

interface HeatmapHexRow {
  h3_hex: string;
  city: string;
  pool_id: string;
  trigger_prob: number;
}

interface HeatmapResponse {
  data?: {
    hexes?: HeatmapHexRow[];
  };
}

interface ClaimSseEnvelope {
  type: string;
  data: {
    claim_id?: string;
    claim_number?: string;
    status?: string;
    amount?: number;
    upi_ref?: string;
    bank_ref?: string;
  };
  timestamp: string;
}

interface InstantPayoutFeedRow {
  id: string;
  claimNumber: string;
  amount: number;
  status: string;
  whenISO: string;
  channel: string;
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function toReadableDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function parsePoolLabel(poolId: string | undefined): string {
  if (!poolId) return "Unmapped Zone";
  const normalized = poolId
    .replace("_flood_", "_rain_")
    .replace("_heat_", "_aqi_")
    .replace("_mixed_", "_curfew_");
  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function parseCoverageExpiry(iso: string | null | undefined): string {
  if (!iso) return "No expiry date";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No expiry date";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function normalizeStatus(status: string): string {
  const lower = status.toLowerCase();
  if (lower === "paid") return "PAID";
  if (lower === "processing") return "PROCESSING";
  if (lower === "approved") return "APPROVED";
  if (lower === "blocked") return "BLOCKED";
  if (lower === "flagged") return "FLAGGED";
  return status.toUpperCase();
}

function prettyScope(scope: string | undefined): string {
  if (!scope) return "loss of income only";
  return scope.replace(/_/g, " ");
}

export function WorkerDashboard({ worker }: WorkerDashboardProps) {
  const workerId = worker.id;
  const policyQuery = usePolicy(workerId);
  const claimsQuery = useClaims(workerId);
  const heatmapQuery = useQuery({
    queryKey: ["neo-worker-heatmap", workerId],
    queryFn: getHeatmap,
    staleTime: 45_000,
  });
  const payoutSse = useSSE("/api/sse/claims");

  const policyResponse = (policyQuery.data as WorkerPolicyResponse | undefined)?.data;
  const coverage = policyResponse?.coverage;
  const claims = ((claimsQuery.data as WorkerClaimsResponse | undefined)?.data?.claims ?? []) as WorkerClaimRow[];
  const heatmapHexes = ((heatmapQuery.data as HeatmapResponse | undefined)?.data?.hexes ?? []) as HeatmapHexRow[];

  const zone = useMemo(() => {
    return heatmapHexes.find((hex) => hex.h3_hex === worker.h3_hex) ?? null;
  }, [heatmapHexes, worker.h3_hex]);

  const weeklyProtected = useMemo(() => {
    const weekStart = startOfWeek(new Date()).getTime();
    return claims
      .filter((claim) => claim.status.toLowerCase() === "paid")
      .filter((claim) => {
        const settled = claim.settled_at ? new Date(claim.settled_at).getTime() : NaN;
        return Number.isFinite(settled) && settled >= weekStart;
      })
      .reduce((sum, claim) => sum + Number(claim.payout_amount || 0), 0);
  }, [claims]);

  const historicalPaidFeed = useMemo<InstantPayoutFeedRow[]>(() => {
    return claims
      .filter((claim) => claim.status.toLowerCase() === "paid")
      .map((claim) => ({
        id: claim.id,
        claimNumber: claim.claim_number,
        amount: Number(claim.payout_amount || 0),
        status: normalizeStatus(claim.status),
        whenISO: claim.settled_at ?? claim.created_at,
        channel: "Auto Settlement",
      }));
  }, [claims]);

  const liveFeed = useMemo<InstantPayoutFeedRow[]>(() => {
    const events = payoutSse.events as unknown as ClaimSseEnvelope[];
    return events
      .filter((event) => event.type === "claim_update")
      .filter((event) => (event.data.status ?? "").toLowerCase() === "paid")
      .map((event, index) => {
        const claimNumber = event.data.claim_number ?? `LIVE-${index + 1}`;
        const upiRef = event.data.upi_ref ?? "AUTO";
        return {
          id: event.data.claim_id ?? `${claimNumber}-${event.timestamp}`,
          claimNumber,
          amount: Number(event.data.amount ?? 0),
          status: "PAID",
          whenISO: event.timestamp,
          channel: `Instant UPI ${upiRef}`,
        };
      });
  }, [payoutSse.events]);

  const instantPayoutFeed = useMemo(() => {
    const map = new Map<string, InstantPayoutFeedRow>();
    [...liveFeed, ...historicalPaidFeed].forEach((row) => {
      if (!map.has(row.claimNumber)) {
        map.set(row.claimNumber, row);
      }
    });
    return [...map.values()]
      .sort((left, right) => new Date(right.whenISO).getTime() - new Date(left.whenISO).getTime())
      .slice(0, 8);
  }, [historicalPaidFeed, liveFeed]);

  const coverageActive = coverage?.status === "active";
  const weeklyPremium = Number(coverage?.weekly_premium_inr ?? worker.weekly_premium ?? 0);
  const maxPayout = Number(coverage?.max_payout_per_week_inr ?? worker.max_payout_week ?? 0);
  const zoneLabel = parsePoolLabel(zone?.pool_id ?? coverage?.pool);
  const triggerProbText = zone ? `${(zone.trigger_prob * 100).toFixed(1)}%` : "N/A";
  const coveredPerils = coverage?.covered_perils ?? ["rain", "curfew", "aqi"];
  const perilRules = policyResponse?.irdai_compliance?.peril_trigger_rules ?? {
    rain: "Heavy rain > 15 mm/hr",
    curfew: "Traffic delay > 40 min/km",
    aqi: "AQI > 450",
  };
  const claimsTotal = claims.length;
  const claimsPaid = claims.filter((claim) => claim.status.toLowerCase() === "paid").length;
  const claimsFlagged = claims.filter((claim) => claim.status.toLowerCase() === "flagged").length;
  const claimsBlocked = claims.filter((claim) => claim.status.toLowerCase() === "blocked").length;
  const claimsProcessing = claims.filter((claim) => claim.status.toLowerCase() === "processing").length;
  const autoSettleRate = claimsTotal > 0 ? `${((claimsPaid / claimsTotal) * 100).toFixed(1)}%` : "N/A";
  const lossScope = prettyScope(policyResponse?.irdai_compliance?.loss_scope);
  const billingCadence = policyResponse?.irdai_compliance?.billing_cadence ?? "weekly";

  return (
    <section className="nbdash">
      <header className="nbdash__head">
        <p className="nbdash__eyebrow">SOTERIA // WORKER VIEW</p>
        <h1 className="nbdash__title">Income Protection Dashboard</h1>
        <p className="nbdash__sub">
          Parametric, zero-touch payouts for {worker.platform.toUpperCase()} partner in {worker.city.toUpperCase()}.
        </p>
      </header>

      <div className="nbdash__grid">
        <article className="nbdash__panel">
          <p className="nbdash__label">Weekly Earnings Protected</p>
          <p className="nbdash__kpi">{formatINR(weeklyProtected)}</p>
          <p className="nbdash__meta">This week auto-protected earnings through instant settlements.</p>
        </article>

        <article className="nbdash__panel">
          <p className="nbdash__label">Active Hex-Zone Coverage</p>
          <p className={`nbdash__kpi ${coverageActive ? "is-active" : ""}`}>{worker.h3_hex}</p>
          <p className="nbdash__meta">Zone: {zoneLabel}</p>
          <p className="nbdash__meta">Policy: {policyResponse?.policy_number ?? worker.policy_number ?? "Pending"}</p>
          <p className="nbdash__meta">Coverage status: {coverageActive ? "ACTIVE" : "INACTIVE"}</p>
        </article>

        <article className="nbdash__panel">
          <p className="nbdash__label">Coverage Economics</p>
          <p className="nbdash__kpi">{formatINR(maxPayout)}</p>
          <p className="nbdash__meta">Max weekly payout</p>
          <p className="nbdash__meta">Weekly premium: {formatINR(weeklyPremium)}</p>
          <p className="nbdash__meta">Expiry: {parseCoverageExpiry(coverage?.expires_at)}</p>
          <p className="nbdash__meta">Hex risk probability: {triggerProbText}</p>
        </article>
      </div>

      <section className="nbdash__panel">
        <div className="nbdash__feed-head">
          <div>
            <p className="nbdash__label">Policy Contract Snapshot</p>
            <p className="nbdash__meta">Insurance constraints and trigger rules applied to your policy</p>
          </div>
        </div>
        <div className="nbdash__integrity-grid">
          <div className="nbdash__integrity-cell">
            <p className="nbdash__meta">Coverage scope</p>
            <p className="nbdash__integrity-value is-active">{lossScope}</p>
          </div>
          <div className="nbdash__integrity-cell">
            <p className="nbdash__meta">Billing cadence</p>
            <p className="nbdash__integrity-value is-active">{billingCadence}</p>
          </div>
          <div className="nbdash__integrity-cell">
            <p className="nbdash__meta">Covered perils</p>
            <p className="nbdash__integrity-value">{coveredPerils.join(" / ")}</p>
          </div>
          <div className="nbdash__integrity-cell">
            <p className="nbdash__meta">Auto-settlement rate</p>
            <p className="nbdash__integrity-value">{autoSettleRate}</p>
          </div>
          <div className="nbdash__integrity-cell">
            <p className="nbdash__meta">Claim mix</p>
            <p className="nbdash__integrity-value">{`P:${claimsPaid} F:${claimsFlagged} B:${claimsBlocked} In-Progress:${claimsProcessing}`}</p>
          </div>
          <div className="nbdash__integrity-cell">
            <p className="nbdash__meta">Rain trigger</p>
            <p className="nbdash__integrity-value">{perilRules.rain ?? "Heavy rain > 15 mm/hr"}</p>
          </div>
          <div className="nbdash__integrity-cell">
            <p className="nbdash__meta">Traffic trigger</p>
            <p className="nbdash__integrity-value">{perilRules.curfew ?? "Traffic delay > 40 min/km"}</p>
          </div>
          <div className="nbdash__integrity-cell">
            <p className="nbdash__meta">AQI trigger</p>
            <p className="nbdash__integrity-value">{perilRules.aqi ?? "AQI > 450"}</p>
          </div>
        </div>
      </section>

      <section className="nbdash__panel nbdash__panel--feed">
        <div className="nbdash__feed-head">
          <div>
            <p className="nbdash__label">Instant Payouts</p>
            <p className="nbdash__meta">Real-time zero-touch settlement activity</p>
          </div>
          <p className={`nbdash__live ${payoutSse.connected ? "is-live" : ""}`}>{payoutSse.connected ? "LIVE" : "OFFLINE"}</p>
        </div>

        {claimsQuery.isLoading ? (
          <p className="nbdash__empty">Loading payout feed...</p>
        ) : instantPayoutFeed.length === 0 ? (
          <p className="nbdash__empty">No settled payouts yet. Feed will auto-update after first trigger settlement.</p>
        ) : (
          <ul className="nbdash__feed-list">
            {instantPayoutFeed.map((item) => (
              <li key={item.id} className="nbdash__feed-item">
                <div className="nbdash__feed-main">
                  <p className="nbdash__feed-claim">{item.claimNumber}</p>
                  <p className="nbdash__feed-channel">{item.channel}</p>
                </div>
                <div className="nbdash__feed-right">
                  <p className="nbdash__feed-amount">{formatINR(item.amount)}</p>
                  <p className="nbdash__feed-time">{toReadableDate(item.whenISO)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
