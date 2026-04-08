import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, CloudRain, IndianRupee, Shield, Thermometer, Wind } from "lucide-react";

import { Badge } from "../../design-system/components/Badge";
import { Button } from "../../design-system/components/Button";
import { Card } from "../../design-system/components/Card";
import { useAuthGuard } from "../../hooks/useAuthGuard";
import { useClaims } from "../../hooks/useClaims";
import { usePolicy } from "../../hooks/usePolicy";
import { useWorkerStore } from "../../store/workerStore";
import type { ClaimStatus } from "../../types";
import { formatDateTime, formatINR } from "../../utils/formatters";
import { H3_ZONES } from "../../utils/mockData";
import { WorkerShell } from "../../components/WorkerShell";

interface ClaimTimelineStep {
  id: string;
  label: string;
  description: string;
  timestamp: string;
  status: "completed" | "active" | "future";
}

interface ClaimItem {
  id: string;
  claim_number: string;
  status: ClaimStatus;
  payout_amount: number;
  created_at: string;
  settled_at: string | null;
  timeline: ClaimTimelineStep[];
}

interface ClaimsResponse {
  data?: {
    claims: ClaimItem[];
  };
}

interface PolicyResponse {
  data?: {
    coverage: {
      covered_perils: string[];
    };
  };
}

interface DemoTimelineStep {
  id: string;
  label: string;
  description: string;
  timestamp: string;
}

const DEMO_TIMELINE_STEPS: DemoTimelineStep[] = [
  {
    id: "trigger_detected",
    label: "Disruption detected",
    description: "Heavy rainfall crossed zone threshold.",
    timestamp: "6:00 PM",
  },
  {
    id: "verified",
    label: "Auto-verified",
    description: "Eligibility and fraud checks passed.",
    timestamp: "6:01 PM",
  },
  {
    id: "paid",
    label: "Payout transferred",
    description: "INR 420 sent instantly to UPI.",
    timestamp: "6:03 PM",
  },
];

const DEMO_CLAIMS: ClaimItem[] = [
  {
    id: "demo-claim-1",
    claim_number: "CLM-2026-00041823",
    status: "paid",
    payout_amount: 420,
    created_at: "2026-04-01T18:00:00+05:30",
    settled_at: "2026-04-01T18:03:00+05:30",
    timeline: [
      {
        id: "trigger_detected",
        label: "Disruption Detected",
        description: "Rainfall threshold crossed for your zone.",
        timestamp: "2026-04-01T12:30:00+00:00",
        status: "completed",
      },
      {
        id: "eligibility_check",
        label: "Eligibility Verified",
        description: "Policy active and zone matched.",
        timestamp: "2026-04-01T12:30:30+00:00",
        status: "completed",
      },
      {
        id: "fraud_check",
        label: "Verification Complete",
        description: "ARGUS screening passed.",
        timestamp: "2026-04-01T12:31:00+00:00",
        status: "completed",
      },
      {
        id: "payout_calculated",
        label: "Payout Calculated",
        description: "INR 420 payout calculated.",
        timestamp: "2026-04-01T12:31:30+00:00",
        status: "completed",
      },
      {
        id: "transfer_initiated",
        label: "Transfer Initiated",
        description: "UPI transfer initiated.",
        timestamp: "2026-04-01T12:32:00+00:00",
        status: "completed",
      },
      {
        id: "confirmed",
        label: "Payment Confirmed",
        description: "UPI reference generated.",
        timestamp: "2026-04-01T12:33:00+00:00",
        status: "completed",
      },
    ],
  },
];

const perilLabelMap: Record<string, string> = {
  rain: "Heavy Rain",
  aqi: "Air Pollution",
  heat: "Extreme Heat",
  flood: "Flooding",
  storm: "Storm",
  curfew: "Curfew",
  store: "Store Closure",
};

function inferPeril(claim: ClaimItem): "rain" | "aqi" | "heat" {
  const timelineText = claim.timeline.map((step) => `${step.label} ${step.description}`.toLowerCase()).join(" ");
  if (timelineText.includes("aqi") || timelineText.includes("air")) return "aqi";
  if (timelineText.includes("heat") || timelineText.includes("temperature")) return "heat";
  return "rain";
}

function PerilIcon({ peril }: { peril: "rain" | "aqi" | "heat" }) {
  if (peril === "aqi") return <Wind size={16} />;
  if (peril === "heat") return <Thermometer size={16} />;
  return <CloudRain size={16} />;
}

