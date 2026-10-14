import { describe, expect, it } from "vitest";
import { MockRouteProvider } from "@/lib/providers/mock-route";
import { MockTrafficProvider } from "@/lib/providers/mock-traffic";
import { HistoricalProvider } from "@/lib/providers/historical";
import { getProviders } from "@/lib/providers";
import { routeCacheKey } from "@/lib/server/cache";
import { routeContext } from "@/lib/geo/zones";
import { rankRoutes } from "@/lib/engine/score";
import { DEFAULT_WEIGHTS } from "@/lib/engine/config";
import { tomorrowAt8Ist } from "@/lib/geo/time";

const KORAMANGALA = { label: "Koramangala", lat: 12.9352, lng: 77.6245 };
const ECITY = { label: "Electronic City", lat: 12.8452, lng: 77.6602 };
const WHITEFIELD = { label: "Whitefield", lat: 12.9698, lng: 77.75 };
const HSR = { label: "HSR Layout", lat: 12.9116, lng: 77.6389 };
// Tuesday 13 Oct 2026, 18:00 IST: weekday evening peak, monsoon months.
const PEAK = new Date("2026-10-13T12:30:00.000Z");

describe("MockRouteProvider", () => {
  const rp = new MockRouteProvider();

  it("returns 3 or 4 distinct routes for typical trips", async () => {
    for (const [o, d] of [
      [KORAMANGALA, ECITY],
      [HSR, WHITEFIELD],
      [KORAMANGALA, WHITEFIELD],
    ]) {
      const routes = await rp.getAlternatives(o, d, PEAK);
      expect(routes.length).toBeGreaterThanOrEqual(3);
      expect(routes.length).toBeLessThanOrEqual(4);
      expect(new Set(routes.map((r) => r.id)).size).toBe(routes.length);
    }
  });

  it("is deterministic", async () => {
    const a = await rp.getAlternatives(HSR, WHITEFIELD, PEAK);
    const b = await rp.getAlternatives(HSR, WHITEFIELD, PEAK);
    expect(a).toEqual(b);
  });

  it("returns nothing for the same place twice", async () => {
    expect(await rp.getAlternatives(HSR, HSR, PEAK)).toEqual([]);
  });
});

describe("traffic providers", () => {
  it("labels sources honestly and keeps low <= expected <= high", async () => {
    const [route] = await new MockRouteProvider().getAlternatives(KORAMANGALA, ECITY, PEAK);
    const m = await new MockTrafficProvider().getTravelTimes(route, PEAK);
    const h = await new HistoricalProvider().getTravelTimes(route, PEAK);
    expect(m.source).toBe("mock");
    expect(h.source).toBe("historical");
    for (const e of [m, h]) {
      expect(e.low).toBeLessThanOrEqual(e.expected);
      expect(e.expected).toBeLessThanOrEqual(e.high);
    }
  });

  it("peak is slower than late night", async () => {
    const [route] = await new MockRouteProvider().getAlternatives(KORAMANGALA, ECITY, PEAK);
    const night = new Date("2026-10-13T20:30:00.000Z"); // 02:00 IST
    const hp = new HistoricalProvider();
    expect((await hp.getTravelTimes(route, PEAK)).expected).toBeGreaterThan(
      (await hp.getTravelTimes(route, night)).expected,
    );
  });
});

describe("context and end to end", () => {
  it("finds Silk Board on a route that passes it at peak", () => {
    const ctx = routeContext(
      [
        [77.6245, 12.9352],
        [77.6229, 12.9172],
        [77.6602, 12.8452],
      ],
      PEAK,
      40,
    );
    const silk = ctx.chokepoints.find((z) => z.id === "silk-board");
    expect(silk?.inPeak).toBe(true);
    expect(ctx.monsoonActive).toBe(true);
  });

  it("produces ranked routes with reasons in demo mode", async () => {
    const routes = await new MockRouteProvider().getAlternatives(KORAMANGALA, ECITY, PEAK);
    const tp = new MockTrafficProvider();
    const cands = await Promise.all(
      routes.map(async (route) => {
        const estimate = await tp.getTravelTimes(route, PEAK);
        return { route, estimate, context: routeContext(route.path, PEAK, estimate.expected) };
      }),
    );
    const ranked = rankRoutes(cands, DEFAULT_WEIGHTS, { departure: PEAK, now: PEAK });
    expect(ranked.every((r) => r.reasons.length > 0)).toBe(true);
    expect(ranked.every((r) => r.confidence === "estimated")).toBe(true);
  });
});

describe("infrastructure", () => {
  it("falls back to demo mode with no keys and explains why", () => {
    const p = getProviders({ ROUTE_PROVIDER: "google", TRAFFIC_PROVIDER: "tomtom" } as unknown as NodeJS.ProcessEnv);
    expect(p.mode).toBe("demo");
    expect(p.notes.length).toBe(2);
  });

  it("cache key rounds ~100 m and buckets 5 minutes", () => {
    const k1 = routeCacheKey(KORAMANGALA, ECITY, new Date("2026-10-13T12:31:00Z"));
    const k2 = routeCacheKey(
      { ...KORAMANGALA, lat: KORAMANGALA.lat + 0.0001 },
      ECITY,
      new Date("2026-10-13T12:34:59Z"),
    );
    const k3 = routeCacheKey(KORAMANGALA, ECITY, new Date("2026-10-13T12:35:00Z"));
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });

  it("tomorrow 8 AM is 8:00 IST the next day", () => {
    const t = tomorrowAt8Ist(PEAK);
    expect(t.toISOString()).toBe("2026-10-14T02:30:00.000Z");
  });
});
