import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, STRESS_MINUTES_AT_100 } from "@/lib/engine/config";
import {
  breakdownFor,
  confidenceFor,
  predictabilityMinutes,
  rankRoutes,
  stressScore,
  weightMultiplier,
} from "@/lib/engine/score";
import { BUSY, NOW, candidate } from "./fixtures";

const opts = { departure: NOW, now: NOW };

describe("ranking stability", () => {
  it("returns the same order for equal inputs regardless of input order", () => {
    const a = candidate("a");
    const b = candidate("b");
    const c = candidate("c");
    const r1 = rankRoutes([a, b, c], DEFAULT_WEIGHTS, opts).map((r) => r.candidate.route.id);
    const r2 = rankRoutes([c, a, b], DEFAULT_WEIGHTS, opts).map((r) => r.candidate.route.id);
    const r3 = rankRoutes([b, c, a], DEFAULT_WEIGHTS, opts).map((r) => r.candidate.route.id);
    expect(r1).toEqual(["a", "b", "c"]);
    expect(r2).toEqual(r1);
    expect(r3).toEqual(r1);
  });

  it("is deterministic across repeated calls", () => {
    const list = [candidate("x", { expected: 30 }), candidate("y", { expected: 31, features: BUSY })];
    const runs = Array.from({ length: 5 }, () =>
      rankRoutes(list, DEFAULT_WEIGHTS, opts).map((r) => [r.candidate.route.id, r.score]),
    );
    for (const run of runs) expect(run).toEqual(runs[0]);
  });

  it("returns an empty list for no candidates", () => {
    expect(rankRoutes([], DEFAULT_WEIGHTS, opts)).toEqual([]);
  });
});

describe("weights change the top recommendation", () => {
  // Fast but stop-and-go versus 6 minutes slower and calm.
  const fastBusy = candidate("fast-busy", { expected: 36, features: BUSY });
  const slowCalm = candidate("slow-calm", { expected: 42 });

  it("time-heavy weights pick the faster route", () => {
    const top = rankRoutes([fastBusy, slowCalm], { time: 10, calm: 0, predictability: 0, flood: 0 }, opts)[0];
    expect(top.candidate.route.id).toBe("fast-busy");
  });

  it("calm-heavy weights flip the top pick", () => {
    const top = rankRoutes([fastBusy, slowCalm], { time: 5, calm: 10, predictability: 3, flood: 5 }, opts)[0];
    expect(top.candidate.route.id).toBe("slow-calm");
  });

  it("the flood weight flips the pick when the monsoon layer is active", () => {
    const flooded = candidate("flooded", {
      expected: 35,
      monsoon: true,
      floods: [{ id: "f", name: "ORR near Ecospace", penaltyMin: 12 }],
    });
    const dry = candidate("dry", { expected: 40, monsoon: true });
    expect(rankRoutes([flooded, dry], { ...DEFAULT_WEIGHTS, flood: 0 }, opts)[0].candidate.route.id).toBe("flooded");
    expect(rankRoutes([flooded, dry], { ...DEFAULT_WEIGHTS, flood: 10 }, opts)[0].candidate.route.id).toBe("dry");
  });

  it("ignores flood penalties outside the monsoon window", () => {
    const flooded = candidate("flooded", {
      expected: 35,
      monsoon: false,
      floods: [{ id: "f", name: "ORR near Ecospace", penaltyMin: 12 }],
    });
    const dry = candidate("dry", { expected: 40 });
    expect(rankRoutes([flooded, dry], { ...DEFAULT_WEIGHTS, flood: 10 }, opts)[0].candidate.route.id).toBe("flooded");
  });
});

describe('the "estimated, not live" flag', () => {
  it("marks fresh live data as live", () => {
    expect(confidenceFor(candidate("a").estimate, NOW, NOW)).toBe("live");
  });

  it("marks stale live data as estimated", () => {
    const old = new Date(NOW.getTime() - 30 * 60000).toISOString();
    const e = candidate("a", { fetchedAt: old }).estimate;
    expect(confidenceFor(e, NOW, NOW)).toBe("estimated");
    expect(rankRoutes([candidate("a", { fetchedAt: old })], DEFAULT_WEIGHTS, opts)[0].confidence).toBe("estimated");
  });

  it("marks a live number for a departure two hours ahead as estimated", () => {
    const later = new Date(NOW.getTime() + 120 * 60000);
    expect(confidenceFor(candidate("a").estimate, later, NOW)).toBe("estimated");
  });

  it("never calls mock or unparseable timestamps live", () => {
    expect(confidenceFor(candidate("a", { source: "mock" }).estimate, NOW, NOW)).toBe("estimated");
    expect(confidenceFor(candidate("a", { fetchedAt: "not a date" }).estimate, NOW, NOW)).toBe("estimated");
  });

  it("labels historical data as historical", () => {
    expect(confidenceFor(candidate("a", { source: "historical" }).estimate, NOW, NOW)).toBe("historical");
  });
});

