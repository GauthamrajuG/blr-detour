import places from "@/data/bengaluru/places.json";
import type { GeocodeResult, Geocoder } from "@/lib/providers/types";

/**
 * Demo geocoder over a small list of Bengaluru localities.
 * Live mode should use Google Places Autocomplete or Photon. Not Nominatim:
 * its usage policy forbids autocomplete-as-you-type (docs/providers.md).
 */
export class GazetteerGeocoder implements Geocoder {
  readonly name = "gazetteer";
  async search(query: string): Promise<GeocodeResult[]> {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    const scored = places.places
      .map((p) => {
        const n = p.name.toLowerCase();
        const score = n.startsWith(q) ? 0 : n.split(/[\s,]+/).some((w) => w.startsWith(q)) ? 1 : n.includes(q) ? 2 : 9;
        return { p, score };
      })
      .filter((x) => x.score < 9)
      .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name))
      .slice(0, 6);
    return scored.map(({ p }) => ({ id: p.id, label: p.name, lat: p.lat, lng: p.lng }));
  }
}
