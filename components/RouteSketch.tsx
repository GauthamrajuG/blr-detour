"use client";

import type { LngLat, Place, RankedRoute } from "@/lib/engine/types";
import { ZONES } from "@/lib/geo/zones";

interface Props {
  ranked: RankedRoute[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  origin: Place | null;
  destination: Place | null;
  padding: { top: number; bottom: number; left: number; right: number };
}

/**
 * A lightweight SVG drawing of the routes. Shows instantly while the map library
 * loads, and stays as the map on devices without WebGL. Decorative for assistive tech:
 * the route list carries the same information.
 */
export function RouteSketch({ ranked, selectedId, onSelect, origin, destination, padding }: Props) {
  if (ranked.length === 0) return null;
  const pts = ranked.flatMap((r) => r.candidate.route.path);
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p[0] * k);
  const ys = pts.map((p) => -p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 0.01;
  const pad = span * 0.12;
  const vb = [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2];
  const proj = (p: LngLat) => `${(p[0] * k).toFixed(5)},${(-p[1]).toFixed(5)}`;
  const d = (path: LngLat[]) => `M${path.map(proj).join("L")}`;
  const sw = span / 120;
  const inView = (c?: number[]) =>
    c && c[0] * k > vb[0] && c[0] * k < vb[0] + vb[2] && -c[1] > vb[1] && -c[1] < vb[1] + vb[3];

  const touched = new Set(ranked.flatMap((r) => r.candidate.context.chokepoints.map((z) => z.id)));
  const selected = ranked.find((r) => r.candidate.route.id === selectedId);
  const others = ranked.filter((r) => r !== selected);

  return (
    <svg
      className="absolute"
      style={{
        top: padding.top + 12,
        bottom: padding.bottom + 12,
        left: padding.left + 12,
        right: padding.right + 12,
        width: `calc(100% - ${padding.left + padding.right + 24}px)`,
        height: `calc(100% - ${padding.top + padding.bottom + 24}px)`,
      }}
      viewBox={vb.join(" ")}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      data-testid="route-sketch"
    >
      {ZONES.filter((z) => inView(z.center) && touched.has(z.id)).map((z) => (
        <circle
          key={z.id}
          cx={z.center![0] * k}
          cy={-z.center![1]}
          r={sw * 2.2}
          fill="var(--kerb)"
          stroke="var(--ink)"
          strokeWidth={sw * 0.8}
        />
      ))}
      {others.map((r) => (
        <path
          key={r.candidate.route.id}
          d={d(r.candidate.route.path)}
          fill="none"
          stroke="var(--route-muted)"
          strokeWidth={sw * 1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ cursor: "pointer" }}
          onClick={() => onSelect(r.candidate.route.id)}
        />
      ))}
      {selected && (
        <g onClick={() => onSelect(selected.candidate.route.id)}>
          <path
            d={d(selected.candidate.route.path)}
            fill="none"
            stroke="var(--paper-raised)"
            strokeWidth={sw * 3.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={d(selected.candidate.route.path)}
            fill="none"
            stroke="var(--signboard)"
            strokeWidth={sw * 2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
      {origin && (
        <circle
          cx={origin.lng * k}
          cy={-origin.lat}
          r={sw * 2.6}
          fill="var(--ink)"
          stroke="var(--paper-raised)"
          strokeWidth={sw}
        />
      )}
      {destination && (
        <circle
          cx={destination.lng * k}
          cy={-destination.lat}
          r={sw * 2.6}
          fill="var(--signboard)"
          stroke="var(--paper-raised)"
          strokeWidth={sw}
        />
      )}
    </svg>
  );
}
