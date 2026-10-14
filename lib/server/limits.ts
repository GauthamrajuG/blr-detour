import { PROVIDER_CALLS_PER_DAY_CAP, RATE_LIMIT_PER_IP_PER_DAY, RATE_LIMIT_PER_IP_PER_MIN } from "@/lib/engine/config";

/**
 * Per-IP limits and a global provider-call cap, in memory.
 * These protect a single instance. They are not a substitute for the spend caps and
 * quotas you must also set in each provider's console (docs/deploy.md).
 */
const perMin = new Map<string, { n: number; reset: number }>();
const perDay = new Map<string, { n: number; reset: number }>();
let providerCalls = { n: 0, reset: 0 };

function bump(map: Map<string, { n: number; reset: number }>, key: string, windowMs: number, now: number) {
  const cur = map.get(key);
  if (!cur || cur.reset <= now) {
    const fresh = { n: 1, reset: now + windowMs };
    map.set(key, fresh);
    return fresh;
  }
  cur.n += 1;
  return cur;
}

export function checkRateLimit(ip: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
  const m = bump(perMin, ip, 60_000, now);
  if (m.n > RATE_LIMIT_PER_IP_PER_MIN) return { ok: false, retryAfterSec: Math.ceil((m.reset - now) / 1000) };
  const d = bump(perDay, ip, 86_400_000, now);
  if (d.n > RATE_LIMIT_PER_IP_PER_DAY) return { ok: false, retryAfterSec: Math.ceil((d.reset - now) / 1000) };
  return { ok: true };
}

export function takeProviderCall(now = Date.now()): boolean {
  if (providerCalls.reset <= now) providerCalls = { n: 0, reset: now + 86_400_000 };
  if (providerCalls.n >= PROVIDER_CALLS_PER_DAY_CAP) return false;
  providerCalls.n += 1;
  return true;
}

/** One JSON line per provider call, for cost tracking from the hosting logs. */
export function logProviderCall(entry: {
  provider: string;
  kind: "route" | "traffic" | "geocode";
  ms: number;
  ok: boolean;
}) {
  console.info(JSON.stringify({ evt: "provider_call", ...entry, at: new Date().toISOString() }));
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}
