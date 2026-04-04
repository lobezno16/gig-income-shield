import { Link, useSearchParams } from "react-router-dom";

import { Card } from "../../design-system/components/Card";
import { Badge } from "../../design-system/components/Badge";
import { useWorkerStore } from "../../store/workerStore";
import { formatHex, formatINR, formatPhone } from "../../utils/formatters";

const exclusions = [
  "War, invasion, act of foreign enemy, hostilities, civil war, rebellion",
  "Nuclear reaction, radiation, or radioactive contamination",
  "Terrorism as defined under IRDAI Terrorism Pool guidelines",
  "Pandemic or epidemic declared by WHO or Government of India",
  "Government-ordered sanctions, embargoes, or prohibitions",
  "Intentional self-inflicted loss or criminal activity by the insured",
  "Loss arising outside the territory of India",
  "Pre-existing non-working status prior to policy activation (7-day warranty period)",
  "Vehicle repairs, mechanical breakdown — vehicle insurance is out of scope",
  "Health conditions, injuries, medical expenses — health insurance is out of scope",
  "Loss of life or bodily injury — life/accident insurance is out of scope",
];

export function WorkerPolicyPage() {
  const [searchParams] = useSearchParams();
  const demoMode = searchParams.get("demo") === "true";
  const { currentWorker } = useWorkerStore();

  return (
    <main className="layout" style={{ maxWidth: 760 }}>
      <Card>
        <h1 style={{ marginTop: 0 }}>Policy Management</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Badge tone="success">ACTIVE</Badge>
          <span className="mono">SOT-2026-001847</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
          <div className="surface" style={{ padding: 12 }}>
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>Worker</p>
            <p style={{ margin: "6px 0 0 0" }}>{currentWorker.name}</p>
            <p className="mono" style={{ margin: "6px 0 0 0" }}>
              {formatPhone(currentWorker.phone)}
            </p>
          </div>
          <div className="surface" style={{ padding: 12 }}>
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>Coverage Zone</p>
            <p className="mono" style={{ margin: "6px 0 0 0" }}>
              {formatHex(currentWorker.h3_hex)}
            </p>
            <p style={{ margin: "6px 0 0 0" }}>Pool: DELHI AQI POOL</p>
          </div>
          <div className="surface" style={{ padding: 12 }}>
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>Weekly Premium</p>
            <p style={{ margin: "6px 0 0 0", fontWeight: 800 }}>{formatINR(currentWorker.weekly_premium)}</p>
          </div>
          <div className="surface" style={{ padding: 12 }}>
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>Max Payout / Week</p>
            <p style={{ margin: "6px 0 0 0", fontWeight: 800 }}>{formatINR(currentWorker.max_payout_week)}</p>
          </div>
        </div>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>IRDAI Compliance</h2>
        <p className="mono" style={{ marginTop: 0 }}>
          Sandbox ID: SB-2026-042 · Exclusions v2.1
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {exclusions.map((ex) => (
            <li key={ex} style={{ marginBottom: 6, color: "var(--text-secondary)" }}>
              {ex}
            </li>
          ))}
        </ul>
      </Card>

      <div style={{ marginTop: 12 }}>
        <Link to={`/dashboard${demoMode ? "?demo=true" : ""}`} className="surface touch-target" style={{ display: "grid", placeItems: "center" }}>
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}

