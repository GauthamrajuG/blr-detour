import type { LngLat } from "@/lib/engine/types";

const R_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

export function pathLengthKm(path: LngLat[]): number {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += haversineKm(path[i - 1], path[i]);
  return d;
}

/** Local flat projection in metres, good enough inside one city. */
function toXY(p: LngLat, lat0: number): [number, number] {
  return [toRad(p[0]) * R_KM * 1000 * Math.cos(toRad(lat0)), toRad(p[1]) * R_KM * 1000];
}

export function pointToSegmentM(p: LngLat, a: LngLat, b: LngLat): number {
  const lat0 = p[1];
  const [px, py] = toXY(p, lat0);
  const [ax, ay] = toXY(a, lat0);
  const [bx, by] = toXY(b, lat0);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function pointToLineM(p: LngLat, line: LngLat[]): number {
  if (line.length === 1) return haversineKm(p, line[0]) * 1000;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, pointToSegmentM(p, line[i - 1], line[i]));
  return best;
}

/**
 * Where a geometry (point or line, with a radius) first touches a path.
 * Returns the fraction along the path (0-1), or null if it never comes within radius.
 */
export function firstTouch(path: LngLat[], geometry: LngLat[], radiusM: number): number | null {
  const total = pathLengthKm(path);
  let run = 0;
  for (let i = 0; i < path.length; i++) {
    if (i > 0) run += haversineKm(path[i - 1], path[i]);
    if (pointToLineM(path[i], geometry) <= radiusM) return total > 0 ? run / total : 0;
  }
  return null;
}

/** Centripetal-ish Catmull-Rom through control points, sampled evenly per leg. */
export function smoothPath(points: LngLat[], samplesPerLeg = 16): LngLat[] {
  if (points.length < 3) {
    const [a, b] = points;
    return Array.from({ length: samplesPerLeg + 1 }, (_, i) => {
      const t = i / samplesPerLeg;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as LngLat;
    });
  }
  const pts = [points[0], ...points, points[points.length - 1]];
  const out: LngLat[] = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    for (let s = 0; s < samplesPerLeg; s++) {
      const t = s / samplesPerLeg;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (k: 0 | 1) =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

export function roundCoord(n: number, decimals: number): number {
  const m = 10 ** decimals;
  return Math.round(n * m) / m;
}

/** Bengaluru metro region, generous. Used to reject far-away inputs. */
export const BLR_BOUNDS = { minLng: 77.3, maxLng: 77.95, minLat: 12.7, maxLat: 13.3 };

export function inBengaluru(lat: number, lng: number): boolean {
  const b = BLR_BOUNDS;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}
