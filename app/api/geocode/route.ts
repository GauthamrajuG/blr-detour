import { NextResponse } from "next/server";
import { GazetteerGeocoder } from "@/lib/server/gazetteer";
import { checkRateLimit, clientIp } from "@/lib/server/limits";
import type { GeocodeResponse } from "@/lib/schema";

export const dynamic = "force-dynamic";
const geocoder = new GazetteerGeocoder();

export async function GET(req: Request) {
  const limit = checkRateLimit(`geo:${clientIp(req.headers)}`);
  if (!limit.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.length > 80) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const results = await geocoder.search(q);
  return NextResponse.json({ results, mode: "demo" } satisfies GeocodeResponse);
}
