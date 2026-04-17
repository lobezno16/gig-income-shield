import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Play, ShieldCheck, ShieldX, Sparkles, Zap } from "lucide-react";

import { simulateTriggerEvent } from "../../api/client";
import { WorkerShell } from "../../components/WorkerShell";
import { Badge } from "../../design-system/components/Badge";
import { Button } from "../../design-system/components/Button";
import { Card } from "../../design-system/components/Card";
import { useWorkerStore } from "../../store/workerStore";

type StepId = "disruption" | "policy" | "argus" | "calculation" | "settlement";
type StepStatus = "pending" | "active" | "completed";

type ApiMode = "idle" | "loading" | "live" | "fallback";

const ARGUS_LAYERS = [
  "Layer 0: Rules check ✓",
  "Layer 1: Trust Score 0.91 ✓",
  "Layer 2: Isolation Forest — Normal ✓",
  "Layer 3: Regional Z-Score — Consistent ✓",
] as const;

const INITIAL_STEPS: Record<StepId, StepStatus> = {
  disruption: "pending",
  policy: "pending",
  argus: "pending",
  calculation: "pending",
  settlement: "pending",
};

const ORDERED_STEP_IDS: StepId[] = ["disruption", "policy", "argus", "calculation", "settlement"];

interface SettlementInfo {
  payoutId: string;
  utr: string;
  timestamp: string;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function randomNumeric(length: number): string {
  return Array.from({ length })
    .map(() => Math.floor(Math.random() * 10).toString())
    .join("");
}

function buildSettlementInfo(now = new Date()): SettlementInfo {
  return {
    payoutId: `pout_test_${randomNumeric(12)}`,
    utr: `UTR${randomNumeric(14)}`,
    timestamp: now.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }),
  };
}

function statusBadgeTone(status: StepStatus): "muted" | "info" | "success" {
  if (status === "active") return "info";
  if (status === "completed") return "success";
  return "muted";
}

function StepStatusPill({ status }: { status: StepStatus }) {
  if (status === "completed") {
    return (
      <span className="payout-sim-status-icon payout-sim-status-icon--completed" aria-label="Completed">
        <CheckCircle2 size={16} />
      </span>
    );
  }
  if (status === "active") {
    return <span className="payout-sim-status-icon payout-sim-status-icon--active pulse" aria-label="In progress" />;
  }
  return <span className="payout-sim-status-icon payout-sim-status-icon--pending" aria-label="Pending" />;
}

