import { HistoricalProvider } from "./historical";
import { MockRouteProvider } from "./mock-route";
import { MockTrafficProvider } from "./mock-traffic";
import { GoogleRoutesProvider, OsrmProvider, TomTomProvider } from "./not-implemented";
import type { RouteProvider, TrafficProvider } from "./types";

export type Mode = "demo" | "live";

export interface ProviderSetup {
  route: RouteProvider;
  traffic: TrafficProvider;
  /** "demo" whenever either side is mock. The UI shows a banner in demo mode. */
  mode: Mode;
  /** Plain notes for /api/health, never containing secrets. */
  notes: string[];
}

/**
 * Reads ROUTE_PROVIDER and TRAFFIC_PROVIDER. With no keys set, everything is mock.
 * A provider asked for without its key falls back to mock and says so.
 */
export function getProviders(env: NodeJS.ProcessEnv = process.env): ProviderSetup {
  const notes: string[] = [];
  const hasGoogle = Boolean(env.GOOGLE_MAPS_API_KEY);
  const hasTomTom = Boolean(env.TOMTOM_API_KEY);

  let route: RouteProvider = new MockRouteProvider();
  const wantRoute = env.ROUTE_PROVIDER ?? "mock";
  if (wantRoute === "google") {
    if (hasGoogle) route = GoogleRoutesProvider();
    else notes.push("ROUTE_PROVIDER=google but GOOGLE_MAPS_API_KEY is missing; using mock routes.");
  } else if (wantRoute === "osrm") {
    if (env.OSRM_URL) route = OsrmProvider();
    else notes.push("ROUTE_PROVIDER=osrm but OSRM_URL is missing; using mock routes.");
  }

  let traffic: TrafficProvider = new MockTrafficProvider();
  const wantTraffic = env.TRAFFIC_PROVIDER ?? "mock";
  if (wantTraffic === "historical") traffic = new HistoricalProvider();
  else if (wantTraffic === "google") {
    if (hasGoogle) traffic = GoogleRoutesProvider();
    else notes.push("TRAFFIC_PROVIDER=google but GOOGLE_MAPS_API_KEY is missing; using mock traffic.");
  } else if (wantTraffic === "tomtom") {
    if (hasTomTom) traffic = TomTomProvider();
    else notes.push("TRAFFIC_PROVIDER=tomtom but TOMTOM_API_KEY is missing; using mock traffic.");
  }

  const mode: Mode = route.name === "mock" || traffic.name === "mock" ? "demo" : "live";
  return { route, traffic, mode, notes };
}