function statusTone(status: ClaimStatus): "success" | "info" | "warning" | "danger" {
  if (status === "paid") return "success";
  if (status === "processing" || status === "approved") return "info";
  if (status === "blocked") return "danger";
  return "warning";
}

function payoutColor(status: ClaimStatus): string {
  if (status === "paid") return "var(--success)";
  if (status === "blocked") return "var(--danger)";
  return "var(--warning)";
}

function zoneAreaLabel(hex: string): string {
  const zone = H3_ZONES[hex as keyof typeof H3_ZONES];
  if (!zone) return "Coverage zone";
  return zone.area_display;
}

export function WorkerClaimsPage() {
  const [searchParams] = useSearchParams();
  const demoMode = searchParams.get("demo") === "true";
  const { isAuthenticated, isLoading } = useAuthGuard();
  const { currentWorker } = useWorkerStore();
  const workerId = currentWorker?.id ?? "";

  const claimsQuery = useClaims(demoMode ? "" : workerId);
  const policyQuery = usePolicy(demoMode ? "" : workerId);

  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);
  const [demoStepIndex, setDemoStepIndex] = useState(0);

  useEffect(() => {
    if (!demoMode) return;
    setDemoStepIndex(0);
    const t1 = window.setTimeout(() => setDemoStepIndex(1), 2200);
    const t2 = window.setTimeout(() => setDemoStepIndex(2), 4700);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [demoMode]);

  const claimsData = claimsQuery.data as ClaimsResponse | undefined;
  const policyData = policyQuery.data as PolicyResponse | undefined;

  const claims = useMemo(() => {
    if (demoMode) return DEMO_CLAIMS;
    return claimsData?.data?.claims ?? [];
  }, [claimsData?.data?.claims, demoMode]);

  const totals = useMemo(() => {
    const claimsFiled = claims.length;
    const totalPaidOut = claims
      .filter((claim) => claim.status === "paid")
      .reduce((sum, claim) => sum + Number(claim.payout_amount || 0), 0);
    const protectedDays = new Set(claims.map((claim) => claim.created_at.slice(0, 10))).size;
    return {
      claimsFiled,
      totalPaidOut,
      protectedDays,
    };
  }, [claims]);

  const coveredPerilsText = useMemo(() => {
    const perils = policyData?.data?.coverage?.covered_perils ?? ["rain", "heat", "aqi"];
    return perils.map((peril) => perilLabelMap[peril] ?? peril.toUpperCase()).join(", ");
  }, [policyData?.data?.coverage?.covered_perils]);

  const showClaimsLoading = !demoMode && claimsQuery.isLoading;
  const hasClaims = claims.length > 0;

  if (isLoading) return null;
  if (!isAuthenticated || !currentWorker) return null;

  return (
    <WorkerShell activeTab="claims" pageTitle="Claims" maxWidth={900}>
      <section className="claims-page-stack">
        <Card>
          <div className="claims-section-head">
            <h1 style={{ margin: 0 }}>Recent Claims</h1>
            <p className="claims-muted">Auto-filed and tracked in real time</p>
          </div>

          {showClaimsLoading ? (
            <div className="claims-skeleton-list">
              {[1, 2, 3].map((item) => (
                <div key={item} className="skeleton claims-skeleton-card" />
              ))}
            </div>
          ) : hasClaims ? (
            <div className="claims-card-list">
              {claims.map((claim) => {
                const peril = inferPeril(claim);
                const isExpanded = expandedClaimId === claim.id;
                return (
                  <article key={claim.id} className="claims-item-card">
                    <div className="claims-item-top">
                      <p className="mono claims-claim-number">{claim.claim_number}</p>
                      <Badge tone={statusTone(claim.status)}>{claim.status.toUpperCase()}</Badge>
                    </div>

                    <div className="claims-item-mid">
                      <span className="claims-peril-pill">
                        <PerilIcon peril={peril} />
                        <span>{perilLabelMap[peril]}</span>
                      </span>
                      <p className="claims-muted">{formatDateTime(claim.settled_at ?? claim.created_at)}</p>
                    </div>

                    <div className="claims-item-bottom">
                      <p className="claims-payout" style={{ color: payoutColor(claim.status) }}>
                        {formatINR(claim.payout_amount)}
                      </p>
                      <Button variant="ghost" onClick={() => setExpandedClaimId(isExpanded ? null : claim.id)}>
                        {isExpanded ? "Hide details" : "View details"}
                      </Button>
                    </div>

                    {isExpanded ? (
                      <div className="claims-timeline">
                        {claim.timeline.map((step) => (
                          <div key={step.id} className="claims-timeline-row">
                            <span className={`claims-timeline-dot claims-timeline-dot--${step.status}`} />
                            <div>
                              <div className="claims-timeline-head">
                                <p>{step.label}</p>
                                <Badge tone={step.status === "completed" ? "success" : step.status === "active" ? "info" : "muted"}>
                                  {step.status}
                                </Badge>
                              </div>
                              <p className="claims-muted">{step.description}</p>
                              <p className="claims-muted mono">{formatDateTime(step.timestamp)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="claims-empty-state">
              <svg width="170" height="96" viewBox="0 0 170 96" role="img" aria-label="Delivery rider protected by shield">
                <circle cx="36" cy="76" r="12" fill="none" stroke="#6f6f6f" strokeWidth="3" />
                <circle cx="86" cy="76" r="12" fill="none" stroke="#6f6f6f" strokeWidth="3" />
                <path d="M24 76h25l12-18h24" stroke="#6f6f6f" strokeWidth="3" strokeLinecap="round" />
                <rect x="62" y="44" width="21" height="14" rx="3" fill="#1d1d1d" stroke="#6f6f6f" />
                <circle cx="61" cy="35" r="6" fill="#2b2b2b" />
                <path d="M109 12l18 7v13c0 9-6 17-18 20-12-3-18-11-18-20V19l18-7z" fill="rgba(91,79,255,0.14)" stroke="var(--accent)" strokeWidth="2" />
                <path d="M102 32l5 5 10-10" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h2>You&apos;re protected</h2>
              <p>
                When heavy rain, extreme heat, or air pollution hits your zone, your claim is filed automatically. No action needed from you.
              </p>
              <small>
                Coverage active - Zone: {zoneAreaLabel(currentWorker.h3_hex)} - {coveredPerilsText}
              </small>
            </div>
          )}
        </Card>

        <Card>
          <h2 style={{ marginTop: 0 }}>How claims work</h2>
          <div className="claims-how-grid">
            <article className="claims-how-step">
              <span className="claims-how-icon">
                <Shield size={16} />
              </span>
              <h3>Disruption detected in your zone</h3>
              <p>Our trigger engine monitors weather and disruption signals continuously.</p>
            </article>
            <article className="claims-how-step">
              <span className="claims-how-icon">
                <CheckCircle2 size={16} />
              </span>
              <h3>Verified automatically by Soteria</h3>
              <p>Eligibility and fraud checks run instantly, no manual paperwork needed.</p>
            </article>
            <article className="claims-how-step">
              <span className="claims-how-icon">
                <IndianRupee size={16} />
              </span>
              <h3>Payout sent to your UPI within minutes</h3>
              <p>Once confirmed, payout is transferred directly to your registered UPI ID.</p>
            </article>
          </div>
        </Card>

        {demoMode ? (
          <Card>
            <div className="claims-demo-head">
              <h3 style={{ margin: 0 }}>Demo: Live Claim</h3>
              <Badge tone="info">DEMO MODE</Badge>
            </div>
            <div className="claims-demo-timeline">
              {DEMO_TIMELINE_STEPS.map((step, index) => {
                const state = index < demoStepIndex ? "completed" : index === demoStepIndex ? "active" : "future";
                return (
                  <div key={step.id} className="claims-demo-row">
                    <span className={`claims-timeline-dot claims-timeline-dot--${state}`} />
                    <div>
                      <div className="claims-timeline-head">
                        <p>{step.label}</p>
                        <Badge tone={state === "completed" ? "success" : state === "active" ? "info" : "muted"}>{state}</Badge>
                      </div>
                      <p className="claims-muted">{step.description}</p>
                      <p className="claims-muted mono">{step.timestamp}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : null}

        <Card>
          <h3 style={{ marginTop: 0 }}>Claim history summary</h3>
          {showClaimsLoading ? (
            <div className="claims-summary-grid">
              {[1, 2, 3].map((item) => (
                <div key={item} className="skeleton claims-summary-pill" />
              ))}
            </div>
          ) : (
            <div className="claims-summary-grid">
              <div className="claims-summary-pill">
                <strong>{totals.claimsFiled}</strong>
                <span>claims filed</span>
              </div>
              <div className="claims-summary-pill">
                <strong>{formatINR(totals.totalPaidOut)}</strong>
                <span>total paid out</span>
              </div>
              <div className="claims-summary-pill">
                <strong>{totals.protectedDays}</strong>
                <span>days protected</span>
              </div>
            </div>
          )}
        </Card>
      </section>
    </WorkerShell>
  );
}
