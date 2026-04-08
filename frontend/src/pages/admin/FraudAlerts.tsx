import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getFraudAlerts, overrideAdminClaim } from "../../api/client";
import { Badge } from "../../design-system/components/Badge";
import { Button } from "../../design-system/components/Button";
import { Card } from "../../design-system/components/Card";
import { ConfirmDialog } from "../../design-system/components/ConfirmDialog";
import { LastUpdatedIndicator } from "../../design-system/components/LastUpdatedIndicator";
import { AdminLayout } from "./AdminLayout";

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
  claimNumber: string;
  claimId: string;
  releasePct: number;
}

function scoreTone(score: number): "warning" | "danger" {
  return score >= 0.8 ? "danger" : "warning";
}

export function FraudAlertsPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<FraudAlert | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const query = useQuery({
    queryKey: ["fraud-alerts"],
    queryFn: getFraudAlerts,
    refetchInterval: 20_000,
  });

  const overrideMutation = useMutation({
    mutationFn: (payload: PendingAction) =>
      overrideAdminClaim(
        payload.claimNumber,
        payload.releasePct,
        payload.releasePct <= 0 ? "Blocked by admin from fraud alerts" : "Released 80% by admin from fraud alerts"
      ),
    onSuccess: () => {
      setPendingAction(null);
      void queryClient.invalidateQueries({ queryKey: ["fraud-alerts"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-claims"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
  });

  const alerts = (query.data?.data?.alerts ?? []) as FraudAlert[];

  return (
    <AdminLayout>
      <Card>
        <div className="admin-page-head">
          <h1 className="admin-page-head__title">Fraud Alerts</h1>
          <LastUpdatedIndicator updatedAt={query.dataUpdatedAt} />
        </div>
        {query.isLoading ? <p className="admin-muted-text">Loading alerts...</p> : null}
        {query.isError ? (
          <p role="alert" className="admin-error-text">
            Live fraud alerts unavailable.
          </p>
        ) : null}
        {!query.isLoading && !query.isError && alerts.length === 0 ? (
          <div className="surface admin-empty-state">
            <p>No data yet.</p>
          </div>
        ) : null}
        <div className="admin-fraud-grid">
          {alerts.map((alert) => (
            <div key={alert.claim_id} className="admin-fraud-item">
              <div className="admin-fraud-item__head">
                <p className="mono" style={{ margin: 0 }}>
                  {alert.claim_number}
                </p>
                <Badge tone={scoreTone(alert.fraud_score)}>Score {Number(alert.fraud_score).toFixed(2)}</Badge>
              </div>
              <p className="admin-fraud-item__meta">
                Trigger: {alert.trigger.toUpperCase()} | Cluster size: {alert.cluster_size} | Window: {alert.temporal_window}
              </p>
              <div className="admin-fraud-item__flags">
                {(alert.flags ?? []).map((flag) => (
                  <Badge key={flag} tone="warning">
                    {flag}
                  </Badge>
                ))}
                {(alert.hexes ?? []).map((hex) => (
                  <Badge key={hex} tone="muted">
                    {hex}
                  </Badge>
                ))}
              </div>
              <div className="admin-fraud-item__actions">
                <Button variant="secondary" onClick={() => setSelected(alert)}>
                  View Details
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setPendingAction({
                      claimId: alert.claim_id,
                      claimNumber: alert.claim_number,
                      releasePct: 0.8,
                    })
                  }
                >
                  Release 80%
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
                  Block Claim
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {selected ? (
        <div className="admin-detail-modal">
          <Card className="admin-detail-modal__sheet">
            <h2 style={{ marginTop: 0 }}>Alert Cluster</h2>
            <p className="mono" style={{ margin: 0 }}>
              {selected.claim_number}
            </p>
            <p className="admin-muted-text" style={{ marginTop: 8 }}>
              Review this claim before manual release or block action.
            </p>
            <p className="admin-muted-text" style={{ marginTop: 4 }}>
              Trigger: {selected.trigger.toUpperCase()} | Cluster size: {selected.cluster_size}
            </p>
            <div className="admin-fraud-item__flags" style={{ marginTop: 8 }}>
              {selected.flags.map((flag) => (
                <Badge key={flag} tone="warning">
                  {flag}
                </Badge>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction?.releasePct === 0 ? "Block claim payout?" : "Release 80% payout?"}
        message={
          pendingAction?.releasePct === 0
            ? `This will block payout for ${pendingAction?.claimNumber}.`
            : `This will release 80% payout for ${pendingAction?.claimNumber}.`
        }
        confirmLabel={pendingAction?.releasePct === 0 ? "Block Claim" : "Release 80%"}
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
