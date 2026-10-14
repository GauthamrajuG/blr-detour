# Deploy

Demo mode needs no keys and no database. That is the safe first deploy.

## 1. Vercel (front end and API routes)

1. Push the repo to GitHub, then **New Project → Import** in Vercel. Framework preset: Next.js. Build command `npm run build` (its `prebuild` copies the MapLibre worker). Output is the default.
2. Environment variables (Project → Settings → Environment Variables):
   - `ROUTE_PROVIDER=mock`, `TRAFFIC_PROVIDER=mock` for the first deploy.
   - Optional `NEXT_PUBLIC_MAP_STYLE_URL`.
3. Deploy, then open `/api/health`. It should report `"mode":"demo"`, with all `keys` set to `false`.
4. Check the demo banner appears and an example trip returns cards.

The home page is pre-rendered at build time, so the demo banner's first paint reflects the build-time env. After you add keys, **redeploy**. API responses carry `mode` and the UI follows them.

## 2. Before any paid provider (Phase 4)

- **Google Cloud:** enable the Routes API and Places API only. Create a key restricted to your Vercel domain (Places) or server IPs (Routes, server side). Set **per-day quotas** on each API and a **budget alert** on the billing account.
- **TomTom:** set a daily request cap in the developer portal.
- Keep `PROVIDER_CALLS_PER_DAY_CAP` in `lib/engine/config.ts` below your provider quota.
- Add the keys in Vercel, set `ROUTE_PROVIDER` and `TRAFFIC_PROVIDER`, redeploy, and confirm `/api/health`.

## 3. Database (Phase 4): Neon or Supabase

- Create a Postgres database and set `DATABASE_URL`.
- Use it for the shared route cache, rate-limit counters (in-memory counters reset per serverless instance), and opt-in trip logs.

## 4. Self-hosted routing (optional): Railway or Fly.io

- Run OSRM from the Karnataka OSM extract (Geofabrik `southern-zone` or `karnataka`) with a car profile tuned to penalise signals. Set `OSRM_URL`. A Dockerfile ships with that client in Phase 4.

## 5. After each deploy

- Lighthouse mobile on the production URL (PageSpeed Insights). Target 90+ for performance and accessibility.
- `npx impeccable detect --viewport 390x844 https://your-domain`
