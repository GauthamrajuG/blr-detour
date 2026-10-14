import type { Place, Route, TravelTimeEstimate } from "@/lib/engine/types";
import { ProviderNotConfiguredError, type RouteProvider, type TrafficProvider } from "./types";

/**
 * Phase 4 placeholders. The brief asks to stop and confirm API keys and account
 * decisions before building these, so they exist only to keep the interface honest:
 * selecting one without an implementation fails loudly instead of silently mocking.
 * See docs/providers.md for what each one needs.
 */
class Pending implements RouteProvider, TrafficProvider {
  constructor(
    readonly name: string,
    private detail: string,
  ) {}
  async getAlternatives(_o: Place, _d: Place, _t: Date): Promise<Route[]> {
    throw new ProviderNotConfiguredError(this.name, this.detail);
  }
  async getTravelTimes(_r: Route, _t: Date): Promise<TravelTimeEstimate> {
    throw new ProviderNotConfiguredError(this.name, this.detail);
  }
}

export const GoogleRoutesProvider = () =>
  new Pending("google", "Routes API client is planned for Phase 4 (needs GOOGLE_MAPS_API_KEY and billing caps).");
export const TomTomProvider = () =>
  new Pending("tomtom", "TomTom Routing client is planned for Phase 4 (needs TOMTOM_API_KEY).");
export const OsrmProvider = () =>
  new Pending("osrm", "OSRM client is planned for Phase 4 (needs a hosted OSRM instance URL).");
