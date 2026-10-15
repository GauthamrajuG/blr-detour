import type { LngLat, Place, RoadClass, Route, RouteFeatures, Step, TravelTimeEstimate } from "@/lib/engine/types";
import { LIVE_FUTURE_DEPARTURE_MAX_MIN } from "@/lib/engine/config";
import { inBengaluru, pathLengthKm } from "@/lib/geo/geo";
import { inWindows, istParts } from "@/lib/geo/time";
import { PROFILES, ZONES, peakWindowsFor } from "@/lib/geo/zones";
import { firstTouch } from "@/lib/geo/geo";
import type { GeocodeResult, Geocoder, RouteProvider, TrafficProvider } from "./types";

/**
 * TomTom Routing API (Calculate Route v1) and Search API (Fuzzy Search v2).
 * Docs read 15 Oct 2026: docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route
 *
 * One routing call returns up to 1 + MAX_ALTERNATIVES routes, each with live and historic
 * travel times, traffic jam sections, road-name stretches, and turn-by-turn guidance.
 * So this class is both the RouteProvider and the TrafficProvider: getTravelTimes reads
 * the estimate captured during getAlternatives instead of making a second paid call.
 */

/** Overridable only so tests can point at a local stand-in; production uses TomTom. */
const BASE = process.env.TOMTOM_BASE_URL || "https://api.tomtom.com";
export const MAX_ALTERNATIVES = 3;
const MAX_PATH_POINTS = 400;
const TIMEOUT_MS = 8000;

export class TomTomError extends Error {
  constructor(
    readonly status: number,
    readonly code: "provider_auth" | "provider_quota" | "no_route" | "provider_failed",
  ) {
    super(`TomTom ${status}: ${code}`);
    this.name = "TomTomError";
  }
}

/* ---------------- Response types (documented subset) ---------------- */

interface TTPoint {
  latitude: number;
  longitude: number;
}
interface TTSummary {
  lengthInMeters: number;
  travelTimeInSeconds: number;
  trafficDelayInSeconds?: number;
  noTrafficTravelTimeInSeconds?: number;
  historicTrafficTravelTimeInSeconds?: number;
  liveTrafficIncidentsTravelTimeInSeconds?: number;
}
interface TTSection {
  startPointIndex: number;
  endPointIndex: number;
  sectionType: string;
  simpleCategory?: string;
  magnitudeOfDelay?: number;
  delayInSeconds?: number;
  streetName?: { text: string };
  roadNumbers?: { text: string }[];
}
interface TTInstruction {
  routeOffsetInMeters: number;
  maneuver?: string;
  message?: string;
  street?: string;
}
export interface TTRoute {
  summary: TTSummary;
  legs: { points?: TTPoint[] }[];
  sections?: TTSection[];
  guidance?: { instructions?: TTInstruction[] };
}
export interface TTResponse {
  routes?: TTRoute[];
}

/* ---------------- Request ---------------- */

/** RFC 3339 in IST, which is what TomTom expects when no offset is assumed. */
export function istDateTime(d: Date): string {
  const t = new Date(d.getTime() + 330 * 60000);
  return `${t.toISOString().slice(0, 19)}+05:30`;
}

export function buildRouteUrl(origin: Place, destination: Place, departure: Date, now: Date, key: string): string {
  const loc = `${origin.lat},${origin.lng}:${destination.lat},${destination.lng}`;
  const departAt = departure.getTime() - now.getTime() < 60_000 ? "now" : istDateTime(departure);
  const q = new URLSearchParams({
    key,
    maxAlternatives: String(MAX_ALTERNATIVES),
    computeTravelTimeFor: "all",
    traffic: "true",
    travelMode: "car",
    routeType: "fastest",
    departAt,
    instructionsType: "text",
    language: "en-GB",
  });
  // sectionType can repeat.
  for (const s of ["traffic", "motorway", "importantRoadStretch"]) q.append("sectionType", s);
  return `${BASE}/routing/1/calculateRoute/${loc}/json?${q.toString()}`;
}

/* ---------------- Parsing (pure, unit tested) ---------------- */

const JUNCTION = /^(TURN_|SHARP_|BEAR_|ROUNDABOUT_(CROSS|LEFT|RIGHT))/;
const UTURN = /^(MAKE_UTURN|TRY_MAKE_UTURN|ROUNDABOUT_BACK)$/;
const MERGE = /^(ENTER_|ENTRANCE_RAMP|SWITCH_|KEEP_|TAKE_EXIT|MOTORWAY_EXIT)/;

interface Parsed {
  routes: Route[];
  estimates: Map<string, TravelTimeEstimate>;
}

