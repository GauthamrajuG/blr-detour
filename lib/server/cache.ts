import { CACHE_COORD_DECIMALS, CACHE_DEPARTURE_BUCKET_MIN, CACHE_TTL_SEC } from "@/lib/engine/config";
import { roundCoord } from "@/lib/geo/geo";
import type { Place } from "@/lib/engine/types";

/**
 * In-memory TTL cache. Fine for one server process and for demo mode.
 * On serverless, each instance has its own copy; move to Postgres or Redis in Phase 4
 * (see docs/decisions.md). Provider terms limit what may be cached: see docs/providers.md.
 */
export class MemoryCache<T> {
  private store = new Map<string, { value: T; expires: number }>();
  constructor(
    private ttlSec = CACHE_TTL_SEC,
    private maxEntries = 500,
  ) {}

  get(key: string, now = Date.now()): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires <= now) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T, now = Date.now()) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: now + this.ttlSec * 1000 });
  }
}

/** Key: origin and destination rounded to ~110 m, departure in 5-minute buckets. */
export function routeCacheKey(origin: Place, destination: Place, departure: Date): string {
  const r = (n: number) => roundCoord(n, CACHE_COORD_DECIMALS).toFixed(CACHE_COORD_DECIMALS);
  const bucket = Math.floor(departure.getTime() / (CACHE_DEPARTURE_BUCKET_MIN * 60000));
  return `${r(origin.lat)},${r(origin.lng)}|${r(destination.lat)},${r(destination.lng)}|${bucket}`;
}
