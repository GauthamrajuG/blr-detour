import { describe, expect, it, vi } from "vitest";
import { DEFAULT_WEIGHTS } from "@/lib/engine/config";
import { rankRoutes } from "@/lib/engine/score";
import { routeContext } from "@/lib/geo/zones";
import { getGeocoders, getProviders } from "@/lib/providers";
import {
  buildRouteUrl,
  parseSearch,
  parseTomTom,
  TomTomError,
  TomTomGeocoder,
  TomTomProvider,
  type TTResponse,
} from "@/lib/providers/tomtom";

// Tue 13 Oct 2026, 18:00 IST.
const NOW = new Date("2026-10-13T12:30:00.000Z");
const KORA = { label: "Koramangala", lat: 12.9352, lng: 77.6245 };
const ECITY = { label: "Electronic City", lat: 12.8452, lng: 77.6602 };

/** Points along a line, as TomTom returns them. */
function line(a: [number, number], b: [number, number], via: [number, number], n = 40) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const [p, q] = t < 0.5 ? [a, via] : [via, b];
    const u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    pts.push({ latitude: p[0] + (q[0] - p[0]) * u, longitude: p[1] + (q[1] - p[1]) * u });
  }
  return pts;
}

/** Shaped like the documented Calculate Route response (subset we read). */
const FIXTURE: TTResponse = {
  routes: [
    {
      // Through Silk Board on Hosur Road.
      summary: {
        lengthInMeters: 14800,
        travelTimeInSeconds: 3000,
        trafficDelayInSeconds: 900,
        noTrafficTravelTimeInSeconds: 1500,
        historicTrafficTravelTimeInSeconds: 3300,
        liveTrafficIncidentsTravelTimeInSeconds: 3000,
      },
      legs: [{ points: line([12.9352, 77.6245], [12.8452, 77.6602], [12.9172, 77.6229]) }],
      sections: [
        { startPointIndex: 0, endPointIndex: 40, sectionType: "TRAVEL_MODE" },
        {
          startPointIndex: 18,
          endPointIndex: 24,
          sectionType: "TRAFFIC",
          simpleCategory: "JAM",
          magnitudeOfDelay: 3,
          delayInSeconds: 600,
        },
        {
          startPointIndex: 26,
          endPointIndex: 28,
          sectionType: "TRAFFIC",
          simpleCategory: "JAM",
          magnitudeOfDelay: 1,
          delayInSeconds: 120,
        },
        {
          startPointIndex: 10,
          endPointIndex: 38,
          sectionType: "IMPORTANT_ROAD_STRETCH",
          streetName: { text: "Hosur Road" },
        },
        {
          startPointIndex: 0,
          endPointIndex: 9,
          sectionType: "IMPORTANT_ROAD_STRETCH",
          streetName: { text: "80 Feet Road" },
        },
        { startPointIndex: 22, endPointIndex: 38, sectionType: "MOTORWAY" },
      ],
      guidance: {
        instructions: [
          { routeOffsetInMeters: 0, maneuver: "DEPART", message: "Leave from 80 Feet Road" },
          { routeOffsetInMeters: 1200, maneuver: "TURN_RIGHT", message: "Turn right onto Hosur Road" },
          { routeOffsetInMeters: 5200, maneuver: "MAKE_UTURN", message: "Make a U-turn" },
          { routeOffsetInMeters: 6000, maneuver: "ENTER_MOTORWAY", message: "Take the elevated expressway" },
          { routeOffsetInMeters: 14800, maneuver: "ARRIVE", message: "You have arrived" },
        ],
      },
    },
    {
      // Around Silk Board through HSR and Haralur.
      summary: {
        lengthInMeters: 16900,
        travelTimeInSeconds: 3240,
        noTrafficTravelTimeInSeconds: 1900,
        historicTrafficTravelTimeInSeconds: 3200,
      },
      legs: [{ points: line([12.9352, 77.6245], [12.8452, 77.6602], [12.905, 77.662]) }],
      sections: [
        {
          startPointIndex: 4,
          endPointIndex: 30,
          sectionType: "IMPORTANT_ROAD_STRETCH",
          streetName: { text: "Hosur Road" },
        },
        {
          startPointIndex: 10,
          endPointIndex: 26,
          sectionType: "IMPORTANT_ROAD_STRETCH",
          streetName: { text: "Haralur Road" },
        },
      ],
      guidance: {
        instructions: [
          { routeOffsetInMeters: 0, maneuver: "DEPART", message: "Leave from 80 Feet Road" },
          { routeOffsetInMeters: 2000, maneuver: "TURN_LEFT", message: "Turn left onto 27th Main" },
          { routeOffsetInMeters: 16900, maneuver: "ARRIVE", message: "You have arrived" },
        ],
      },
    },
  ],
};