describe("4 min longer but 20 min calmer", () => {
  // "20 minutes calmer" means 20 fewer stress-minute equivalents.
  // On a 15 km route, a stress gap of 67 points is 20 minutes (STRESS_MINUTES_AT_100 = 30, density 8 events/km = 100).
  const busy = candidate("busy", { expected: 38, features: { signals: 70, stopProneSegments: 30 } });
  const calm = candidate("calm", { expected: 42, features: { signals: 10, stopProneSegments: 4 } });

  it("fixture sanity: the calm route really is about 20 minutes calmer", () => {
    const gap = breakdownFor(busy).stressMin - breakdownFor(calm).stressMin;
    expect(gap).toBeGreaterThanOrEqual(19);
    expect(gap).toBeLessThanOrEqual(STRESS_MINUTES_AT_100);
  });

  it("ranks the calm route first when the calm weight is high", () => {
    const ranked = rankRoutes([busy, calm], { time: 5, calm: 9, predictability: 3, flood: 5 }, opts);
    expect(ranked[0].candidate.route.id).toBe("calm");
    expect(ranked[0].deltaVsFastest).toBe(4);
    expect(ranked[0].isFastest).toBe(false);
  });

  it("ranks the busy route first when calm is switched off", () => {
    const ranked = rankRoutes([busy, calm], { time: 5, calm: 0, predictability: 3, flood: 5 }, opts);
    expect(ranked[0].candidate.route.id).toBe("busy");
  });
});

describe("components", () => {
  it("maps sliders to multipliers and clamps", () => {
    expect(weightMultiplier(5)).toBe(1);
    expect(weightMultiplier(0)).toBe(0);
    expect(weightMultiplier(10)).toBe(2);
    expect(weightMultiplier(99)).toBe(2);
    expect(weightMultiplier(-3)).toBe(0);
  });

  it("stress is 0 for an empty road and capped at 100", () => {
    expect(stressScore({ signals: 0, junctions: 0, uTurns: 0, merges: 0, stopProneSegments: 0 }, 10)).toBe(0);
    expect(stressScore({ signals: 500, junctions: 0, uTurns: 0, merges: 0, stopProneSegments: 0 }, 10)).toBe(100);
  });

  it("predictability penalty grows with the spread", () => {
    const tight = candidate("t", { expected: 40, low: 38, high: 42 }).estimate;
    const wide = candidate("w", { expected: 40, low: 30, high: 60 }).estimate;
    expect(predictabilityMinutes(wide)).toBeGreaterThan(predictabilityMinutes(tight));
  });

  it("a known closure sinks a route", () => {
    const closed = candidate("closed", {
      expected: 30,
      works: [{ id: "w", name: "Works", delayMin: 0, closure: true }],
    });
    const open = candidate("open", { expected: 50 });
    expect(rankRoutes([closed, open], DEFAULT_WEIGHTS, opts)[0].candidate.route.id).toBe("open");
  });
});

describe("reasons", () => {
  it("names the chokepoint a slower route avoids", () => {
    const viaSilk = candidate("silk", {
      expected: 40,
      high: 58,
      chokepoints: [{ id: "silk-board", name: "Silk Board junction", delayMin: 18 }],
    });
    const around = candidate("around", { expected: 44, high: 50 });
    const ranked = rankRoutes([viaSilk, around], DEFAULT_WEIGHTS, opts);
    const r = ranked.find((x) => x.candidate.route.id === "around")!;
    expect(r.reasons[0]).toEqual({
      key: "avoids",
      params: { zone: "Silk Board junction", delta: 4, worstCaseGain: 8 },
    });
    const f = ranked.find((x) => x.isFastest)!;
    expect(f.reasons[0]).toEqual({ key: "fastestThrough", params: { zone: "Silk Board junction" } });
  });

  it("explains a win on flood risk instead of calling it 'slower'", () => {
    const flooded = candidate("flooded", {
      expected: 80,
      monsoon: true,
      floods: [{ id: "eco", name: "Outer Ring Road near Ecospace", penaltyMin: 12 }],
    });
    const dry = candidate("dry", { expected: 88, monsoon: true });
    const ranked = rankRoutes([flooded, dry], DEFAULT_WEIGHTS, opts);
    expect(ranked[0].candidate.route.id).toBe("dry");
    expect(ranked[0].reasons[0]).toEqual({
      key: "avoidsFlood",
      params: { road: "Outer Ring Road near Ecospace", delta: 8 },
    });
  });

  it("never gives a non-fastest top pick the 'slower' reason", () => {
    const fixtures = [
      [candidate("a", { expected: 30, features: BUSY }), candidate("b", { expected: 34 })],
      [candidate("a", { expected: 30, low: 20, high: 60 }), candidate("b", { expected: 33, low: 31, high: 36 })],
      [
        candidate("a", { expected: 30, works: [{ id: "w", name: "Metro works", delayMin: 9 }] }),
        candidate("b", { expected: 33 }),
      ],
    ];
    for (const list of fixtures) {
      const top = rankRoutes(list, DEFAULT_WEIGHTS, opts)[0];
      if (!top.isFastest) expect(top.reasons[0].key).not.toBe("slower");
    }
  });

  it("adds a flood note only in monsoon", () => {
    const f = { id: "f", name: "Yemalur main road", penaltyMin: 10 };
    const on = rankRoutes([candidate("a", { floods: [f], monsoon: true })], DEFAULT_WEIGHTS, opts)[0];
    const off = rankRoutes([candidate("a", { floods: [f], monsoon: false })], DEFAULT_WEIGHTS, opts)[0];
    expect(on.reasons.some((r) => r.key === "floodRisk")).toBe(true);
    expect(off.reasons.some((r) => r.key === "floodRisk")).toBe(false);
  });
});