export function PayoutSimulatorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const demoMode = searchParams.get("demo") === "true";
  const { currentWorker, isAuthenticated, isLoading } = useWorkerStore();
  const [steps, setSteps] = useState<Record<StepId, StepStatus>>(INITIAL_STEPS);
  const [running, setRunning] = useState(false);
  const [apiMode, setApiMode] = useState<ApiMode>("idle");
  const [argusLayerIndex, setArgusLayerIndex] = useState(-1);
  const [settlementInfo, setSettlementInfo] = useState<SettlementInfo>(() => buildSettlementInfo());
  const [simulationStartedAt, setSimulationStartedAt] = useState<string | null>(null);
  const sequenceRef = useRef(0);

  const workerName = demoMode ? "Ravi Kumar" : (currentWorker?.name ?? "Ravi Kumar");
  const policyNumber = demoMode ? "SOT-2026-001847" : (currentWorker?.policy_number ?? "SOT-2026-001847");
  const plan = demoMode ? "pro" : (currentWorker?.plan ?? "pro");
  const upiId = demoMode ? "ravi.k@upi" : (currentWorker?.upi_id ?? "ravi.k@upi");
  const isPro = plan === "pro";
  const payoutAmount = isPro ? 500 : 210;

  useEffect(() => {
    if (!demoMode && !isLoading && !isAuthenticated) {
      navigate("/register", { replace: true });
    }
  }, [demoMode, isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    return () => {
      sequenceRef.current += 1;
    };
  }, []);

  const visibleSteps = useMemo(
    () => ORDERED_STEP_IDS.filter((stepId) => steps[stepId] !== "pending"),
    [steps]
  );

  const progress = useMemo(() => {
    const done = ORDERED_STEP_IDS.filter((stepId) => steps[stepId] === "completed").length;
    if (steps.argus === "active" && argusLayerIndex >= 0) {
      return Math.min(100, Math.round(((done + (argusLayerIndex + 1) / ARGUS_LAYERS.length) / ORDERED_STEP_IDS.length) * 100));
    }
    if (steps.calculation === "active" || steps.settlement === "active") {
      return Math.min(100, Math.round(((done + 0.5) / ORDERED_STEP_IDS.length) * 100));
    }
    return Math.round((done / ORDERED_STEP_IDS.length) * 100);
  }, [argusLayerIndex, steps]);

  async function runSimulationSequence() {
    const thisSequence = sequenceRef.current + 1;
    sequenceRef.current = thisSequence;

    const setStep = (stepId: StepId, status: StepStatus) => {
      if (sequenceRef.current !== thisSequence) return;
      setSteps((prev) => ({ ...prev, [stepId]: status }));
    };

    setStep("disruption", "active");
    await wait(1500);
    setStep("disruption", "completed");

    await wait(1000);
    setStep("policy", "active");
    await wait(900);
    setStep("policy", "completed");

    await wait(1500);
    setStep("argus", "active");
    for (let index = 0; index < ARGUS_LAYERS.length; index += 1) {
      if (sequenceRef.current !== thisSequence) return;
      setArgusLayerIndex(index);
      await wait(520);
    }
    await wait(420);
    setStep("argus", "completed");

    await wait(1000);
    setStep("calculation", "active");
    await wait(1000);
    setStep("calculation", "completed");

    await wait(2000);
    setStep("settlement", "active");
    await wait(1300);
    setStep("settlement", "completed");
  }

  async function handleFireSimulation() {
    if (running) return;
    setRunning(true);
    setApiMode("loading");
    setArgusLayerIndex(-1);
    setSteps(INITIAL_STEPS);
    setSettlementInfo(buildSettlementInfo());
    setSimulationStartedAt(
      new Date().toLocaleString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata",
      })
    );

    const payload = {
      peril: "aqi",
      source: "cpcb_waqi",
      reading_value: 380,
      city: "delhi",
      h3_hex: "872a1072bffffff",
      label: "AQI 380 detected in Delhi NCR — Dwarka Zone",
      trigger_level: 1,
      payout_pct: 0.3,
    };

    try {
      await simulateTriggerEvent(payload);
      setApiMode("live");
    } catch {
      setApiMode("fallback");
    }

    await runSimulationSequence();
    setRunning(false);
  }

  if (isLoading && !demoMode) return null;
  if (!isAuthenticated && !demoMode) return null;

  const apiLabel =
    apiMode === "loading"
      ? "Trigger API call in progress..."
      : apiMode === "live"
        ? "Live simulation trigger accepted"
        : apiMode === "fallback"
          ? "API unavailable - running with deterministic demo data"
          : "Ready";

  return (
    <WorkerShell activeTab="claims" pageTitle="Payout Simulator" maxWidth={920}>
      <section className="payout-sim-stack">
        <Card className="payout-sim-hero">
          <div className="payout-sim-head">
            <div>
              <h1 className="payout-sim-title">Zero-touch payout simulator</h1>
              <p className="payout-sim-subtitle">Run the full 5-step parametric journey for the demo video.</p>
            </div>
            <Button
              variant="primary"
              onClick={handleFireSimulation}
              disabled={running}
              className="payout-sim-fire-btn"
              aria-label="Fire simulation"
            >
              <span className="flex items-center gap-2">
                <Play size={16} />
                {running ? "Simulation Running..." : "Fire Simulation"}
              </span>
            </Button>
          </div>

          <div className="payout-sim-meta">
            <Badge tone={apiMode === "fallback" ? "warning" : apiMode === "live" ? "success" : "info"}>{apiLabel}</Badge>
            <Badge tone="accent">/simulate?demo=true</Badge>
            {simulationStartedAt ? <Badge tone="muted">Started at {simulationStartedAt}</Badge> : null}
          </div>

          <div className="payout-sim-progress-track" aria-label="Simulation progress">
            <div className="payout-sim-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </Card>

        <div className="payout-sim-timeline">
          {visibleSteps.map((stepId, index) => {
            const status = steps[stepId];
            const isLast = index === visibleSteps.length - 1;
            const lineTone = status === "completed" ? "is-success" : status === "active" ? "is-active" : "";
            const rowClass = `payout-sim-row ${status === "active" ? "is-active" : ""}`;

            return (
              <div key={stepId} className={rowClass}>
                <div className="payout-sim-rail">
                  <StepStatusPill status={status} />
                  {!isLast ? <span className={`payout-sim-rail-line ${lineTone}`} /> : null}
                </div>

                {stepId === "disruption" ? (
                  <Card className="payout-sim-step-card">
                    <div className="payout-sim-step-head">
                      <h3>Disruption Detected</h3>
                      <Badge tone={statusBadgeTone(status)}>{status.toUpperCase()}</Badge>
                    </div>
                    <p className="payout-sim-highlight">🌫️ AQI 380 detected in Delhi NCR — Dwarka Zone</p>
                    <p className="payout-sim-step-sub">SENTINELLE is monitoring your zone in real-time.</p>
                  </Card>
                ) : null}

                {stepId === "policy" ? (
                  <Card className="payout-sim-step-card">
                    <div className="payout-sim-step-head">
                      <h3>Policy Verified</h3>
                      <Badge tone={statusBadgeTone(status)}>{status.toUpperCase()}</Badge>
                    </div>
                    <div className="payout-sim-policy-grid">
                      <p>
                        <span>Worker</span>
                        <strong>{workerName}</strong>
                      </p>
                      <p>
                        <span>Policy Number</span>
                        <strong className="mono">{policyNumber}</strong>
                      </p>
                      <p>
                        <span>Plan</span>
                        <strong>{plan.toUpperCase()}</strong>
                      </p>
                    </div>
                    <p className="payout-sim-step-sub">Active policy found. 7-day warranty met. No duplicate claim.</p>
                  </Card>
                ) : null}

                {stepId === "argus" ? (
                  <Card className="payout-sim-step-card">
                    <div className="payout-sim-step-head">
                      <h3>ARGUS Fraud Check</h3>
                      <Badge tone={statusBadgeTone(status)}>{status.toUpperCase()}</Badge>
                    </div>

                    <div className="payout-sim-argus-track" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={Math.max(0, argusLayerIndex + 1)}>
                      <div
                        className="payout-sim-argus-fill"
                        style={{
                          width: `${status === "completed" ? 100 : Math.max(8, ((argusLayerIndex + 1) / ARGUS_LAYERS.length) * 100)}%`,
                        }}
                      />
                    </div>

                    <div className="payout-sim-argus-list">
                      {ARGUS_LAYERS.map((layer, layerIndex) => {
                        const layerState =
                          status === "completed" || layerIndex < argusLayerIndex
                            ? "done"
                            : layerIndex === argusLayerIndex
                              ? "active"
                              : "future";
                        return (
                          <p key={layer} className={`payout-sim-argus-item payout-sim-argus-item--${layerState}`}>
                            {layer}
                          </p>
                        );
                      })}
                    </div>

                    {status === "completed" ? (
                      <p className="payout-sim-approved">
                        <ShieldCheck size={16} /> Fraud Score: 0.18 — APPROVED
                      </p>
                    ) : (
                      <p className="payout-sim-step-sub">
                        {argusLayerIndex >= 0 ? `Scanning ${ARGUS_LAYERS[argusLayerIndex]}...` : "Initializing ARGUS pipeline..."}
                      </p>
                    )}
                  </Card>
                ) : null}

                {stepId === "calculation" ? (
                  <Card className="payout-sim-step-card">
                    <div className="payout-sim-step-head">
                      <h3>Payout Calculated</h3>
                      <Badge tone={statusBadgeTone(status)}>{status.toUpperCase()}</Badge>
                    </div>
                    {isPro ? (
                      <p className="payout-sim-formula mono">₹500 (Pro plan instant payout)</p>
                    ) : (
                      <p className="payout-sim-formula mono">₹1,000 × 1 day × 30% × 0.70 (Tier 1) = ₹210</p>
                    )}
                    <p className="payout-sim-step-sub">ATHENA formula + policy rules finalized your payout instantly.</p>
                  </Card>
                ) : null}

                {stepId === "settlement" ? (
                  <Card className={`payout-sim-step-card payout-sim-settlement ${status !== "pending" ? "is-visible" : ""}`}>
                    <div className="payout-sim-step-head">
                      <h3>₹ Sent to UPI</h3>
                      <Badge tone={statusBadgeTone(status)}>{status.toUpperCase()}</Badge>
                    </div>

                    <div className={`payout-sim-hero-transfer ${status === "active" ? "is-pulsing" : status === "completed" ? "is-complete" : ""}`}>
                      <Sparkles size={18} />
                      <strong className="mono">₹{payoutAmount} → {upiId}</strong>
                      <Zap size={18} />
                    </div>

                    <div className="payout-sim-settlement-grid">
                      <p>
                        <span>Razorpay Payout ID</span>
                        <strong className="mono">{settlementInfo.payoutId}</strong>
                      </p>
                      <p>
                        <span>UTR Number</span>
                        <strong className="mono">{settlementInfo.utr}</strong>
                      </p>
                      <p>
                        <span>Timestamp</span>
                        <strong>{settlementInfo.timestamp}</strong>
                      </p>
                    </div>
                    <p className="payout-sim-step-sub">Settlement via Razorpay UPI Test Mode.</p>

                    <div className="payout-sim-confetti" aria-hidden="true">
                      {Array.from({ length: 8 }).map((_, confettiIndex) => (
                        <span key={confettiIndex} style={{ animationDelay: `${confettiIndex * 120}ms` }} />
                      ))}
                    </div>
                  </Card>
                ) : null}
              </div>
            );
          })}
        </div>

        {!visibleSteps.length ? (
          <Card className="payout-sim-empty">
            <ShieldX size={18} />
            <p>No simulation has run yet. Tap <strong>Fire Simulation</strong> to start the full payout journey.</p>
          </Card>
        ) : null}

        <Card className="payout-sim-footnote">
          <p>
            Demo focus: disruption detected → policy verified → ARGUS fraud check → payout calculated → settlement completed.
          </p>
          <p className="mono">Demo mode fallback remains deterministic for reliable 5-minute evaluation runs.</p>
        </Card>
      </section>
    </WorkerShell>
  );
}
