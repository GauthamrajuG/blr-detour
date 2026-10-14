# Providers: terms, caching, cost

**Status: only Mock and Historical are implemented.** Google, TomTom and OSRM are placeholders that throw a clear error. The brief says to stop and ask before Phase 4. I have **not** read the current Google Routes or TomTom docs and pricing for this build, so the notes below are the questions to settle first, not verified facts.

## Before implementing each provider

### Google Routes API (`GoogleRoutesProvider`)

- Read the current Routes API docs: `computeRoutes` with `computeAlternativeRoutes`, `routingPreference: TRAFFIC_AWARE_OPTIMAL`, and `departureTime`. Check which field mask SKUs are billed.
- Check the Maps Platform Terms on caching. My understanding is that most content may not be cached beyond short-term performance use; **verify** before relying on the 5-minute cache in `lib/server/cache.ts`. If caching is disallowed, set `CACHE_TTL_SEC` to 0 for Google responses.
- Google route results shown on a non-Google map may have display and attribution conditions. Verify before mixing Google routes with MapLibre/OSM tiles. This is a licensing decision for you.
- Set a daily quota and a budget alert in Cloud Console **before** the first deploy. Restrict the key by referrer or IP.

### TomTom Routing (`TomTomProvider`)

- Second traffic source, for comparing travel times. Check free-tier daily limits, caching terms, and attribution.

### OSRM / GraphHopper (`OsrmProvider`)

- Self-hosted on Railway or Fly.io from the OSM Karnataka extract. No traffic, so pair it with `HistoricalProvider`. Custom profiles can penalise signals and junctions directly.

## Geocoding

- Demo: a 42-place gazetteer (`data/bengaluru/places.json`).
- Live: Google Places Autocomplete or Photon. **Not Nominatim**: its public usage policy forbids autocomplete-as-you-type and limits clients to about one request per second.

## Map tiles

- OpenFreeMap (no key; OpenStreetMap data, ODbL). The attribution control stays on. Override with `NEXT_PUBLIC_MAP_STYLE_URL`.

## Cost controls already in code

- Cache per (origin and destination rounded to about 110 m, 5-minute departure bucket), TTL 300 s, in memory.
- Per-IP limits: 20 a minute, 300 a day. Global cap of 2,000 provider calls a day (`lib/engine/config.ts`).
- One JSON log line per provider call (`evt: "provider_call"`) for cost tracking from host logs.
- Caveat: limits and cache are per server instance. On Vercel, move them to Postgres or Redis in Phase 4.

## Never

- No scraping of Google Maps or any site that forbids it.
- No "Live" label without a fresh live source (`confidenceFor` enforces this, and it is tested).
