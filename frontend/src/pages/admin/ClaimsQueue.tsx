import { Fragment, useMemo, useState } from "react";

import { AdminLayout } from "./AdminLayout";
import { Card } from "../../design-system/components/Card";
import { Badge } from "../../design-system/components/Badge";
import { Button } from "../../design-system/components/Button";
import { useSSE } from "../../hooks/useSSE";
import { formatINR } from "../../utils/formatters";

const fallbackRows = [
  { claim_number: "CLM-2026-00041823", worker: "Ravi Kumar", amount: 500, argus_score: 0.28, status: "paid", layers: { layer0: "pass", layer1: "pass", layer2: "pass", layer3: "pass" } },
  { claim_number: "CLM-2026-00045102", worker: "Priya Sharma", amount: 420, argus_score: 0.58, status: "flagged", layers: { layer0: "pass", layer1: "pass", layer2: "warn", layer3: "warn" } },
  { claim_number: "CLM-2026-00049011", worker: "Arjun Nair", amount: 360, argus_score: 0.83, status: "blocked", layers: { layer0: "pass", layer1: "warn", layer2: "warn", layer3: "fail" } },
];

export function ClaimsQueuePage() {
  const { events, connected } = useSSE("/api/sse/claims");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const live = events
      .filter((e) => e.type === "new_claim" || e.type === "claim_update")
      .map((e) => ({
        claim_number: String(e.data.claim_number ?? "CLM-LIVE"),
        worker: String(e.data.worker_name ?? "Live Worker"),
        amount: Number(e.data.amount ?? 0),
        argus_score: Number(e.data.argus_score ?? 0.45),
        status: String(e.data.status ?? "processing"),
        layers: { layer0: "pass", layer1: "pass", layer2: "pass", layer3: "pass" },
      }));
    return live.length > 0 ? live : fallbackRows;
  }, [events]);

  return (
    <AdminLayout>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ marginTop: 0, marginBottom: 0 }}>Live Claims Queue</h1>
          <Badge tone={connected ? "success" : "warning"}>{connected ? "SSE LIVE" : "SSE RETRY"}</Badge>
        </div>
        <table className="table mono" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Claim #</th>
              <th>Worker</th>
              <th>Amount</th>
              <th>ARGUS Score</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.claim_number}>
                <tr key={row.claim_number}>
                  <td>{row.claim_number}</td>
                  <td>{row.worker}</td>
                  <td>{formatINR(row.amount)}</td>
                  <td>
                    <Badge tone={row.argus_score < 0.5 ? "success" : row.argus_score < 0.8 ? "warning" : "danger"}>{row.argus_score.toFixed(2)}</Badge>
                  </td>
                  <td>
                    <Badge tone={row.status === "paid" ? "success" : row.status === "processing" ? "info" : row.status === "flagged" ? "warning" : "danger"}>
                      {row.status}
                    </Badge>
                  </td>
                  <td>
                    <Button variant="ghost" onClick={() => setExpanded((v) => (v === row.claim_number ? null : row.claim_number))}>
                      {expanded === row.claim_number ? "Hide" : "Expand"}
                    </Button>
                  </td>
                </tr>
                {expanded === row.claim_number ? (
                  <tr key={`${row.claim_number}-detail`}>
                    <td colSpan={6}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {Object.entries(row.layers).map(([layer, state]) => (
                          <Badge key={layer} tone={state === "pass" ? "success" : state === "warn" ? "warning" : "danger"}>
                            {layer}: {state}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
    </AdminLayout>
  );
}
