import type { Candidate, Place } from "@/lib/engine/types";
import { routeContext } from "@/lib/geo/zones";
import { getProviders } from "@/lib/providers";
import { logProviderCall } from "./limits";

/** Fetch alternatives, time each one, and attach Bengaluru context. */
export async function planTrip(
  origin: Place,
  destination: Place,
  departure: Date,
): Promise<{
  candidates: Candidate[];
  mode: "demo" | "live";
}> {
  const { route: rp, traffic: tp, mode } = getProviders();

  const t0 = Date.now();
  const routes = await rp.getAlternatives(origin, destination, departure);
  logProviderCall({ provider: rp.name, kind: "route", ms: Date.now() - t0, ok: true });

  const candidates = await Promise.all(
    routes.map(async (route) => {
      const t1 = Date.now();
      const estimate = await tp.getTravelTimes(route, departure);
      logProviderCall({ provider: tp.name, kind: "traffic", ms: Date.now() - t1, ok: true });
      return { route, estimate, context: routeContext(route.path, departure, estimate.expected) };
    }),
  );
  return { candidates, mode };
}
