import * as C from "./config";
import type {
  Breakdown,
  Candidate,
  Confidence,
  RankedRoute,
  Reason,
  RouteFeatures,
  TravelTimeEstimate,
  Weights,
} from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Slider value (0-10) to a multiplier. 5 maps to 1.0, 0 to 0, 10 to 2.0. */
export function weightMultiplier(slider: number): number {
  return clamp(slider, C.SLIDER_MIN, C.SLIDER_MAX) / C.SLIDER_NEUTRAL;
}

/** Stress 0-100 from event density per km. Lower is calmer. */
export function stressScore(f: RouteFeatures, distanceKm: number): number {
  const w = C.STRESS_EVENT_WEIGHTS;
  const weighted =
    f.signals * w.signals +
    f.junctions * w.junctions +
    f.uTurns * w.uTurns +
    f.merges * w.merges +
    f.stopProneSegments * w.stopProneSegments;
  const perKm = weighted / Math.max(distanceKm, 0.5);
  return Math.round(clamp((perKm / C.STRESS_DENSITY_AT_100) * 100, 0, 100));
}

export function stressMinutes(stress: number): number {
  return (stress / 100) * C.STRESS_MINUTES_AT_100;
}

/** Penalty proportional to (high - low) / expected, in minutes. */
export function predictabilityMinutes(e: TravelTimeEstimate): number {
  if (e.expected <= 0) return 0;
  const ratio = Math.max(0, e.high - e.low) / e.expected;
  return ratio * C.PREDICTABILITY_MINUTES_PER_UNIT_SPREAD;
}

export function riskMinutes(c: Candidate): number {
  const ctx = c.context;
  const works = ctx.works.reduce(
    (sum, w) => sum + (w.closure ? C.CLOSURE_PENALTY_MIN : w.delayMin * C.WORKS_RISK_FACTOR),
    0,
  );
  const flood = ctx.monsoonActive ? ctx.floods.reduce((sum, f) => sum + f.penaltyMin * C.FLOOD_RISK_FACTOR, 0) : 0;
  return works + flood;
}

export function breakdownFor(c: Candidate): Breakdown & { stress: number } {
  const stress = stressScore(c.route.features, c.route.distanceKm);
  return {
    stress,
    timeMin: c.estimate.expected,
    stressMin: stressMinutes(stress),
    predictabilityMin: predictabilityMinutes(c.estimate),
    riskMin: riskMinutes(c),
  };
}

export function scoreFrom(b: Breakdown, w: Weights): number {
  return (
    weightMultiplier(w.time) * b.timeMin +
    weightMultiplier(w.calm) * b.stressMin +
    weightMultiplier(w.predictability) * b.predictabilityMin +
    weightMultiplier(w.flood) * b.riskMin
  );
}

/**
 * Which badge to show. Anything not demonstrably live and fresh is never called live.
 * - mock data: "estimated"
 * - historical: "historical"
 * - live but old, or for a departure well in the future: "estimated"
 */
export function confidenceFor(e: TravelTimeEstimate, departure: Date, now: Date): Confidence {
  if (e.source === "historical") return "historical";
  if (e.source !== "live") return "estimated";
  const ageMin = (now.getTime() - new Date(e.fetchedAt).getTime()) / 60000;
  if (!Number.isFinite(ageMin) || ageMin > C.LIVE_STALE_AFTER_MIN) return "estimated";
  const aheadMin = (departure.getTime() - now.getTime()) / 60000;
  if (aheadMin > C.LIVE_FUTURE_DEPARTURE_MAX_MIN) return "estimated";
  return "live";
}

interface RankOptions {
  departure: Date;
  now: Date;
}

/**
 * Score and rank candidates. Pure and deterministic.
 * Ties are broken by expected time, then distance, then route id, so equal inputs
 * always come back in the same order.
 */
