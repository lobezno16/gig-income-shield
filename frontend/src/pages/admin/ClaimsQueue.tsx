import { Fragment, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";

import { getAdminClaims, overrideAdminClaim, type AdminClaimStatus } from "../../api/client";
import { Badge } from "../../design-system/components/Badge";
import { Button } from "../../design-system/components/Button";
import { Card } from "../../design-system/components/Card";
import { ConfirmDialog } from "../../design-system/components/ConfirmDialog";
import { LastUpdatedIndicator } from "../../design-system/components/LastUpdatedIndicator";
import { useSSE } from "../../hooks/useSSE";
import { formatINR } from "../../utils/formatters";
import { AdminLayout } from "./AdminLayout";

type ClaimQueueStatus = "all" | "paid" | "processing" | "flagged" | "blocked";

interface ClaimQueueRow {
  id: string;
  claim_number: string;
  worker_name: string;
  payout_amount: number;
  fraud_score: number;
  status: string;
  peril: string;
  city: string | null;
  created_at: string;
  argus_layers: {
    layer0?: { passed?: boolean };
    layer1?: { trust_score?: number };
    layer2?: { isolation_score?: number };
    layer3?: { ring_flag?: number; z_score_normalized?: number };
  };
}

interface ClaimsQueueResponse {
  items: ClaimQueueRow[];
  counts: Record<string, number>;
}

type LayerState = "pass" | "warning" | "fail";

interface PendingAction {
  claimId: string;
  claimNumber: string;
  releasePct: number;
}

function layerStatus(
  layer: "layer0" | "layer1" | "layer2" | "layer3",
  argusLayers: ClaimQueueRow["argus_layers"]
): LayerState {
  if (layer === "layer0") {
    return argusLayers.layer0?.passed ? "pass" : "fail";
  }
  if (layer === "layer1") {
    const score = argusLayers.layer1?.trust_score ?? 0;
    if (score >= 0.7) return "pass";
    if (score >= 0.5) return "warning";
    return "fail";
  }
  if (layer === "layer2") {
    const score = argusLayers.layer2?.isolation_score ?? 1;
    if (score < 0.5) return "pass";
    if (score < 0.75) return "warning";
    return "fail";
  }
  const ringFlag = argusLayers.layer3?.ring_flag ?? 0;
  const zScore = argusLayers.layer3?.z_score_normalized ?? 0;
  if (ringFlag === 0 && zScore < 0.5) return "pass";
  if (ringFlag === 0 && zScore < 0.75) return "warning";
  return "fail";
}

function layerIcon(state: LayerState) {
  if (state === "pass") return <CheckCircle2 size={16} color="var(--success)" aria-hidden="true" />;
  if (state === "warning") return <AlertTriangle size={16} color="var(--warning)" aria-hidden="true" />;
  return <XCircle size={16} color="var(--danger)" aria-hidden="true" />;
}

function scoreColor(score: number): string {
  if (score < 0.5) return "var(--success)";
  if (score < 0.8) return "var(--warning)";
  return "var(--danger)";
}

function claimStatusTone(status: string): "success" | "info" | "warning" | "danger" | "muted" {
  if (status === "paid" || status === "approved") return "success";
  if (status === "processing") return "info";
  if (status === "flagged") return "warning";
  if (status === "blocked") return "danger";
  return "muted";
}

export function ClaimsQueuePage() {
  const queryClient = useQueryClient();
  const { events, connected } = useSSE("/api/sse/claims");
  const [activeTab, setActiveTab] = useState<ClaimQueueStatus>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [flashRows, setFlashRows] = useState<Record<string, boolean>>({});
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const lastEventRef = useRef<string>("");

  const claimsQuery = useQuery({
    queryKey: ["admin-claims", activeTab],
    queryFn: () => getAdminClaims(activeTab as AdminClaimStatus),
    refetchInterval: 10_000,
  });

  const overrideMutation = useMutation({
    mutationFn: (payload: PendingAction) =>
      overrideAdminClaim(
        payload.claimId,
        payload.releasePct,
        payload.releasePct <= 0 ? "Blocked by admin from claims queue" : "Approved by admin from claims queue"
      ),
    onSuccess: () => {
      setPendingAction(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-claims"] });
      void queryClient.invalidateQueries({ queryKey: ["fraud-alerts"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
  });

  useEffect(() => {
    const latest = events[0];
    if (!latest) {
      return;
    }
    const signature = `${latest.type}:${latest.timestamp}:${String(latest.data.claim_number ?? latest.data.id ?? "")}`;
    if (signature === lastEventRef.current) {
      return;
    }
    lastEventRef.current = signature;

    if (latest.type === "new_claim") {
      const claimNumber = String(latest.data.claim_number ?? "");
      if (claimNumber) {
        setFlashRows((prev) => ({ ...prev, [claimNumber]: true }));
        window.setTimeout(() => {
          setFlashRows((prev) => {
            const next = { ...prev };
            delete next[claimNumber];
            return next;
          });
        }, 1000);
      }
    }

    if (latest.type === "new_claim" || latest.type === "claim_update") {
      void queryClient.invalidateQueries({ queryKey: ["admin-claims"] });
    }
  }, [events, queryClient]);

  const payload = (claimsQuery.data?.data ?? null) as ClaimsQueueResponse | null;
  const rows = payload?.items ?? [];
  const counts = payload?.counts ?? {};
  const tabs: Array<{ key: ClaimQueueStatus; label: string }> = [
    { key: "all", label: "ALL" },
    { key: "paid", label: "PAID" },
    { key: "processing", label: "PROCESSING" },
    { key: "flagged", label: "FLAGGED" },
    { key: "blocked", label: "BLOCKED" },
  ];

  const latestUpdatedAt = claimsQuery.dataUpdatedAt || 0;
  return (
    <AdminLayout>
      <Card>
        <div className="admin-page-head">
          <h1 className="admin-page-head__title">Claims Queue</h1>
          <div className="admin-page-head__meta">
            <LastUpdatedIndicator updatedAt={latestUpdatedAt} />
            <Badge tone={connected ? "success" : "warning"}>{connected ? "SSE LIVE" : "SSE RETRY"}</Badge>
          </div>
        </div>

        <div className="admin-filter-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`admin-filter-tab ${activeTab === tab.key ? "is-active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span>{tab.label}</span>
              <Badge tone={activeTab === tab.key ? "accent" : "muted"}>{counts[tab.key] ?? 0}</Badge>
            </button>
          ))}
        </div>

        {claimsQuery.isLoading ? <p className="admin-muted-text">Loading claims queue...</p> : null}
        {claimsQuery.isError ? (
          <p role="alert" className="admin-error-text">
            Claims queue unavailable right now.
          </p>
        ) : null}
        {!claimsQuery.isLoading && !claimsQuery.isError && rows.length === 0 ? (
          <div className="surface admin-empty-state">
            <p>No data yet.</p>
          </div>
        ) : null}

        {rows.length > 0 ? (
          <table className="table mono admin-claims-table">
            <thead>
              <tr>
                <th>Claim #</th>
                <th>Worker</th>
                <th>Peril</th>
                <th>Amount</th>
                <th>ARGUS</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className={flashRows[row.claim_number] ? "admin-claim-row--flash" : ""}>
                    <td>{row.claim_number}</td>
                    <td>{row.worker_name}</td>
                    <td>{row.peril.toUpperCase()}</td>
                    <td>{formatINR(row.payout_amount)}</td>
                    <td>
                      <div className="admin-argus-cell">
                        <div className="admin-argus-track">
                          <div
                            className="admin-argus-fill"
                            style={{
                              width: `${Math.max(0, Math.min(1, row.fraud_score)) * 100}%`,
                              background: scoreColor(row.fraud_score),
                            }}
                          />
                        </div>
                        <span>{row.fraud_score.toFixed(2)}</span>
                      </div>
                    </td>
                    <td>
                      <Badge tone={claimStatusTone(row.status)}>{row.status}</Badge>
                    </td>
                    <td>
                      <div className="admin-claims-actions">
                        <Button variant="ghost" onClick={() => setExpanded((prev) => (prev === row.id ? null : row.id))}>
                          {expanded === row.id ? "Hide" : "Details"}
                        </Button>
                        {row.status === "flagged" ? (
                          <>
                            <Button
                              variant="secondary"
                              onClick={() =>
                                setPendingAction({ claimId: row.id, claimNumber: row.claim_number, releasePct: 1.0 })
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() =>
                                setPendingAction({ claimId: row.id, claimNumber: row.claim_number, releasePct: 0.0 })
                              }
                            >
                              Block
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {expanded === row.id ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="admin-argus-layers">
                          {[
                            { key: "layer0", label: "Layer 0: Rules Check" },
                            { key: "layer1", label: "Layer 1: Trust" },
                            { key: "layer2", label: "Layer 2: Isolation" },
                            { key: "layer3", label: "Layer 3: Cluster" },
                          ].map((layer) => {
                            const state = layerStatus(layer.key as "layer0" | "layer1" | "layer2" | "layer3", row.argus_layers);
                            return (
                              <div key={layer.key} className="admin-argus-layer-item">
                                {layerIcon(state)}
                                <span>{layer.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        ) : null}
      </Card>

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction?.releasePct === 0 ? "Block flagged claim?" : "Approve flagged claim?"}
        message={
          pendingAction?.releasePct === 0
            ? `This will block payout for claim ${pendingAction?.claimNumber}.`
            : `This will release full payout for claim ${pendingAction?.claimNumber}.`
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