/**
 * Turn a TomTom response into our Route and TravelTimeEstimate objects.
 *
 * - expected: TomTom's best estimate (`travelTimeInSeconds`, traffic-aware).
 * - low/high: TomTom gives one number, so the range is ours: the hour's typical variance
 *   for the road class around the estimate, never faster than free flow, and never below
 *   TomTom's historic estimate on the high side. Documented in docs/decisions.md.
 * - source: "live" for departures now, "historical" for later departures (TomTom then
 *   relies on historic speeds, so we must not call it live).
 * - signals: TomTom does not report traffic signals. We estimate them from turns and
 *   distance; see docs/providers.md. Junctions, U-turns, merges, and jams are counted
 *   from TomTom's own guidance and traffic sections.
 */
export function parseTomTom(raw: TTResponse, departure: Date, now: Date): Parsed {
  const out: Parsed = { routes: [], estimates: new Map() };
  const used = new Set<string>();
  const live = departure.getTime() - now.getTime() <= LIVE_FUTURE_DEPARTURE_MAX_MIN * 60000;

  (raw.routes ?? []).forEach((r, i) => {
    const pts = r.legs.flatMap((l) => l.points ?? []);
    if (pts.length < 2) return;
    const fullPath: LngLat[] = pts.map((p) => [p.longitude, p.latitude]);
    const path = downsample(fullPath, MAX_PATH_POINTS);
    const distanceKm =
      Math.round((r.summary.lengthInMeters / 1000) * 10) / 10 || Math.round(pathLengthKm(path) * 10) / 10;
    const sections = r.sections ?? [];
    const roadClass = classify(sections, pts.length);
    const id = `tt-${i}`;
    const label = labelFor(sections, used, i);
    const steps = stepsFor(r.guidance?.instructions ?? [], r.summary.lengthInMeters);
    const features = featuresFor(r.guidance?.instructions ?? [], sections, distanceKm, path);

    out.routes.push({ id, label, distanceKm, path, roadClass, features, steps });
    out.estimates.set(id, estimateFor(r.summary, roadClass, departure, now, live));
  });
  return out;
}

function downsample(path: LngLat[], max: number): LngLat[] {
  if (path.length <= max) return path;
  const step = (path.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, k) => path[Math.round(k * step)]);
}

function classify(sections: TTSection[], nPoints: number): RoadClass {
  const motorway = sections
    .filter((s) => s.sectionType === "MOTORWAY")
    .reduce((n, s) => n + (s.endPointIndex - s.startPointIndex), 0);
  return motorway / Math.max(1, nPoints) > 0.35 ? "highway" : "arterial";
}

