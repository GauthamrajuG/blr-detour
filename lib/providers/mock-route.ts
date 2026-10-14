import places from "@/data/bengaluru/places.json";
import type { LngLat, Place, RoadClass, Route, RouteFeatures, Step } from "@/lib/engine/types";
import { haversineKm, pathLengthKm, pointToSegmentM, smoothPath } from "@/lib/geo/geo";
import { ZONES } from "@/lib/geo/zones";
import { firstTouch } from "@/lib/geo/geo";
import { jitter } from "./hash";
import type { RouteProvider } from "./types";

/** Roads are longer than the straight line. Typical urban circuity factor. */
const CIRCUITY = 1.22;
const MAX_DETOUR_RATIO = 1.5;
const MAX_ROUTES = 4;

interface Via {
  id: string;
  road: string;
  road_class: RoadClass;
  lat: number;
  lng: number;
}

const VIAS = places.vias as Via[];

/** Events per km by road class. Seed values; the stress score normalises them. */
const DENSITY: Record<RoadClass, RouteFeatures> = {
  highway: { signals: 0.3, junctions: 0.5, uTurns: 0.05, merges: 0.6, stopProneSegments: 0.2 },
  orr: { signals: 0.9, junctions: 1.0, uTurns: 0.25, merges: 0.5, stopProneSegments: 0.6 },
  arterial: { signals: 1.6, junctions: 1.4, uTurns: 0.3, merges: 0.3, stopProneSegments: 0.7 },
  residential: { signals: 1.0, junctions: 2.0, uTurns: 0.15, merges: 0.1, stopProneSegments: 0.4 },
};

/**
 * Deterministic fake routing for demo mode and tests.
 * Alternatives are sketched through named Bengaluru roads ("via" points), so they read
 * plausibly, but the lines are smoothed curves, not real road geometry.
 */
export class MockRouteProvider implements RouteProvider {
  readonly name = "mock";

  async getAlternatives(origin: Place, destination: Place, _departureTime: Date): Promise<Route[]> {
    const o: LngLat = [origin.lng, origin.lat];
    const d: LngLat = [destination.lng, destination.lat];
    const direct = haversineKm(o, d);
    if (direct < 0.3) return [];

    const picked: { via: Via | null; synthetic?: "left" | "right" }[] = [{ via: null }];
    const minSep = Math.max(1.2, 0.2 * direct);
    const minOffLine = Math.max(700, 0.08 * direct * 1000);

    const options = VIAS.map((v) => {
      const p: LngLat = [v.lng, v.lat];
      const a = haversineKm(o, p);
      const b = haversineKm(p, d);
      return { v, p, a, b, ratio: (a + b) / direct, off: pointToSegmentM(p, o, d) };
    })
      .filter(
        (x) => x.ratio <= MAX_DETOUR_RATIO && x.a > Math.max(0.8, 0.12 * direct) && x.b > Math.max(0.8, 0.12 * direct),
      )
      .filter((x) => x.off >= minOffLine)
      .sort((x, y) => x.ratio - y.ratio || x.v.id.localeCompare(y.v.id));

    for (const opt of options) {
      if (picked.length >= MAX_ROUTES) break;
      const farEnough = picked.every((p) => !p.via || haversineKm([p.via.lng, p.via.lat], opt.p) >= minSep);
      if (farEnough) picked.push({ via: opt.v });
    }
    if (picked.length < 3) picked.push({ via: null, synthetic: "left" });
    if (picked.length < 3) picked.push({ via: null, synthetic: "right" });

    return picked.map((p) => buildRoute(origin, destination, o, d, direct, p.via, p.synthetic));
  }
}

function buildRoute(
  origin: Place,
  destination: Place,
  o: LngLat,
  d: LngLat,
  direct: number,
  via: Via | null,
  synthetic?: "left" | "right",
): Route {
  let control: LngLat[];
  let roadClass: RoadClass;
  let road: string;
  let id: string;

  if (via) {
    control = [o, [via.lng, via.lat], d];
    roadClass = via.road_class;
    road = via.road;
    id = `via-${via.id}`;
  } else if (synthetic) {
    const sign = synthetic === "left" ? 1 : -1;
    control = [o, offsetMid(o, d, 0.16 * sign), d];
    roadClass = "residential";
    road = "side roads";
    id = `side-${synthetic}`;
  } else {
    control = [o, offsetMid(o, d, 0.03), d];
    const near = VIAS.find((v) => pointToSegmentM([v.lng, v.lat], o, d) < 900);
    roadClass = near?.road_class ?? "arterial";
    road = near?.road ?? "the most direct roads";
    id = "direct";
  }

  const path = smoothPath(control, Math.max(12, Math.min(40, Math.round(direct * 2))));
  const distanceKm = round1(pathLengthKm(path) * CIRCUITY);
  const features = featuresFor(id, path, distanceKm, roadClass);
  const label = id === "direct" ? (road === "the most direct roads" ? "Most direct" : `via ${road}`) : `via ${road}`;

  return {
    id,
    label,
    distanceKm,
    path,
    roadClass,
    features,
    steps: stepsFor(origin, destination, path, distanceKm, road),
  };
}

/** Midpoint of o-d pushed sideways by `frac` of the trip length. */
function offsetMid(o: LngLat, d: LngLat, frac: number): LngLat {
  const mx = (o[0] + d[0]) / 2;
  const my = (o[1] + d[1]) / 2;
  const dx = d[0] - o[0];
  const dy = d[1] - o[1];
  return [mx - dy * frac, my + dx * frac];
}

function featuresFor(id: string, path: LngLat[], km: number, cls: RoadClass): RouteFeatures {
  // 60% of the distance on the named road class, 40% on arterials at either end.
  const mix = (k: keyof RouteFeatures) =>
    km * (0.6 * DENSITY[cls][k] + 0.4 * DENSITY.arterial[k]) * (1 + 0.1 * jitter(`${id}:${k}`));
  const f: RouteFeatures = {
    signals: mix("signals"),
    junctions: mix("junctions"),
    uTurns: mix("uTurns"),
    merges: mix("merges"),
    stopProneSegments: mix("stopProneSegments"),
  };
  for (const z of ZONES) {
    const geom = (z.line ?? [z.center]) as LngLat[];
    if (firstTouch(path, geom, z.radius_m) !== null) {
      f.junctions += z.junctions;
      f.stopProneSegments += z.stop_prone;
      f.signals += 1;
    }
  }
  return {
    signals: Math.round(f.signals),
    junctions: Math.round(f.junctions),
    uTurns: Math.round(f.uTurns),
    merges: Math.round(f.merges),
    stopProneSegments: Math.round(f.stopProneSegments),
  };
}

function stepsFor(origin: Place, destination: Place, path: LngLat[], km: number, road: string): Step[] {
  const steps: Step[] = [
    { instruction: `Head out from ${origin.label} toward ${road}`, distanceKm: round1(km * 0.2) },
    { instruction: `Continue on ${road}`, distanceKm: round1(km * 0.5) },
  ];
  const passing = ZONES.map((z) => ({ z, at: firstTouch(path, (z.line ?? [z.center]) as LngLat[], z.radius_m) }))
    .filter((x): x is { z: (typeof ZONES)[number]; at: number } => x.at !== null)
    .sort((a, b) => a.at - b.at);
  for (const { z } of passing) steps.push({ instruction: `Through ${z.name}`, distanceKm: 0 });
  steps.push({ instruction: `Turn toward ${destination.label}`, distanceKm: round1(km * 0.3) });
  steps.push({ instruction: `Arrive at ${destination.label}`, distanceKm: 0 });
  return steps;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
