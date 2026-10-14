import zonesData from "@/data/bengaluru/zones.json";
import worksData from "@/data/bengaluru/construction.json";
import floodData from "@/data/bengaluru/monsoon_flood.json";
import profilesData from "@/data/bengaluru/profiles.json";
import type { LngLat, RouteContext } from "@/lib/engine/types";
import { firstTouch } from "./geo";
import { inWindows, istParts } from "./time";

type Window = [string, string];

export interface ZoneDef {
  id: string;
  name: string;
  kind: string;
  center?: number[];
  line?: number[][];
  radius_m: number;
  peak_windows: string[][];
  typical_delay_min: number;
  variance_min: number;
  junctions: number;
  stop_prone: number;
  last_verified: string;
}

export interface WorksDef {
  id: string;
  name: string;
  kind: string;
  center?: number[];
  line?: number[][];
  radius_m: number;
  delay_min: number;
  closure: boolean;
}

export interface FloodDef {
  id: string;
  name: string;
  center: number[];
  radius_m: number;
  penalty_min: number;
}

export const ZONES = zonesData.zones as ZoneDef[];
export const WORKS = worksData.items as WorksDef[];
export const FLOODS = floodData.items as FloodDef[];
export const PROFILES = profilesData;

export interface LayerFreshness {
  id: "zones" | "construction" | "flood";
  lastVerified: string;
  verification: "seed" | "field";
}

export const LAYER_FRESHNESS: LayerFreshness[] = [
  { id: "zones", lastVerified: zonesData.last_verified, verification: zonesData.verification as "seed" | "field" },
  {
    id: "construction",
    lastVerified: worksData.last_verified,
    verification: worksData.verification as "seed" | "field",
  },
  { id: "flood", lastVerified: floodData.last_verified, verification: floodData.verification as "seed" | "field" },
];

function geom(d: { center?: number[]; line?: number[][] }): LngLat[] {
  if (d.line) return d.line as LngLat[];
  return [d.center as LngLat];
}

export function isWeekendOrHoliday(when: Date): boolean {
  const p = istParts(when);
  return p.dayOfWeek === 0 || p.dayOfWeek === 6 || PROFILES.holidays.includes(p.ymd);
}

export function peakWindowsFor(zone: ZoneDef | null, when: Date): Window[] {
  if (isWeekendOrHoliday(when)) return PROFILES.peak_windows.weekend as Window[];
  if (zone && zone.peak_windows.length > 0) return zone.peak_windows as Window[];
  return PROFILES.peak_windows.weekday as Window[];
}

export function isMonsoon(when: Date): boolean {
  return floodData.active_months.includes(istParts(when).month);
}

/**
 * Which chokepoints, works, and flood roads a path touches, and whether each
 * chokepoint is in its peak window when the traveller is expected to reach it.
 */
export function routeContext(path: LngLat[], departure: Date, travelMin: number): RouteContext {
  const chokepoints: RouteContext["chokepoints"] = [];
  for (const z of ZONES) {
    const at = firstTouch(path, geom(z), z.radius_m);
    if (at === null) continue;
    const reachAt = new Date(departure.getTime() + at * travelMin * 60000);
    const inPeak = inWindows(istParts(reachAt).minuteOfDay, peakWindowsFor(z, reachAt));
    chokepoints.push({ id: z.id, name: z.name, at, inPeak, delayMin: z.typical_delay_min });
  }

  const works: RouteContext["works"] = [];
  for (const w of WORKS) {
    const at = firstTouch(path, geom(w), w.radius_m);
    if (at !== null) works.push({ id: w.id, name: w.name, at, delayMin: w.delay_min, closure: w.closure });
  }

  const monsoonActive = isMonsoon(departure);
  const floods: RouteContext["floods"] = [];
  for (const f of FLOODS) {
    const at = firstTouch(path, geom(f), f.radius_m);
    if (at !== null) floods.push({ id: f.id, name: f.name, at, penaltyMin: f.penalty_min });
  }

  const byAt = <T extends { at: number }>(a: T, b: T) => a.at - b.at;
  return {
    chokepoints: chokepoints.sort(byAt),
    works: works.sort(byAt),
    floods: floods.sort(byAt),
    monsoonActive,
  };
}

/** GeoJSON for the map's context layers. */
export function layersGeoJSON() {
  const feature = (
    d: { id: string; name: string; center?: number[]; line?: number[][]; radius_m: number },
    layer: string,
  ) => ({
    type: "Feature" as const,
    properties: { id: d.id, name: d.name, layer, radius: d.radius_m },
    geometry: d.line
      ? { type: "LineString" as const, coordinates: d.line }
      : { type: "Point" as const, coordinates: d.center as number[] },
  });
  return {
    type: "FeatureCollection" as const,
    features: [
      ...ZONES.map((z) => feature(z, "chokepoint")),
      ...WORKS.map((w) => feature(w, "works")),
      ...FLOODS.map((f) => feature(f, "flood")),
    ],
  };
}
