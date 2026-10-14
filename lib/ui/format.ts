import type { Confidence, RankedRoute, Reason } from "@/lib/engine/types";
import { en, fmt } from "@/messages/en";
import { tomorrowAt8Ist } from "@/lib/geo/time";

export type DepartureChoice = "now" | "plus30" | "tomorrow8";

export function departureDate(choice: DepartureChoice, now: Date): Date {
  if (choice === "plus30") return new Date(now.getTime() + 30 * 60000);
  if (choice === "tomorrow8") return tomorrowAt8Ist(now);
  return now;
}

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const dayFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export function whenLabel(choice: DepartureChoice, d: Date): string {
  const t = timeFmt.format(d).replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);
  if (choice === "now") return `now (${t})`;
  if (choice === "tomorrow8") return `tomorrow at ${t}`;
  return `${t} today`;
}

export function dateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? iso : dayFmt.format(d);
}

function deltaClause(delta: number): string {
  if (delta >= 2) return fmt(en.reasons.adds, { n: delta });
  if (delta <= -2) return fmt(en.reasons.saves, { n: Math.abs(delta) });
  return en.reasons.same;
}

export function reasonText(r: Reason): string {
  const m = en.reasons;
  const p = r.params;
  const withDelta = (sentence: string) => `${sentence} ${deltaClause(Number(p.delta))}`;
  switch (r.key) {
    case "fastest":
      return m.fastest;
    case "fastestThrough":
      return fmt(m.fastestThrough, p);
    case "fastestAvoids":
      return fmt(m.fastestAvoids, p);
    case "avoids":
      return withDelta(
        Number(p.worstCaseGain) > 0 ? fmt(m.avoidsGain, { zone: p.zone, gain: p.worstCaseGain }) : fmt(m.avoids, p),
      );
    case "avoidsFlood":
      return withDelta(fmt(m.avoidsFlood, p));
    case "avoidsWorks":
      return withDelta(fmt(m.avoidsWorks, p));
    case "calmer":
      return withDelta(Number(p.signals) >= 2 ? fmt(m.calmerSignals, p) : m.calmer);
    case "steadier":
      return withDelta(fmt(m.steadier, p));
    case "slower":
      return Number(p.delta) < 2 ? m.tie : fmt(m.slower, p);
    case "floodRisk":
      return fmt(m.floodRisk, p);
    case "works":
      return fmt(m.works, p);
  }
}

/** 0-100 stress to a short word. */
export function calmWord(stress: number): string {
  const w = en.results.calmWords;
  if (stress < 30) return w[0];
  if (stress < 50) return w[1];
  if (stress < 70) return w[2];
  return w[3];
}

export function confidenceLabel(c: Confidence): string {
  return en.confidence[c];
}

export function deltaLabel(r: RankedRoute): string {
  if (r.isFastest) return en.results.fastest;
  if (r.deltaVsFastest === 0) return en.results.sameTime;
  return r.deltaVsFastest > 0
    ? fmt(en.results.slower, { n: r.deltaVsFastest })
    : fmt(en.results.faster, { n: Math.abs(r.deltaVsFastest) });
}

/** The full sentence a screen reader hears for a card. */
export function srCardLabel(r: RankedRoute): string {
  const m = en.results;
  const e = r.candidate.estimate;
  let calmer: string;
  if (r.calmerPct >= 5) calmer = fmt(m.srCalmer, { pct: r.calmerPct });
  else if (r.calmerPct <= -5) calmer = fmt(m.srBusier, { pct: Math.abs(r.calmerPct) });
  else calmer = m.srSame;
  const delta = r.isFastest
    ? m.srFastest
    : r.deltaVsFastest >= 0
      ? fmt(m.srSlower, { n: r.deltaVsFastest, calmer })
      : fmt(m.srFaster, { n: Math.abs(r.deltaVsFastest) });
  return fmt(m.srCard, {
    rank: r.rank,
    label: r.candidate.route.label,
    expected: e.expected,
    low: e.low,
    high: e.high,
    delta,
    stress: r.stress,
    calm: calmWord(r.stress).toLowerCase(),
    confidence: confidenceLabel(r.confidence),
    reason: reasonText(r.reasons[0]),
  });
}
