/** Longitude, latitude (GeoJSON order). */
export type LngLat = [number, number];

export type RoadClass = "highway" | "orr" | "arterial" | "residential";

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

export interface Step {
  instruction: string;
  distanceKm: number;
}

/** Counts that drive the stress score. */
export interface RouteFeatures {
  signals: number;
  junctions: number;
  uTurns: number;
  merges: number;
  stopProneSegments: number;
}

/** One chokepoint, flood road, or works zone a route passes through. */
export interface ZoneHit {
  id: string;
  name: string;
  /** Fraction (0-1) of the way along the route where the hit happens. */
  at: number;
}

/** A route geometry and its static facts. Comes from a RouteProvider. */
export interface Route {
  id: string;
  /** Short name, e.g. "via Outer Ring Road". */
  label: string;
  distanceKm: number;
  path: LngLat[];
  roadClass: RoadClass;
  features: RouteFeatures;
  steps: Step[];
}

export type TrafficSource = "live" | "historical" | "mock";

/** What a TrafficProvider returns for one route at one departure time. */
export interface TravelTimeEstimate {
  expected: number;
  low: number;
  high: number;
  source: TrafficSource;
  /** ISO timestamp of when the provider produced the number. */
  fetchedAt: string;
}

/** Bengaluru context that adds risk, computed from the data layers. */
export interface RouteContext {
  chokepoints: (ZoneHit & { inPeak: boolean; delayMin: number })[];
  works: (ZoneHit & { delayMin: number; closure: boolean })[];
  floods: (ZoneHit & { penaltyMin: number })[];
  monsoonActive: boolean;
}

/** Everything the engine needs for one route. The API returns a list of these. */
export interface Candidate {
  route: Route;
  estimate: TravelTimeEstimate;
  context: RouteContext;
}

export interface Weights {
  /** 0-10 slider values. 5 is neutral (multiplier 1). */
  time: number;
  calm: number;
  predictability: number;
  flood: number;
}

export type Confidence = "live" | "historical" | "estimated";

export interface Reason {
  key:
    | "fastest"
    | "fastestThrough"
    | "fastestAvoids"
    | "avoids"
    | "avoidsFlood"
    | "avoidsWorks"
    | "calmer"
    | "steadier"
    | "floodRisk"
    | "works"
    | "slower";
  params: Record<string, string | number>;
}

export interface Breakdown {
  timeMin: number;
  stressMin: number;
  predictabilityMin: number;
  riskMin: number;
}

export interface RankedRoute {
  candidate: Candidate;
  rank: number;
  score: number;
  breakdown: Breakdown;
  /** 0-100, lower is calmer. */
  stress: number;
  /** Minutes vs the fastest-looking option; negative means faster. */
  deltaVsFastest: number;
  isFastest: boolean;
  confidence: Confidence;
  reasons: Reason[];
  /** Percent calmer than the fastest option (stress). Negative means more stressful. */
  calmerPct: number;
}
