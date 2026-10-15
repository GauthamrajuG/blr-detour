# Providers: terms, caching, cost

**Status: only Mock and Historical are implemented.** Google, TomTom and OSRM are placeholders that throw a clear error. The brief says to stop and ask before Phase 4. I have **not** read the current Google Routes or TomTom docs and pricing for this build, so the notes below are the questions to settle first, not verified facts.

## TomTom: implemented (live mode)

Set `TOMTOM_API_KEY` and the site switches to live mode. Built from the Calculate Route v1 docs (read 15 Oct 2026).

- **One call per search.** `calculateRoute` with `maxAlternatives=3`, `computeTravelTimeFor=all`, `traffic=true`, `sectionType=traffic,motorway,importantRoadStretch`, `instructionsType=text`. That returns up to 4 routes with geometry, traffic-aware times, jam sections, road names, and turn-by-turn steps. Travel times come from the same response, with no second call.
- **Departure.** `departAt=now` within a minute of now; otherwise an IST timestamp. Results for later departures are labelled "Historical estimate", because TomTom then relies on historic speeds.
- **Time range.** TomTom gives one estimate. The range is ours: the hour's typical spread for the road class, never faster than TomTom's no-traffic time, and never below TomTom's historic time on the high side.
- **Stress inputs.** Junctions, U-turns, and merges are counted from TomTom's guidance manoeuvres. Stop-and-go is counted from TomTom's `JAM` sections (major jams count double), plus our chokepoint file. **Traffic signals are estimated** (0.6 per turn + 0.5 per km), because TomTom has no signal data. A better source is OpenStreetMap `highway=traffic_signals` nodes along the path, a good next step.
- **Labels.** "via <name>" uses the `importantRoadStretch` covering most of the route, kept unique across alternatives.
- **Address search.** The local neighbourhood list is checked first. TomTom Fuzzy Search (`typeahead=true`, `countrySet=IN`, 45 km around the city centre) runs only when the query has 3 or more characters and the local list has fewer than 3 matches. Results outside Bengaluru are dropped. Searches are cached for 5 minutes and debounced 250 ms in the browser.
- **Errors.** 403 shows "the traffic service rejected this site's key". 429 shows "today's free lookups are used up". 400 (no road connection) shows the empty state. Timeouts after 8 s show "the route service didn't respond".
- **Quota math (free plan, 2,500 requests a day).** About 1 request per route search, plus 0–3 search requests while typing an address that isn't in the local list. Expect roughly **600–1,200 searches a day** before the free cap. Over the cap, TomTom blocks rather than bills (per TomTom's pricing page) and the site shows the quota message.
- **Not verified, please check in your TomTom account:** the licence terms page loads with JavaScript and I could not read it. Before commercial use, check (a) how long results may be cached (we keep them 5 minutes), (b) whether TomTom routes may be drawn on a non-TomTom base map (we use OpenFreeMap/OSM tiles), and (c) attribution wording. We show "© TomTom" in the freshness section in live mode.
- **Tested how:** unit tests against a response built from the documented fields, with fetch mocked, and an end-to-end run of the real site against `tests/fake-tomtom/server.mjs` (`TOMTOM_BASE_URL=http://localhost:4010 TOMTOM_API_KEY=test-key`). **Not tested against the real TomTom service**, because this sandbox can't reach it. The first real searches after you add your key are the real test.

## Google: not built, and a finding

Google's published policies for its Directions-family APIs say results shown on a map must be shown on a **Google Map**. Our map uses OpenStreetMap tiles. So Google would need the map switched to Google Maps JS too. That's another reason TomTom went first.

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
