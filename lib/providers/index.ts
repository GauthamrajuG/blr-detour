import { GazetteerGeocoder } from "@/lib/server/gazetteer";
import { HistoricalProvider } from "./historical";
import { MockRouteProvider } from "./mock-route";
import { MockTrafficProvider } from "./mock-traffic";
import { GoogleRoutesProvider, OsrmProvider } from "./not-implemented";
import { TomTomGeocoder, TomTomProvider } from "./tomtom";
import type { Geocoder, RouteProvider, TrafficProvider } from "./types";

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
 * Provider choice. The simplest setup is one variable: set TOMTOM_API_KEY and routes,
 * traffic, and address search all switch to TomTom. ROUTE_PROVIDER / TRAFFIC_PROVIDER
 * override that. With no keys at all, everything is mock (demo mode).
 */
export function getProviders(env: NodeJS.ProcessEnv = process.env): ProviderSetup {
  const notes: string[] = [];
  const tomtomKey = env.TOMTOM_API_KEY?.trim();
  const wantRoute = env.ROUTE_PROVIDER || (tomtomKey ? "tomtom" : "mock");
  const wantTraffic = env.TRAFFIC_PROVIDER || (tomtomKey ? "tomtom" : "mock");

  // TomTom returns routes and traffic in one call, so one instance serves both.
  const tomtom = tomtomKey ? new TomTomProvider(tomtomKey) : null;

  let route: RouteProvider = new MockRouteProvider();
  if (wantRoute === "tomtom") {
    if (tomtom) route = tomtom;
    else notes.push("ROUTE_PROVIDER=tomtom but TOMTOM_API_KEY is missing; using mock routes.");
  } else if (wantRoute === "google") {
    if (env.GOOGLE_MAPS_API_KEY) route = GoogleRoutesProvider();
    else notes.push("ROUTE_PROVIDER=google but GOOGLE_MAPS_API_KEY is missing; using mock routes.");
  } else if (wantRoute === "osrm") {
    if (env.OSRM_URL) route = OsrmProvider();
    else notes.push("ROUTE_PROVIDER=osrm but OSRM_URL is missing; using mock routes.");
  }

  let traffic: TrafficProvider = new MockTrafficProvider();
  if (wantTraffic === "historical") traffic = new HistoricalProvider();
  else if (wantTraffic === "tomtom") {
    if (tomtom && route === tomtom) traffic = tomtom;
    else if (tomtom)
      notes.push("TRAFFIC_PROVIDER=tomtom needs ROUTE_PROVIDER=tomtom (one call returns both); using mock traffic.");
    else notes.push("TRAFFIC_PROVIDER=tomtom but TOMTOM_API_KEY is missing; using mock traffic.");
  } else if (wantTraffic === "google") {
    if (env.GOOGLE_MAPS_API_KEY) traffic = GoogleRoutesProvider();
    else notes.push("TRAFFIC_PROVIDER=google but GOOGLE_MAPS_API_KEY is missing; using mock traffic.");
  }

  const mode: Mode = route.name === "mock" || traffic.name === "mock" ? "demo" : "live";
  return { route, traffic, mode, notes };
}

export function getGeocoders(env: NodeJS.ProcessEnv = process.env): { local: Geocoder; remote: Geocoder | null } {
  const key = env.TOMTOM_API_KEY?.trim();
  return {
    local: new GazetteerGeocoder(),
    remote: key && env.GEOCODER !== "gazetteer" ? new TomTomGeocoder(key) : null,
  };
}
