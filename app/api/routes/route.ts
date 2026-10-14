import { NextResponse } from "next/server";
import { RoutesRequestSchema, type RoutesResponse } from "@/lib/schema";
import { MemoryCache, routeCacheKey } from "@/lib/server/cache";
import { checkRateLimit, clientIp, takeProviderCall } from "@/lib/server/limits";
import { planTrip } from "@/lib/server/plan";
import { LAYER_FRESHNESS, isMonsoon } from "@/lib/geo/zones";
import { ProviderNotConfiguredError } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

const cache = new MemoryCache<Omit<RoutesResponse, "cached">>();

/** Error bodies carry a stable code; the UI maps codes to plain-English messages. */
function fail(status: number, code: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: code, ...extra }, { status });
}

export async function POST(req: Request) {
  const limit = checkRateLimit(clientIp(req.headers));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: limit.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request");
  }
  const parsed = RoutesRequestSchema.safeParse(body);
  if (!parsed.success) {
    const outside = parsed.error.issues.some((i) => i.message === "outside_bengaluru");
    return fail(400, outside ? "outside_bengaluru" : "bad_request");
  }

  const { origin, destination } = parsed.data;
  const now = new Date();
  const departure = parsed.data.departureTime ? new Date(parsed.data.departureTime) : now;
  if (departure.getTime() < now.getTime() - 10 * 60000) return fail(400, "departure_in_past");

  const key = routeCacheKey(origin, destination, departure);
  const hit = cache.get(key);
  if (hit) return NextResponse.json({ ...hit, cached: true } satisfies RoutesResponse);

  if (!takeProviderCall()) return fail(503, "daily_cap_reached");

  try {
    const { candidates, mode } = await planTrip(origin, destination, departure);
    const payload = {
      candidates,
      mode,
      departureTime: departure.toISOString(),
      generatedAt: new Date().toISOString(),
      layers: LAYER_FRESHNESS,
      monsoonActive: isMonsoon(departure),
    };
    cache.set(key, payload);
    return NextResponse.json({ ...payload, cached: false } satisfies RoutesResponse);
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) return fail(503, "provider_not_configured");
    console.error(JSON.stringify({ evt: "routes_error", message: String(err) }));
    return fail(502, "provider_failed");
  }
}