/** "via <the named road covering most of the route>", unique across the alternatives. */
function labelFor(sections: TTSection[], used: Set<string>, i: number): string {
  const byName = new Map<string, number>();
  for (const s of sections) {
    if (s.sectionType !== "IMPORTANT_ROAD_STRETCH") continue;
    const name = s.streetName?.text || s.roadNumbers?.[0]?.text;
    if (!name) continue;
    byName.set(name, (byName.get(name) ?? 0) + (s.endPointIndex - s.startPointIndex));
  }
  const ranked = [...byName.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const pick = ranked.find((n) => !used.has(n));
  if (pick) {
    used.add(pick);
    return `via ${pick}`;
  }
  return i === 0 ? "Main route" : `Alternative ${i}`;
}

function stepsFor(ins: TTInstruction[], totalM: number): Step[] {
  const steps: Step[] = [];
  for (let k = 0; k < ins.length; k++) {
    const msg = ins[k].message?.trim();
    if (!msg) continue;
    const next = ins[k + 1]?.routeOffsetInMeters ?? totalM;
    steps.push({
      instruction: msg,
      distanceKm: Math.max(0, Math.round((next - ins[k].routeOffsetInMeters) / 100) / 10),
    });
  }
  // Long city routes can have 60+ instructions; keep the card readable.
  if (steps.length > 16) {
    const keep = [...steps.slice(0, 7), ...steps.slice(-8)];
    keep.splice(7, 0, { instruction: `…${steps.length - 15} more turns…`, distanceKm: 0 });
    return keep;
  }
  return steps;
}

function featuresFor(ins: TTInstruction[], sections: TTSection[], km: number, path: LngLat[]): RouteFeatures {
  let junctions = 0;
  let uTurns = 0;
  let merges = 0;
  for (const s of ins) {
    const m = s.maneuver ?? "";
    if (UTURN.test(m)) uTurns++;
    else if (JUNCTION.test(m)) junctions++;
    else if (MERGE.test(m)) merges++;
  }
  const jams = sections.filter((s) => s.sectionType === "TRAFFIC" && s.simpleCategory === "JAM");
  let stopProneSegments = jams.reduce((n, s) => n + (s.magnitudeOfDelay && s.magnitudeOfDelay >= 2 ? 2 : 1), 0);
  // Estimate, not data: TomTom has no signal layer. Bengaluru arterials average roughly
  // one signal per km; most turns happen at a signal or a busy junction.
  let signals = Math.round(junctions * 0.6 + km * 0.5);
  // Known chokepoints add the same junction and stop-and-go load as in the demo model,
  // so live and demo stress scores are on one scale.
  for (const z of ZONES) {
    if (firstTouch(path, (z.line ?? [z.center]) as LngLat[], z.radius_m) === null) continue;
    junctions += z.junctions;
    stopProneSegments += z.stop_prone;
    signals += 1;
  }
  return { signals, junctions, uTurns, merges, stopProneSegments: Math.round(stopProneSegments) };
}

function estimateFor(s: TTSummary, cls: RoadClass, departure: Date, now: Date, live: boolean): TravelTimeEstimate {
  const expected = s.travelTimeInSeconds / 60;
  const free = (s.noTrafficTravelTimeInSeconds ?? s.travelTimeInSeconds * 0.6) / 60;
  const hist = (s.historicTrafficTravelTimeInSeconds ?? s.travelTimeInSeconds) / 60;
  const mid = new Date(departure.getTime() + (expected / 2) * 60000);
  const peak = inWindows(istParts(mid).minuteOfDay, peakWindowsFor(null, mid));
  const v = (peak ? PROFILES.variance.peak : PROFILES.variance.off_peak) as Record<RoadClass, number>;
  const spread = v[cls];
  return {
    expected: Math.max(1, Math.round(expected)),
    low: Math.max(1, Math.floor(Math.max(free, expected * (1 - spread * 0.6)))),
    high: Math.ceil(Math.max(expected * (1 + spread), hist)),
    source: live ? "live" : "historical",
    fetchedAt: now.toISOString(),
  };
}

/* ---------------- Provider ---------------- */

export class TomTomProvider implements RouteProvider, TrafficProvider {
  readonly name = "tomtom";
  private estimates = new Map<string, TravelTimeEstimate>();

  constructor(
    private key: string,
    private fetchImpl: typeof fetch = fetch,
    private clock: () => Date = () => new Date(),
  ) {}

  async getAlternatives(origin: Place, destination: Place, departureTime: Date): Promise<Route[]> {
    const now = this.clock();
    const res = await withTimeout(this.fetchImpl, buildRouteUrl(origin, destination, departureTime, now, this.key));
    if (!res.ok) throw mapStatus(res.status);
    const parsed = parseTomTom((await res.json()) as TTResponse, departureTime, now);
    this.estimates = parsed.estimates;
    return parsed.routes;
  }

  async getTravelTimes(route: Route): Promise<TravelTimeEstimate> {
    const e = this.estimates.get(route.id);
    if (!e) throw new TomTomError(500, "provider_failed");
    return e;
  }
}

function mapStatus(status: number): TomTomError {
  if (status === 403 || status === 401) return new TomTomError(status, "provider_auth");
  if (status === 429) return new TomTomError(status, "provider_quota");
  if (status === 400) return new TomTomError(status, "no_route");
  return new TomTomError(status, "provider_failed");
}

async function withTimeout(f: typeof fetch, url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await f(url, { signal: ctrl.signal, headers: { "Accept-Encoding": "gzip" } });
  } catch {
    throw new TomTomError(504, "provider_failed");
  } finally {
    clearTimeout(t);
  }
}

/* ---------------- Geocoder ---------------- */

interface TTSearchResult {
  id: string;
  type?: string;
  poi?: { name?: string };
  address?: { freeformAddress?: string; municipalitySubdivision?: string; streetName?: string };
  position?: { lat: number; lon: number };
}

/** Fuzzy Search with typeahead, biased to Bengaluru, India only, results outside the city dropped. */
export class TomTomGeocoder implements Geocoder {
  readonly name = "tomtom";
  constructor(
    private key: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async search(query: string): Promise<GeocodeResult[]> {
    const q = new URLSearchParams({
      key: this.key,
      typeahead: "true",
      limit: "6",
      countrySet: "IN",
      lat: "12.9716",
      lon: "77.5946",
      radius: "45000",
      language: "en-GB",
    });
    const res = await withTimeout(this.fetchImpl, `${BASE}/search/2/search/${encodeURIComponent(query)}.json?${q}`);
    if (!res.ok) throw mapStatus(res.status);
    const data = (await res.json()) as { results?: TTSearchResult[] };
    return parseSearch(data.results ?? []);
  }
}

export function parseSearch(results: TTSearchResult[]): GeocodeResult[] {
  const out: GeocodeResult[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (!r.position || !inBengaluru(r.position.lat, r.position.lon)) continue;
    const area = r.address?.municipalitySubdivision;
    const base = r.poi?.name || r.address?.freeformAddress || r.address?.streetName;
    if (!base) continue;
    const label = r.poi?.name && area ? `${r.poi.name}, ${area}` : base;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ id: `tt:${r.id}`, label, lat: r.position.lat, lng: r.position.lon });
  }
  return out;
}