describe("TomTom request", () => {
  it("asks for alternatives, all travel times, traffic sections, and guidance", () => {
    const u = new URL(buildRouteUrl(KORA, ECITY, NOW, NOW, "KEY"));
    expect(u.pathname).toBe("/routing/1/calculateRoute/12.9352,77.6245:12.8452,77.6602/json");
    expect(u.searchParams.get("maxAlternatives")).toBe("3");
    expect(u.searchParams.get("computeTravelTimeFor")).toBe("all");
    expect(u.searchParams.get("traffic")).toBe("true");
    expect(u.searchParams.get("departAt")).toBe("now");
    expect(u.searchParams.get("instructionsType")).toBe("text");
    expect(u.searchParams.getAll("sectionType")).toEqual(["traffic", "motorway", "importantRoadStretch"]);
  });

  it("sends later departures in IST", () => {
    const later = new Date(NOW.getTime() + 30 * 60000);
    expect(new URL(buildRouteUrl(KORA, ECITY, later, NOW, "K")).searchParams.get("departAt")).toBe(
      "2026-10-13T18:30:00+05:30",
    );
  });
});

describe("TomTom parsing", () => {
  const { routes, estimates } = parseTomTom(FIXTURE, NOW, NOW);

  it("returns one route per TomTom route with real geometry", () => {
    expect(routes).toHaveLength(2);
    expect(routes[0].path[0]).toEqual([77.6245, 12.9352]);
    expect(routes[0].distanceKm).toBe(14.8);
  });

  it("labels routes by their main named road, never repeating a label", () => {
    expect(routes[0].label).toBe("via Hosur Road");
    expect(routes[1].label).toBe("via Haralur Road");
  });

  it("uses TomTom's traffic-aware time and builds an honest range", () => {
    const e = estimates.get("tt-0")!;
    expect(e.expected).toBe(50);
    expect(e.low).toBeGreaterThanOrEqual(25); // never faster than free flow
    expect(e.low).toBeLessThan(50);
    expect(e.high).toBeGreaterThanOrEqual(55); // at least TomTom's historic time
    expect(e.source).toBe("live");
  });

  it("labels later departures as historical, not live", () => {
    const later = parseTomTom(FIXTURE, new Date(NOW.getTime() + 60 * 60000), NOW);
    expect(later.estimates.get("tt-0")!.source).toBe("historical");
  });

  it("counts junctions, U-turns, merges, and jams from TomTom's own data", () => {
    const f = routes[0].features;
    expect(f.uTurns).toBe(1);
    expect(f.merges).toBe(1);
    // 1 turn from guidance, plus Silk Board's 4 junctions (it is on this path).
    expect(f.junctions).toBeGreaterThanOrEqual(5);
    // Jams: one major (2) + one minor (1), plus Silk Board's stop-and-go (3).
    expect(f.stopProneSegments).toBeGreaterThanOrEqual(6);
    expect(f.junctions).toBeGreaterThan(routes[1].features.junctions);
    expect(routes[0].roadClass).toBe("highway"); // expressway covers 39% of the points
  });

  it("turns guidance into steps with distances", () => {
    expect(routes[0].steps[1]).toEqual({ instruction: "Turn right onto Hosur Road", distanceKm: 4 });
  });

  it("feeds the engine: Silk Board is detected on the real path and the detour is explained", () => {
    const cands = routes.map((route) => ({
      route,
      estimate: estimates.get(route.id)!,
      context: routeContext(route.path, NOW, estimates.get(route.id)!.expected),
    }));
    expect(cands[0].context.chokepoints.some((z) => z.id === "silk-board")).toBe(true);
    expect(cands[1].context.chokepoints.some((z) => z.id === "silk-board")).toBe(false);
    const ranked = rankRoutes(cands, DEFAULT_WEIGHTS, { departure: NOW, now: NOW });
    expect(ranked.every((r) => r.confidence === "live")).toBe(true);
    const around = ranked.find((r) => r.candidate.route.id === "tt-1")!;
    expect(around.reasons[0].key).toBe("avoids");
    expect(around.reasons[0].params.zone).toBe("Silk Board junction");
  });

  it("survives an empty or odd response", () => {
    expect(parseTomTom({}, NOW, NOW).routes).toEqual([]);
    expect(
      parseTomTom({ routes: [{ summary: { lengthInMeters: 1, travelTimeInSeconds: 1 }, legs: [] }] }, NOW, NOW).routes,
    ).toEqual([]);
  });
});

