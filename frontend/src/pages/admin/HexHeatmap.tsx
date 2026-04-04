import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Polygon, Popup } from "react-leaflet";
import * as h3 from "h3-js";
import "leaflet/dist/leaflet.css";

import { AdminLayout } from "./AdminLayout";
import { Card } from "../../design-system/components/Card";
import { getHeatmap } from "../../api/client";
import { H3_ZONES } from "../../utils/mockData";

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

export function HexHeatmapPage() {
  const [peril, setPeril] = useState("aqi");
  const query = useQuery({
    queryKey: ["heatmap"],
    queryFn: getHeatmap,
    refetchInterval: 30_000,
  });

  const fallback: HeatHex[] = Object.entries(H3_ZONES).map(([h3_hex, zone], idx) => ({
    h3_hex,
    peril: ["aqi", "rain", "heat", "flood", "storm"][idx % 5],
    city: zone.city,
    pool_id: zone.pool,
    trigger_prob: 0.07 + (idx % 4) * 0.05,
    active_workers: 120 + idx * 9,
    recent_claims: 8 + idx,
    urban_tier: zone.urban_tier,
  }));
  const hexes: HeatHex[] = query.data?.data?.hexes ?? fallback;
  const filtered = useMemo(() => hexes.filter((h) => h.peril === peril || !h.peril), [hexes, peril]);

  return (
    <AdminLayout>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>H3 Heatmap</h1>
          <select className="input mono" value={peril} onChange={(e) => setPeril(e.target.value)} style={{ width: 180 }}>
            {["aqi", "rain", "heat", "flood", "storm", "curfew", "store"].map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div style={{ height: 520, marginTop: 12 }}>
          <MapContainer center={[22.9734, 78.6569]} zoom={5} style={{ height: "100%", borderRadius: 4, border: "1px solid var(--bg-border)" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {filtered.map((hex) => {
              const boundary = h3.cellToBoundary(hex.h3_hex, true).map((point) => [point[0], point[1]]) as [number, number][];
              return (
                <Polygon key={`${hex.h3_hex}-${hex.peril}`} positions={boundary} pathOptions={{ color: riskColor(hex.trigger_prob), fillOpacity: 0.25, weight: 1 }}>
                  <Popup>
                    <p className="mono" style={{ margin: 0 }}>
                      {hex.h3_hex}
                    </p>
                    <p style={{ margin: "4px 0" }}>
                      {hex.city} · {hex.pool_id}
                    </p>
                    <p style={{ margin: "4px 0" }}>Trigger Prob: {hex.trigger_prob.toFixed(3)}</p>
                    <p style={{ margin: "4px 0" }}>BCR Risk Band: {hex.trigger_prob > 0.2 ? "High" : hex.trigger_prob > 0.1 ? "Medium" : "Low"}</p>
                    <p style={{ margin: "4px 0" }}>Workers: {hex.active_workers}</p>
                    <p style={{ margin: "4px 0" }}>Claims: {hex.recent_claims}</p>
                  </Popup>
                </Polygon>
              );
            })}
          </MapContainer>
        </div>
      </Card>
    </AdminLayout>
  );
}

