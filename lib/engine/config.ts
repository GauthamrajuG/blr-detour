/**
 * Every tunable constant for the recommendation engine lives here.
 * Units are minutes unless a name says otherwise.
 *
 * The score is in "minute equivalents" so the sliders mean something to a person:
 *   score = w_time  * expected_minutes
 *         + w_calm  * stress_minutes        (stress 0-100 turned into minutes)
 *         + w_pred  * predictability_minutes (spread of the time range turned into minutes)
 *         + w_risk  * risk_minutes           (flood, road works, closures)
 * Lower is better.
 */

import type { Weights } from "./types";

/** Slider range shown in the UI. */
export const SLIDER_MIN = 0;
export const SLIDER_MAX = 10;
/** A slider at this value is a multiplier of exactly 1. */
export const SLIDER_NEUTRAL = 5;

/**
 * Defaults favour time, with a moderate penalty for stress and for unpredictable routes.
 * Multipliers: time 1.0, calm 0.6, predictability 0.6, flood/risk 1.0.
 */
export const DEFAULT_WEIGHTS: Weights = {
  time: 5,
  calm: 3,
  predictability: 3,
  flood: 5,
};

/* ---------------- Stress ---------------- */

/** How much each event counts toward stress. A U-turn or stop-and-go stretch hurts more than a merge. */
export const STRESS_EVENT_WEIGHTS = {
  signals: 1.0,
  junctions: 0.8,
  uTurns: 1.2,
  merges: 0.6,
  stopProneSegments: 1.5,
} as const;

/** Weighted events per km that maps to a stress score of 100. Denser routes are clamped at 100. */
export const STRESS_DENSITY_AT_100 = 8;

/**
 * A stress score of 100 is treated as costing this many minutes of a person's patience.
 * So a route that is 67 stress points calmer is "about 20 minutes calmer".
 */
export const STRESS_MINUTES_AT_100 = 30;

/* ---------------- Predictability ---------------- */

/**
 * Penalty is proportional to (high - low) / expected.
 * A range as wide as the expected time itself (ratio 1.0) costs this many minutes.
 */
export const PREDICTABILITY_MINUTES_PER_UNIT_SPREAD = 20;

/* ---------------- Risk ---------------- */

/** A known full closure on the route. Large on purpose: it should almost always lose. */
export const CLOSURE_PENALTY_MIN = 45;

/** Multiplier on road-works delay minutes. Works delay is uncertain, so it counts as risk. */
export const WORKS_RISK_FACTOR = 1.0;

/** Multiplier on flood penalty minutes when the monsoon layer is active. */
export const FLOOD_RISK_FACTOR = 1.0;

/* ---------------- Confidence labels ---------------- */

/** Live data older than this is shown as "Estimated, not live". */
export const LIVE_STALE_AFTER_MIN = 10;

/** Live traffic for a departure further ahead than this is a forecast, not live. */
export const LIVE_FUTURE_DEPARTURE_MAX_MIN = 15;

/* ---------------- Reasons ---------------- */

/** Ignore time differences smaller than this when writing a reason. */
export const REASON_MIN_DELTA_MIN = 2;

/** A route counts as "calmer" when its stress is at least this much lower (percent). */
export const REASON_CALMER_MIN_PCT = 15;

/** A route counts as "steadier" when its range is at least this many minutes narrower. */
export const REASON_STEADIER_MIN_MIN = 4;

/* ---------------- Caching and limits (used by the API layer) ---------------- */

/** Origin and destination are rounded to 3 decimals (~110 m) for the cache key. */
export const CACHE_COORD_DECIMALS = 3;
/** Departure times are grouped into buckets of this many minutes for the cache key. */
export const CACHE_DEPARTURE_BUCKET_MIN = 5;
/** How long a cached route result is reused. Respect provider terms before raising this. */
export const CACHE_TTL_SEC = 300;

export const RATE_LIMIT_PER_IP_PER_MIN = 20;
export const RATE_LIMIT_PER_IP_PER_DAY = 300;
/** Global daily cap on paid provider calls. Protects the bill if a cap upstream is missed. */
export const PROVIDER_CALLS_PER_DAY_CAP = 2000;