describe("TomTom provider errors", () => {
  const respond = (status: number) => vi.fn(async () => new Response("<xml/>", { status }));
  it.each([
    [403, "provider_auth"],
    [429, "provider_quota"],
    [400, "no_route"],
    [500, "provider_failed"],
  ])("maps HTTP %i to %s", async (status, code) => {
    const p = new TomTomProvider("K", respond(status) as unknown as typeof fetch, () => NOW);
    await expect(p.getAlternatives(KORA, ECITY, NOW)).rejects.toMatchObject({ code });
  });

  it("maps a network failure to provider_failed", async () => {
    const boom = vi.fn(async () => {
      throw new Error("offline");
    });
    const p = new TomTomProvider("K", boom as unknown as typeof fetch, () => NOW);
    await expect(p.getAlternatives(KORA, ECITY, NOW)).rejects.toBeInstanceOf(TomTomError);
  });

  it("serves travel times from the same call, with no second request", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(FIXTURE), { status: 200 }));
    const p = new TomTomProvider("K", f as unknown as typeof fetch, () => NOW);
    const routes = await p.getAlternatives(KORA, ECITY, NOW);
    const e = await p.getTravelTimes(routes[1]);
    expect(e.expected).toBe(54);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("TomTom search", () => {
  it("keeps Bengaluru results, drops others, labels POIs with their area", () => {
    const out = parseSearch([
      {
        id: "1",
        poi: { name: "Forum Mall" },
        address: { municipalitySubdivision: "Koramangala" },
        position: { lat: 12.9346, lon: 77.6113 },
      },
      { id: "2", address: { freeformAddress: "MG Road, Pune" }, position: { lat: 18.52, lon: 73.85 } },
      {
        id: "3",
        address: { freeformAddress: "27th Main Road, HSR Layout, Bengaluru" },
        position: { lat: 12.912, lon: 77.645 },
      },
    ]);
    expect(out.map((r) => r.label)).toEqual(["Forum Mall, Koramangala", "27th Main Road, HSR Layout, Bengaluru"]);
  });

  it("biases the query to Bengaluru and India", async () => {
    const f = vi.fn(async (_url: string) => new Response(JSON.stringify({ results: [] }), { status: 200 }));
    await new TomTomGeocoder("K", f as unknown as typeof fetch).search("forum mall");
    const u = new URL(f.mock.calls[0][0] as string);
    expect(u.pathname).toBe("/search/2/search/forum%20mall.json");
    expect(u.searchParams.get("countrySet")).toBe("IN");
    expect(u.searchParams.get("typeahead")).toBe("true");
  });
});

describe("one-variable setup", () => {
  it("just TOMTOM_API_KEY switches routes, traffic, and search to TomTom (live mode)", () => {
    const env = { TOMTOM_API_KEY: "abc" } as unknown as NodeJS.ProcessEnv;
    const p = getProviders(env);
    expect([p.route.name, p.traffic.name, p.mode]).toEqual(["tomtom", "tomtom", "live"]);
    expect(p.route).toBe(p.traffic);
    expect(getGeocoders(env).remote?.name).toBe("tomtom");
  });

  it("no keys means demo mode", () => {
    const p = getProviders({} as unknown as NodeJS.ProcessEnv);
    expect(p.mode).toBe("demo");
    expect(getGeocoders({} as unknown as NodeJS.ProcessEnv).remote).toBeNull();
  });
});
