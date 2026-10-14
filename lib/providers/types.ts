import type { Place, Route, TravelTimeEstimate } from "@/lib/engine/types";

export interface RouteProvider {
  readonly name: string;
  getAlternatives(origin: Place, destination: Place, departureTime: Date): Promise<Route[]>;
}

export interface TrafficProvider {
  readonly name: string;
  getTravelTimes(route: Route, departureTime: Date): Promise<TravelTimeEstimate>;
}

export interface GeocodeResult {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export interface Geocoder {
  readonly name: string;
  search(query: string): Promise<GeocodeResult[]>;
}

/** Thrown when a provider is selected but not set up. The API turns this into a clear message. */
export class ProviderNotConfiguredError extends Error {
  constructor(provider: string, detail: string) {
    super(`${provider} is not configured: ${detail}`);
    this.name = "ProviderNotConfiguredError";
  }
}
