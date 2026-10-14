import type { RoadClass, Route, TravelTimeEstimate } from "@/lib/engine/types";
import { istParts, inWindows } from "@/lib/geo/time";
import { PROFILES, isWeekendOrHoliday, peakWindowsFor, routeContext, ZONES } from "@/lib/geo/zones";
import type { TrafficProvider } from "./types";

type Profile = Record<RoadClass, number[]>;

/**
 * Fallback traffic model: hourly speed per road class, plus extra delay at named
 * chokepoints during their peak windows. Every result is labelled "historical".
 */
export class HistoricalProvider implements TrafficProvider {
  readonly name: string = "historical";
  protected source: TravelTimeEstimate["source"] = "historical";

  async getTravelTimes(route: Route, departureTime: Date): Promise<TravelTimeEstimate> {
    return this.estimate(route, departureTime, new Date());
  }

  estimate(route: Route, departure: Date, now: Date): TravelTimeEstimate {
    const dayType = isWeekendOrHoliday(departure) ? "weekend" : "weekday";
    const profile = PROFILES.speed_kmh[dayType] as Profile;

    // First pass at the departure hour, second pass at the trip's midpoint hour.
    let minutes = baseMinutes(route, profile, istParts(departure).hour);
    const mid = new Date(departure.getTime() + (minutes / 2) * 60000);
    minutes = baseMinutes(route, profile, istParts(mid).hour);

    const peak = inWindows(istParts(mid).minuteOfDay, peakWindowsFor(null, mid));
    const v = (peak ? PROFILES.variance.peak : PROFILES.variance.off_peak) as Record<RoadClass, number>;
    const spread = v[route.roadClass];

    const ctx = routeContext(route.path, departure, minutes);
    let zoneDelay = 0;
    let zoneVariance = 0;
    for (const z of ctx.chokepoints) {
      const def = ZONES.find((x) => x.id === z.id);
      if (!def) continue;
      zoneDelay += z.inPeak ? def.typical_delay_min : def.typical_delay_min * 0.25;
      zoneVariance += z.inPeak ? def.variance_min : def.variance_min * 0.25;
    }

    const expected = this.adjust(route, departure, minutes + zoneDelay);
    return {
      expected: Math.round(expected),
      low: Math.max(1, Math.floor(expected * (1 - spread * 0.6))),
      high: Math.ceil(expected * (1 + spread) + zoneVariance),
      source: this.source,
      fetchedAt: now.toISOString(),
    };
  }

  /** Hook for subclasses (the mock adds deterministic jitter). */
  protected adjust(_route: Route, _departure: Date, minutes: number): number {
    return minutes;
  }
}

function baseMinutes(route: Route, profile: Profile, hour: number): number {
  const main = profile[route.roadClass][hour];
  const ends = profile.arterial[hour];
  const share = route.roadClass === "arterial" ? 1 : 0.6;
  return ((route.distanceKm * share) / main) * 60 + ((route.distanceKm * (1 - share)) / ends) * 60;
}
