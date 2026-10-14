import type { Candidate, RouteFeatures } from "@/lib/engine/types";

export const NOW = new Date("2026-10-13T12:30:00.000Z"); // 18:00 IST

const calmFeatures: RouteFeatures = { signals: 0, junctions: 0, uTurns: 0, merges: 0, stopProneSegments: 0 };

export function candidate(
  id: string,
  opts: {
    expected?: number;
    low?: number;
    high?: number;
    distanceKm?: number;
    features?: Partial<RouteFeatures>;
    source?: "live" | "historical" | "mock";
    fetchedAt?: string;
    chokepoints?: { id: string; name: string; inPeak?: boolean; delayMin?: number }[];
    floods?: { id: string; name: string; penaltyMin: number }[];
    works?: { id: string; name: string; delayMin: number; closure?: boolean }[];
    monsoon?: boolean;
  } = {},
): Candidate {
  const expected = opts.expected ?? 40;
  return {
    route: {
      id,
      label: `via ${id}`,
      distanceKm: opts.distanceKm ?? 15,
      path: [
        [77.6, 12.9],
        [77.7, 13.0],
      ],
      roadClass: "arterial",
      features: { ...calmFeatures, ...opts.features },
      steps: [],
    },
    estimate: {
      expected,
      low: opts.low ?? expected - 4,
      high: opts.high ?? expected + 6,
      source: opts.source ?? "live",
      fetchedAt: opts.fetchedAt ?? NOW.toISOString(),
    },
    context: {
      chokepoints: (opts.chokepoints ?? []).map((z) => ({
        id: z.id,
        name: z.name,
        at: 0.5,
        inPeak: z.inPeak ?? true,
        delayMin: z.delayMin ?? 15,
      })),
      works: (opts.works ?? []).map((w) => ({ ...w, at: 0.5, closure: w.closure ?? false })),
      floods: (opts.floods ?? []).map((f) => ({ ...f, at: 0.5 })),
      monsoonActive: opts.monsoon ?? false,
    },
  };
}

/** Stress-minute difference between features on a 15 km route. */
export const BUSY: Partial<RouteFeatures> = { signals: 40, junctions: 20, stopProneSegments: 12, uTurns: 4 };
