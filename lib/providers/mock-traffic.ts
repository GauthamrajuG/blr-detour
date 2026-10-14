import type { Route } from "@/lib/engine/types";
import { HistoricalProvider } from "./historical";
import { jitter } from "./hash";

/**
 * Deterministic traffic for demo mode and tests. Built on the historical model with a
 * small stable jitter per route and 5-minute departure bucket, and labelled "mock" so
 * the UI shows "Estimated, not live" and the demo banner.
 */
export class MockTrafficProvider extends HistoricalProvider {
  readonly name = "mock";
  protected source = "mock" as const;

  protected adjust(route: Route, departure: Date, minutes: number): number {
    const bucket = Math.floor(departure.getTime() / 300000);
    return minutes * (1 + 0.06 * jitter(`${route.id}:${bucket}`));
  }
}
