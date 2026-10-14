import { z } from "zod";
import { inBengaluru } from "@/lib/geo/geo";

export const PlaceSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    lat: z.number().finite(),
    lng: z.number().finite(),
  })
  .refine((p) => inBengaluru(p.lat, p.lng), { message: "outside_bengaluru" });

export const RoutesRequestSchema = z.object({
  origin: PlaceSchema,
  destination: PlaceSchema,
  /** ISO timestamp. Omit for "now". */
  departureTime: z.string().datetime({ offset: true }).optional(),
});
export type RoutesRequest = z.infer<typeof RoutesRequestSchema>;

const LngLatSchema = z.tuple([z.number(), z.number()]);
const HitSchema = z.object({ id: z.string(), name: z.string(), at: z.number() });

export const CandidateSchema = z.object({
  route: z.object({
    id: z.string(),
    label: z.string(),
    distanceKm: z.number(),
    path: z.array(LngLatSchema),
    roadClass: z.enum(["highway", "orr", "arterial", "residential"]),
    features: z.object({
      signals: z.number(),
      junctions: z.number(),
      uTurns: z.number(),
      merges: z.number(),
      stopProneSegments: z.number(),
    }),
    steps: z.array(z.object({ instruction: z.string(), distanceKm: z.number() })),
  }),
  estimate: z.object({
    expected: z.number(),
    low: z.number(),
    high: z.number(),
    source: z.enum(["live", "historical", "mock"]),
    fetchedAt: z.string(),
  }),
  context: z.object({
    chokepoints: z.array(HitSchema.extend({ inPeak: z.boolean(), delayMin: z.number() })),
    works: z.array(HitSchema.extend({ delayMin: z.number(), closure: z.boolean() })),
    floods: z.array(HitSchema.extend({ penaltyMin: z.number() })),
    monsoonActive: z.boolean(),
  }),
});

export const RoutesResponseSchema = z.object({
  candidates: z.array(CandidateSchema),
  mode: z.enum(["demo", "live"]),
  departureTime: z.string(),
  generatedAt: z.string(),
  cached: z.boolean(),
  layers: z.array(
    z.object({
      id: z.enum(["zones", "construction", "flood"]),
      lastVerified: z.string(),
      verification: z.enum(["seed", "field"]),
    }),
  ),
  monsoonActive: z.boolean(),
});
export type RoutesResponse = z.infer<typeof RoutesResponseSchema>;

export const GeocodeResponseSchema = z.object({
  results: z.array(z.object({ id: z.string(), label: z.string(), lat: z.number(), lng: z.number() })),
  mode: z.enum(["demo", "live"]),
});
export type GeocodeResponse = z.infer<typeof GeocodeResponseSchema>;