export function rankRoutes(candidates: Candidate[], weights: Weights, opts: RankOptions): RankedRoute[] {
  if (candidates.length === 0) return [];

  const scored = candidates.map((candidate) => {
    const b = breakdownFor(candidate);
    const { stress, ...breakdown } = b;
    return { candidate, breakdown, stress, score: scoreFrom(breakdown, weights) };
  });

  const fastest = [...scored].sort(
    (a, b) =>
      a.candidate.estimate.expected - b.candidate.estimate.expected ||
      a.candidate.route.id.localeCompare(b.candidate.route.id),
  )[0];

  const ordered = [...scored].sort(
    (a, b) =>
      round2(a.score) - round2(b.score) ||
      a.candidate.estimate.expected - b.candidate.estimate.expected ||
      a.candidate.route.distanceKm - b.candidate.route.distanceKm ||
      a.candidate.route.id.localeCompare(b.candidate.route.id),
  );

  return ordered.map((s, i) => {
    const isFastest = s === fastest;
    const calmerPct = fastest.stress > 0 ? Math.round(((fastest.stress - s.stress) / fastest.stress) * 100) : 0;
    return {
      candidate: s.candidate,
      rank: i + 1,
      score: round2(s.score),
      breakdown: s.breakdown,
      stress: s.stress,
      deltaVsFastest: s.candidate.estimate.expected - fastest.candidate.estimate.expected,
      isFastest,
      calmerPct,
      confidence: confidenceFor(s.candidate.estimate, opts.departure, opts.now),
      reasons: buildReasons(
        { candidate: s.candidate, breakdown: s.breakdown },
        { candidate: fastest.candidate, breakdown: fastest.breakdown },
        isFastest,
        candidates,
        weights,
      ),
    };
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Plain-English reasons as message keys plus params, so the UI can translate them.
 * The first reason is the headline "why"; the rest are notes.
 *
 * For a route that is not the fastest, the headline explains the score: a peak
 * chokepoint it avoids comes first (the most concrete reason), otherwise whichever
 * weighted part of the score (calm, predictability, flood/works risk) gives it the
 * biggest edge over the fastest route. Because weights feed in, the reason changes
 * honestly when the user moves a slider.
 */
export function buildReasons(
  me: { candidate: Candidate; breakdown: Breakdown },
  fast: { candidate: Candidate; breakdown: Breakdown },
  isFastest: boolean,
  all: Candidate[] = [],
  weights: Weights = DEFAULT_REASON_WEIGHTS,
): Reason[] {
  const c = me.candidate;
  const fastest = fast.candidate;
  const out: Reason[] = [];
  const peakHere = c.context.chokepoints.filter((z) => z.inPeak);

  if (isFastest) {
    if (peakHere.length > 0) {
      out.push({ key: "fastestThrough", params: { zone: worst(peakHere).name } });
    } else {
      const others = all.flatMap((o) => (o === c ? [] : o.context.chokepoints.filter((z) => z.inPeak)));
      if (others.length > 0) out.push({ key: "fastestAvoids", params: { zone: worst(others).name } });
      else out.push({ key: "fastest", params: {} });
    }
  } else {
    const delta = Math.round(c.estimate.expected - fastest.estimate.expected);
    const mine = new Set(c.context.chokepoints.map((z) => z.id));
    const avoided = fastest.context.chokepoints.filter((z) => z.inPeak && !mine.has(z.id));

    if (avoided.length > 0) {
      const worstCaseGain = fastest.estimate.high - c.estimate.high;
      out.push({
        key: "avoids",
        params: {
          zone: worst(avoided).name,
          delta,
          worstCaseGain: worstCaseGain >= C.REASON_MIN_DELTA_MIN ? Math.round(worstCaseGain) : 0,
        },
      });
    } else {
      const edge = {
        calm: weightMultiplier(weights.calm) * (fast.breakdown.stressMin - me.breakdown.stressMin),
        pred:
          weightMultiplier(weights.predictability) *
          (fast.breakdown.predictabilityMin - me.breakdown.predictabilityMin),
        risk: weightMultiplier(weights.flood) * (fast.breakdown.riskMin - me.breakdown.riskMin),
      };
      const [best, value] = (Object.entries(edge) as [keyof typeof edge, number][]).reduce((a, b) =>
        b[1] > a[1] ? b : a,
      );
      const myFloods = new Set(c.context.floods.map((f) => f.id));
      const myWorks = new Set(c.context.works.map((w) => w.id));
      const floodAvoided = fastest.context.monsoonActive
        ? fastest.context.floods.find((f) => !myFloods.has(f.id))
        : undefined;
      const worksAvoided = fastest.context.works.find((w) => !myWorks.has(w.id));

      if (value < 1) {
        out.push({ key: "slower", params: { delta } });
      } else if (best === "risk" && floodAvoided) {
        out.push({ key: "avoidsFlood", params: { road: floodAvoided.name, delta } });
      } else if (best === "risk" && worksAvoided) {
        out.push({ key: "avoidsWorks", params: { name: worksAvoided.name, delta } });
      } else if (best === "pred") {
        const spreadGain = fastest.estimate.high - fastest.estimate.low - (c.estimate.high - c.estimate.low);
        out.push({ key: "steadier", params: { minutes: Math.max(1, Math.round(spreadGain)), delta } });
      } else {
        const fewerSignals = fastest.route.features.signals - c.route.features.signals;
        out.push({ key: "calmer", params: { signals: Math.max(0, fewerSignals), delta } });
      }
    }
  }

  if (c.context.monsoonActive && c.context.floods.length > 0) {
    out.push({ key: "floodRisk", params: { road: c.context.floods[0].name } });
  }
  if (c.context.works.length > 0) {
    out.push({ key: "works", params: { name: c.context.works[0].name } });
  }
  return out;
}

const DEFAULT_REASON_WEIGHTS: Weights = C.DEFAULT_WEIGHTS;

function worst<T extends { delayMin: number }>(zones: T[]): T {
  return zones.reduce((a, b) => (b.delayMin > a.delayMin ? b : a));
}
