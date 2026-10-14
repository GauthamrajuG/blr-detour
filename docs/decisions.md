# Decisions

Each entry: what I decided, why, and what I rejected.

## Product and engine

1. **Score in minute equivalents, sliders 0–10 with 5 as ×1.** The brief's formula, with stress and risk converted to minutes so "calm" and "time" trade off in units people understand. _Rejected:_ normalised 0–1 scores, which make slider positions meaningless.
2. **"20 min calmer" means 20 stress-minutes.** Stress 0–100 maps to 0–30 minutes (`STRESS_MINUTES_AT_100`). The required test uses that reading.
3. **One risk weight covers flood, works, and closures.** The formula has one `w_risk`. The slider keeps the brief's label, "Avoid flood-prone roads (monsoon)", with the hint "Also counts road works". _Rejected:_ a fifth slider. Too many controls for a phone in an auto.
4. **Chokepoint delay is part of travel time, not risk.** Live providers already include congestion, so adding it again would double-count. The historical model adds zone delay itself, and chokepoints drive the reasons.
5. **Reasons explain the score.** The headline reason is a peak chokepoint the route avoids, otherwise the weighted dimension where it gains most over the fastest route. _Rejected:_ the first version's fixed priority order, which gave a top pick the reason "13 min slower, no clear upside". It was found in screenshots and is now covered by tests.
6. **Never "Live" without proof.** Mock is "Estimated, not live". Historical is "Historical estimate". Live data older than 10 minutes, or for a departure more than 15 minutes ahead, is "Estimated, not live". Tested.
7. **Ranking runs on the client.** The API returns candidates and the pure engine ranks them in the browser, so sliders re-rank with no network call and no reload.
8. **Seed data is labelled as seed.** The zone, works, and flood files are my approximations from general knowledge. Each has `verification: "seed"`, and the UI says "not yet checked on the ground". _Rejected:_ showing a bare "last verified" date, which would imply a field check that never happened.

## Providers

9. **Interfaces first; Mock and Historical only.** Real providers wait on your API-key decision (the brief's stop point). Selecting one without a key falls back to mock and `/api/health` says why. Selecting one with a key throws `provider_not_configured` rather than silently mocking.
10. **Mock routes are sketched through named roads.** Alternatives go through real Bengaluru road "via" points, so labels and chokepoint hits read plausibly, but the geometry is a smoothed curve. The demo banner says so.
11. **Peak speeds narrowed across road classes.** First seed values made side roads far slower than main roads at peak. In Bengaluru everything crawls at peak, so I narrowed the gap.
12. **No Nominatim for autocomplete.** Its usage policy forbids it. Demo uses a gazetteer; live should use Places or Photon.

## Front end

13. **Atkinson Hyperlegible Next, self-hosted, one family.** Built for glance legibility, which suits a moving auto. Loaded with `next/font/local` for preload and a metric-matched fallback. _Rejected:_ Inter (banned by the brief), and a display/body pairing (Impeccable's Operate mode says one family).
14. **Jam strip as the single bold device.** Kerb hatching encodes where chokepoints fall and whether they are at peak. The detector's `repeating-stripes-gradient` advisory is ignored in config for this reason.
15. **MapLibre loads only when there are routes.** On the idle screen it cost about 2 s of blocking time on Lighthouse's throttled mobile profile for no benefit. The SVG route sketch shows instantly and covers the load.
16. **MapLibre worker shipped from `/public`.** v6 runs a module worker that Next doesn't bundle. Without this the map never draws, a production bug caught by screenshots. `scripts/copy-map-worker.mjs` runs before dev and build.
17. **SVG sketch fallback.** If WebGL or the worker fails, routes still appear. If tiles fail, routes draw on a plain background with a note.
18. **Selection is separate from expanded steps.** The top pick is highlighted on load; steps open on tap.
19. **No `<form>` submit dependency.** Search runs when both places are set and again when the departure chip changes. The button exists for re-runs and keyboard users.
20. **In-memory cache and rate limits.** Fine for demo and a single instance. _Rejected for now:_ Prisma/Drizzle and Postgres. Deferred to Phase 4, when real calls cost money and serverless instances need shared state.
21. **The detector runs on `app components lib`, not `src/`.** The brief's folder layout has no `src/`. The npm script `design:detect` uses the real folders.

## Contrast (computed from tokens)

| Theme | Pair                                  | Colours           | Ratio  | AA text |
| ----- | ------------------------------------- | ----------------- | ------ | ------- |
| light | ink on paper                          | #13201b / #f4f7f4 | 15.6:1 | pass    |
| light | ink-soft on paper                     | #43534c / #f4f7f4 | 7.5:1  | pass    |
| light | ink-soft on paper-sunk (settings)     | #43534c / #e6ece7 | 6.8:1  | pass    |
| light | ink on signboard-wash (selected card) | #13201b / #dcebe2 | 13.6:1 | pass    |
| light | ink-soft on signboard-wash            | #43534c / #dcebe2 | 6.6:1  | pass    |
| light | signboard text on paper               | #0d6a46 / #f4f7f4 | 6.1:1  | pass    |
| light | signboard text on wash                | #0d6a46 / #dcebe2 | 5.4:1  | pass    |
| light | kerb-ink on kerb (demo banner)        | #13201b / #f2c230 | 10.0:1 | pass    |
| light | brick on paper                        | #a33820 / #f4f7f4 | 6.2:1  | pass    |
| light | paper on ink (chip, top pick)         | #f4f7f4 / #13201b | 15.6:1 | pass    |
| dark  | ink on paper                          | #e4ede8 / #101a16 | 14.9:1 | pass    |
| dark  | ink-soft on paper                     | #a7b6ae / #101a16 | 8.4:1  | pass    |
| dark  | ink on signboard-wash                 | #e4ede8 / #173328 | 11.4:1 | pass    |
| dark  | ink-soft on signboard-wash            | #a7b6ae / #173328 | 6.5:1  | pass    |
| dark  | signboard on paper                    | #46c08a / #101a16 | 7.8:1  | pass    |
| dark  | signboard on wash                     | #46c08a / #173328 | 6.0:1  | pass    |
| dark  | brick on paper                        | #f08a6e / #101a16 | 7.3:1  | pass    |
