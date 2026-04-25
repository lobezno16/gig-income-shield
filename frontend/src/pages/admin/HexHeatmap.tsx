import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, Polygon, Popup, TileLayer } from "react-leaflet";
import * as h3 from "h3-js";
import "leaflet/dist/leaflet.css";

import { getHeatmap } from "../../api/client";
import { Card } from "../../design-system/components/Card";
import { LastUpdatedIndicator } from "../../design-system/components/LastUpdatedIndicator";
import { H3_ZONES } from "../../utils/mockData";
import { AdminLayout } from "./AdminLayout";

type HeatHex = {
  h3_hex: string;
  peril: string;
  city: string;
  pool_id: string;
  trigger_prob: number;
  active_workers: number;
  recent_claims: number;
  urban_tier: number;
};

function riskColor(prob: number): string {
  if (prob < 0.1) return "var(--success)";
  if (prob < 0.2) return "var(--warning)";
  return "var(--danger)";
}

function perilLabel(peril: string): string {
  return peril.replaceAll("_", " ").toUpperCase();
}

export function HexHeatmapPage() {
  const [peril, setPeril] = useState("aqi");
  const query = useQuery({
    queryKey: ["heatmap"],
    queryFn: getHeatmap,
    refetchInterval: 30_000,
  });
  const hexes: HeatHex[] = query.data?.data?.hexes ?? [];
  const filtered = useMemo(() => hexes.filter((hex) => hex.peril === peril || !hex.peril), [hexes, peril]);

  const summary = useMemo(() => {
    if (filtered.length === 0) {
      return null;
    }
    const highest = filtered.reduce((prev, current) => (current.trigger_prob > prev.trigger_prob ? current : prev), filtered[0]);
    const zoneMeta = H3_ZONES[highest.h3_hex as keyof typeof H3_ZONES];
    const zoneName = zoneMeta ? `${highest.city} - ${zoneMeta.area_display}` : highest.h3_hex;
    return {
      zoneCount: filtered.length,
      highestRiskName: zoneName,
      highestRiskProb: highest.trigger_prob,
      peril: highest.peril,
    };
  }, [filtered]);

  return (
    <AdminLayout>
      <Card>
        <div className="admin-page-head">
          <h1 className="admin-page-head__title">H3 Heatmap</h1>
          <div className="admin-page-head__meta">
            <select className="input mono" value={peril} onChange={(event) => setPeril(event.target.value)} style={{ width: 180 }} aria-label="Select Peril">
              {["aqi", "rain", "curfew"].map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase()}
                </option>
              ))}
            </select>
            <LastUpdatedIndicator updatedAt={query.dataUpdatedAt} />
          </div>
        </div>

        {summary ? (
          <div className="admin-heatmap-summary">
            <p>
              Showing <strong>{summary.zoneCount}</strong> zones
            </p>
            <p>
              Highest risk: <strong>{summary.highestRiskName}</strong> ({(summary.highestRiskProb * 100).toFixed(1)}%)
            </p>
            <p>
              Peril: <strong>{perilLabel(summary.peril)}</strong>
            </p>
          </div>
        ) : null}

        {query.isLoading ? <p className="admin-muted-text">Loading heatmap...</p> : null}
        {query.isError ? (
          <p role="alert" className="admin-error-text">
            Live heatmap unavailable.
          </p>
        ) : null}
        {!query.isLoading && !query.isError && filtered.length === 0 ? (
          <div className="surface admin-empty-state">
            <p>No data yet.</p>
          </div>
        ) : null}

        <div style={{ height: 520, marginTop: 12 }}>
          <MapContainer
            center={[22.9734, 78.6569]}
            zoom={5}
            style={{ height: "100%", borderRadius: 8, border: "1px solid var(--bg-border)" }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="&copy; OpenStreetMap contributors &copy; CARTO"
            />
            {filtered.map((hex) => {
              const boundary = h3.cellToBoundary(hex.h3_hex, true).map((point) => [point[0], point[1]]) as [number, number][];
              const zoneMeta = H3_ZONES[hex.h3_hex as keyof typeof H3_ZONES];
              const displayZone = zoneMeta ? zoneMeta.area_display : hex.h3_hex;
              return (
                <Polygon
                  key={`${hex.h3_hex}-${hex.peril}`}
                  positions={boundary}
                  pathOptions={{
                    color: riskColor(hex.trigger_prob),
                    fillOpacity: 0.25,
                    weight: 1,
                  }}
                >
                  <Popup>
                    <p className="mono" style={{ margin: 0 }}>
                      {hex.h3_hex}
                    </p>
                    <p style={{ margin: "4px 0" }}>
                      {hex.city} - {displayZone}
                    </p>
                    <p style={{ margin: "4px 0" }}>Trigger Prob: {(hex.trigger_prob * 100).toFixed(1)}%</p>
                    <p style={{ margin: "4px 0" }}>Workers: {hex.active_workers}</p>
                    <p style={{ margin: "4px 0" }}>Claims (24h): {hex.recent_claims}</p>
                  </Popup>
                </Polygon>
              );
            })}
          </MapContainer>
        </div>

        <div className="admin-heatmap-legend">
          <span>
            <i style={{ background: "var(--success)" }} /> Low risk (&lt;10%)
          </span>
          <span>
            <i style={{ background: "var(--warning)" }} /> Medium risk (10-20%)
          </span>
          <span>
            <i style={{ background: "var(--danger)" }} /> High risk (&gt;20%)
          </span>
        </div>
      </Card>
    </AdminLayout>
  );
}
