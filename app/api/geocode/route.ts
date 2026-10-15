import { NextResponse } from "next/server";
import { getGeocoders } from "@/lib/providers";
import { MemoryCache } from "@/lib/server/cache";
import { checkRateLimit, clientIp, logProviderCall, takeProviderCall } from "@/lib/server/limits";
import type { GeocodeResponse } from "@/lib/schema";

export const dynamic = "force-dynamic";
type Results = GeocodeResponse["results"];
const cache = new MemoryCache<Results>(300, 1000);

/**
 * Local neighbourhood list first (free, instant). TomTom only when the query is at least
 * 3 characters and the local list has fewer than 3 matches, to protect the daily quota.
 */
export async function GET(req: Request) {
  const limit = checkRateLimit(`geo:${clientIp(req.headers)}`);
  if (!limit.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length > 80) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const { local, remote } = getGeocoders();
  const mode = remote ? "live" : "demo";
  const localResults = await local.search(q);
  if (!remote || q.length < 3 || localResults.length >= 3) {
    return NextResponse.json({ results: localResults, mode } satisfies GeocodeResponse);
  }

  const key = q.toLowerCase();
  let remoteResults = cache.get(key);
  if (!remoteResults && takeProviderCall()) {
    const t0 = Date.now();
    try {
      remoteResults = await remote.search(q);
      cache.set(key, remoteResults);
      logProviderCall({ provider: remote.name, kind: "geocode", ms: Date.now() - t0, ok: true });
    } catch {
      logProviderCall({ provider: remote.name, kind: "geocode", ms: Date.now() - t0, ok: false });
      remoteResults = [];
    }
  }
  const labels = new Set(localResults.map((r) => r.label.toLowerCase()));
  const merged = [...localResults, ...(remoteResults ?? []).filter((r) => !labels.has(r.label.toLowerCase()))].slice(
    0,
    6,
  );
  return NextResponse.json({ results: merged, mode } satisfies GeocodeResponse);
}
