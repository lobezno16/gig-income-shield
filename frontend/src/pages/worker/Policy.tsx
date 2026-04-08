import { useEffect, useMemo, useState } from "react";
import { Check, CloudRain, Droplets, Lock, Store, Thermometer, Wind, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import { updatePolicyPlan } from "../../api/client";
import { WorkerShell } from "../../components/WorkerShell";
import { Badge } from "../../design-system/components/Badge";
import { Button } from "../../design-system/components/Button";
import { Card } from "../../design-system/components/Card";
import { useAuthGuard } from "../../hooks/useAuthGuard";
import { usePolicy } from "../../hooks/usePolicy";
import { useWorkerStore } from "../../store/workerStore";
import type { Plan } from "../../types";
import { formatINR, getPoolDisplayName } from "../../utils/formatters";
import { H3_ZONES } from "../../utils/mockData";

type CoverageStatus = "active" | "lapsed" | "suspended";

interface PolicyPagePayload {
  policy_number: string;
  worker: {
    id: string;
    name: string;
    phone: string;
    h3_hex: string;
  };
  coverage: {
    status: CoverageStatus;
    pool: string;
    plan: Plan;
    weekly_premium_inr: number;
    max_payout_per_week_inr: number;
    coverage_days_per_week: number;
    expires_at: string | null;
    activated_at: string | null;
    covered_perils: string[];
  };
  irdai_compliance: {
    sandbox_id: string | null;
    exclusions_version: string;
    exclusions: string[];
  };
}

const perilCatalog = [
  { key: "rain", label: "Heavy Rain", description: "Heavy rainfall above 50mm/day", icon: CloudRain },
  { key: "aqi", label: "Air Quality", description: "Air quality index above 300", icon: Wind },
  { key: "heat", label: "Extreme Heat", description: "Temperature above 42C", icon: Thermometer },
  { key: "flood", label: "Flood Alert", description: "Flood alert Level 1+", icon: Droplets },
  { key: "storm", label: "Storm Winds", description: "Storm winds above 50km/h", icon: Zap },
  { key: "curfew", label: "Curfew", description: "Unplanned area lockdown", icon: Lock },
  { key: "store", label: "Store Closure", description: "65%+ dark-store closure in your zone", icon: Store },
] as const;

const planOverview: Record<Plan, { premiumRange: string; maxPayout: string; coverageDays: string }> = {
  lite: { premiumRange: "INR 20-30", maxPayout: "Up to INR 400", coverageDays: "3 days/week" },
  standard: { premiumRange: "INR 30-40", maxPayout: "Up to INR 700", coverageDays: "5 days/week" },
  pro: { premiumRange: "INR 40-50", maxPayout: "Up to INR 1200", coverageDays: "6 days/week" },
};

function formatLongDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "Not available";
  return new Date(isoDate).toLocaleDateString("en-IN", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function zoneAreaFromHex(hex: string): string {
  const zone = H3_ZONES[hex as keyof typeof H3_ZONES];
  if (!zone) return "Coverage zone";
  return `${zone.city.charAt(0).toUpperCase() + zone.city.slice(1)} - ${zone.area_display}`;
}

function statusMeta(status: CoverageStatus): { label: string; tone: "success" | "warning" | "danger" } {
  if (status === "active") return { label: "ACTIVE", tone: "success" };
  if (status === "suspended") return { label: "SUSPENDED", tone: "warning" };
  return { label: "EXPIRED", tone: "danger" };
}

function daysUntil(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const expiryMs = new Date(isoDate).getTime();
  const nowMs = Date.now();
  const rawDays = (expiryMs - nowMs) / (1000 * 60 * 60 * 24);
  return rawDays >= 0 ? Math.ceil(rawDays) : Math.floor(rawDays);
}

export function WorkerPolicyPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuthGuard();
  const { currentWorker } = useWorkerStore();
  const workerId = currentWorker?.id ?? "";
  const policyQuery = usePolicy(workerId);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [renewing, setRenewing] = useState(false);

  const policy = policyQuery.data?.data as PolicyPagePayload | undefined;
  const status = policy?.coverage.status ?? "lapsed";
  const statusDisplay = statusMeta(status);
  const daysToExpiry = daysUntil(policy?.coverage.expires_at);
  const isLapsed = status !== "active" || (typeof daysToExpiry === "number" && daysToExpiry < 0);
  const isRenewingSoon = status === "active" && typeof daysToExpiry === "number" && daysToExpiry >= 0 && daysToExpiry <= 3;
  const zoneDisplay = zoneAreaFromHex(policy?.worker.h3_hex ?? currentWorker?.h3_hex ?? "");
  const poolDisplay = getPoolDisplayName(policy?.coverage.pool ?? "");
  const planName = (policy?.coverage.plan ?? "standard").toUpperCase();

  const notFound = useMemo(() => {
    if (!policyQuery.error) return false;
    if (axios.isAxiosError(policyQuery.error)) return policyQuery.error.response?.status === 404;
    return false;
  }, [policyQuery.error]);
  const loadFailed = policyQuery.isError && !notFound;

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleRenewNow = async () => {
    if (!workerId || renewing || !policy) return;
    setRenewing(true);
    try {
      await updatePolicyPlan(workerId, policy.coverage.plan);
      setToastMessage("Coverage renewed successfully");
      await policyQuery.refetch();
    } catch {
      setToastMessage("Renewal failed. Please try again.");
    } finally {
      setRenewing(false);
    }
  };

  if (isLoading) return null;
  if (!isAuthenticated || !currentWorker) return null;

  if (policyQuery.isLoading) {
    return (
      <WorkerShell activeTab="policy" pageTitle="Policy" maxWidth={900}>
        <section className="policy-page-stack">
          <Card className="policy-skeleton-card">
            <div className="skeleton policy-skeleton-line policy-skeleton-line--sm" />
            <div className="skeleton policy-skeleton-line policy-skeleton-line--lg" />
            <div className="skeleton policy-skeleton-line policy-skeleton-line--md" />
          </Card>
          <Card className="policy-skeleton-grid">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="skeleton policy-skeleton-tile" />
            ))}
          </Card>
          <Card className="policy-skeleton-grid">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="skeleton policy-skeleton-tile" />
            ))}
          </Card>
        </section>
      </WorkerShell>
    );
  }

  if (loadFailed) {
    return (
      <WorkerShell activeTab="policy" pageTitle="Policy" maxWidth={900}>
        <Card>
          <h2 style={{ marginTop: 0 }}>Unable to load policy</h2>
          <p style={{ color: "var(--text-secondary)" }}>
            We could not fetch your latest policy details right now.
          </p>
          <Button variant="secondary" onClick={() => void policyQuery.refetch()}>
            Retry
          </Button>
        </Card>
      </WorkerShell>
    );
  }

  if (notFound || !policy) {
    return (
      <WorkerShell activeTab="policy" pageTitle="Policy" maxWidth={900}>
        <Card>
          <h2 style={{ marginTop: 0 }}>No active policy</h2>
          <p style={{ color: "var(--text-secondary)" }}>
            You are currently not covered. Activate your income shield to protect against disruptions.
          </p>
          <Button onClick={() => navigate("/register")}>Get Covered</Button>
        </Card>
      </WorkerShell>
    );
  }

  return (
    <WorkerShell activeTab="policy" pageTitle="Policy" maxWidth={900}>
      <section className="policy-page-stack">
        {isLapsed ? (
          <div className="policy-expired-banner" role="alert">
            <p style={{ margin: 0 }}>
              {typeof daysToExpiry === "number" && daysToExpiry < 0
                ? `Your coverage has lapsed ${Math.abs(daysToExpiry)} day${Math.abs(daysToExpiry) === 1 ? "" : "s"} ago.`
                : "Your coverage has lapsed. Tap below to renew."}
            </p>
            <Button variant="danger" onClick={() => void handleRenewNow()} disabled={renewing}>
              {renewing ? "Renewing..." : "Renew Now"}
            </Button>
          </div>
        ) : null}
        {isRenewingSoon ? (
          <div className="policy-renew-soon-banner" role="status">
            <p style={{ margin: 0 }}>
              Your coverage renews in {daysToExpiry} day{daysToExpiry === 1 ? "" : "s"} - premium will be recalculated automatically.
            </p>
          </div>
        ) : null}

        <Card className="policy-hero-card">
          <div className="policy-hero-icon">
            <svg width="78" height="78" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 2.8l7 2.8v5.4c0 5.1-3 9.6-7 11.2-4-1.6-7-6.1-7-11.2V5.6l7-2.8z"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path d="M12.8 7.5l-3.5 5.2h2.6l-0.7 3.8 3.5-5.2h-2.6l0.7-3.8z" fill="var(--accent)" />
            </svg>
          </div>
          <div className="policy-hero-copy">
            <h2 style={{ margin: 0 }}>Your Shield</h2>
            <div className="policy-hero-meta">
              <Badge tone="accent">{planName}</Badge>
              <Badge tone={statusDisplay.tone}>{statusDisplay.label}</Badge>
            </div>
            <p className="mono" style={{ margin: 0, color: "var(--text-secondary)" }}>
              {policy.policy_number}
            </p>
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>
              {status === "active"
                ? `Valid until: ${formatLongDate(policy.coverage.expires_at)}`
                : `Expired ${typeof daysToExpiry === "number" ? Math.abs(daysToExpiry) : 0} day${Math.abs(daysToExpiry ?? 0) === 1 ? "" : "s"} ago`}
            </p>
          </div>
        </Card>

        <Card>
          <h3 className="policy-section-title">What you&apos;re covered for</h3>
          <p className="policy-muted">
            {zoneDisplay} - {poolDisplay}
          </p>
          <div className="policy-perils-grid">
            {perilCatalog.map((peril) => {
              const Icon = peril.icon;
              const enabled = policy.coverage.covered_perils.includes(peril.key);
              return (
                <article key={peril.key} className={`policy-peril-card ${enabled ? "is-enabled" : ""}`}>
                  <Icon size={18} color={enabled ? "var(--success)" : "var(--text-secondary)"} />
                  <div>
                    <p className="policy-peril-label">{peril.label}</p>
                    <p className="policy-peril-desc">{peril.description}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </Card>

        <Card>
          <h3 className="policy-section-title">Your numbers</h3>
          <div className="policy-numbers-grid">
            <div className="policy-number-tile">
              <p className="policy-number-label">Weekly premium</p>
              <p className="policy-number-value">
                {formatINR(policy.coverage.weekly_premium_inr)}
                <span className="policy-number-unit"> / week</span>
              </p>
            </div>
            <div className="policy-number-tile">
              <p className="policy-number-label">Max payout</p>
              <p className="policy-number-value">
                {formatINR(policy.coverage.max_payout_per_week_inr)}
                <span className="policy-number-unit"> / week</span>
              </p>
            </div>
            <div className="policy-number-tile">
              <p className="policy-number-label">Coverage</p>
              <p className="policy-number-value">{policy.coverage.coverage_days_per_week} days / week</p>
            </div>
            <div className="policy-number-tile">
              <p className="policy-number-label">Activated</p>
              <p className="policy-number-value">{formatLongDate(policy.coverage.activated_at)}</p>
            </div>
          </div>

          <div className="policy-plan-table-wrap">
            <p className="policy-table-title">Plan comparison</p>
            <table className="table policy-plan-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Premium</th>
                  <th>Max payout</th>
                  <th>Coverage days</th>
                  <th>Protection</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(planOverview) as Plan[]).map((plan) => (
                  <tr key={plan}>
                    <td style={{ textTransform: "capitalize" }}>{plan}</td>
                    <td>{planOverview[plan].premiumRange}</td>
                    <td>{planOverview[plan].maxPayout}</td>
                    <td>{planOverview[plan].coverageDays}</td>
                    <td>
                      <span className="policy-check-pill">
                        <Check size={13} /> Included
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <details className="policy-legal-details">
            <summary>View policy exclusions &amp; IRDAI compliance</summary>
            <p className="policy-legal-note">This policy is issued under IRDAI Sandbox Framework 2026.</p>
            <p className="policy-legal-note">
              Sandbox ID: {policy.irdai_compliance.sandbox_id ?? "Not available"} | Exclusions version: {policy.irdai_compliance.exclusions_version}
            </p>
            <ul className="policy-legal-list">
              {policy.irdai_compliance.exclusions.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </details>
        </Card>

        <div className="policy-actions">
          <Button onClick={() => navigate("/premium")}>Change Plan</Button>
          <Button variant="ghost" onClick={() => setToastMessage("Coming soon")}>
            Download Policy PDF
          </Button>
        </div>
      </section>

      {toastMessage ? (
        <div className="surface policy-toast" role="status">
          {toastMessage}
        </div>
      ) : null}
    </WorkerShell>
  );
}
