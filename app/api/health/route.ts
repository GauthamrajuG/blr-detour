import { NextResponse } from "next/server";
import { getGeocoders, getProviders } from "@/lib/providers";
import { LAYER_FRESHNESS } from "@/lib/geo/zones";

export const dynamic = "force-dynamic";

/** Reports which providers are active. Never echoes key values, only whether they are set. */
export async function GET() {
  const p = getProviders();
  return NextResponse.json({
    ok: true,
    mode: p.mode,
    providers: {
      route: p.route.name,
      traffic: p.traffic.name,
      geocode: getGeocoders().remote ? "gazetteer+tomtom" : "gazetteer",
    },
    keys: {
      GOOGLE_MAPS_API_KEY: Boolean(process.env.GOOGLE_MAPS_API_KEY),
      TOMTOM_API_KEY: Boolean(process.env.TOMTOM_API_KEY),
      DATABASE_URL: Boolean(process.env.DATABASE_URL),
    },
    notes: p.notes,
    layers: LAYER_FRESHNESS,
    time: new Date().toISOString(),
  });
}
