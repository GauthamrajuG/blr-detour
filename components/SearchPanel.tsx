"use client";

import { useState } from "react";
import type { Place } from "@/lib/engine/types";
import { inBengaluru } from "@/lib/geo/geo";
import type { DepartureChoice } from "@/lib/ui/format";
import { en } from "@/messages/en";
import { Icon } from "./Icon";
import { PlaceField } from "./PlaceField";

interface Props {
  origin: Place | null;
  destination: Place | null;
  departure: DepartureChoice;
  onOrigin: (p: Place | null) => void;
  onDestination: (p: Place | null) => void;
  onDeparture: (d: DepartureChoice) => void;
  onSwap: () => void;
  onSubmit: () => void;
  onLocateError: (code: "geolocation_denied" | "geolocation_outside") => void;
  busy: boolean;
  /** Live search: the empty-results message shouldn't mention the demo list. */
  live: boolean;
}

const CHOICES: { id: DepartureChoice; label: string }[] = [
  { id: "now", label: en.search.now },
  { id: "plus30", label: en.search.plus30 },
  { id: "tomorrow8", label: en.search.tomorrow8 },
];

export function SearchPanel(p: Props) {
  const [locating, setLocating] = useState(false);

  function locate() {
    if (!("geolocation" in navigator)) return p.onLocateError("geolocation_denied");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        if (!inBengaluru(lat, lng)) return p.onLocateError("geolocation_outside");
        p.onOrigin({ label: en.search.currentLocation, lat, lng });
      },
      () => {
        setLocating(false);
        p.onLocateError("geolocation_denied");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        p.onSubmit();
      }}
      className="flex flex-col gap-3"
    >
      <div className="grid grid-cols-[1fr_auto] items-end gap-x-2 gap-y-2">
        <PlaceField
          testId="origin"
          live={p.live}
          label={en.search.from}
          placeholder={en.search.fromPlaceholder}
          value={p.origin}
          onChange={p.onOrigin}
          action={
            <button
              type="button"
              onClick={locate}
              className="pressable grid size-11 shrink-0 place-items-center rounded-lg text-signboard"
              aria-label={locating ? en.search.locating : en.search.locate}
              aria-busy={locating}
            >
              <Icon name="locate" size={20} className={locating ? "opacity-50" : ""} />
            </button>
          }
        />
        <button
          type="button"
          onClick={p.onSwap}
          className="pressable row-span-2 grid size-11 place-items-center self-center rounded-full border-[1.5px] border-rule bg-paper-raised text-ink"
          aria-label={en.search.swap}
        >
          <Icon name="swap" size={20} />
        </button>
        <PlaceField
          testId="destination"
          live={p.live}
          label={en.search.to}
          placeholder={en.search.toPlaceholder}
          value={p.destination}
          onChange={p.onDestination}
        />
      </div>

      <fieldset className="min-w-0">
        <legend className="mb-1 text-xs font-semibold text-ink-soft">{en.search.leaving}</legend>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {CHOICES.map((c) => (
            <label key={c.id} className="chip pressable">
              <input
                type="radio"
                name="departure"
                value={c.id}
                checked={p.departure === c.id}
                onChange={() => p.onDeparture(c.id)}
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Search runs automatically once both places are set; the button is for re-running and keyboard users. */}
      {p.origin && p.destination && (
        <button
          type="submit"
          disabled={p.busy}
          className="pressable min-h-11 rounded-xl border-[1.5px] border-ink px-4 text-base font-bold text-ink disabled:cursor-wait disabled:opacity-60"
        >
          {en.search.submit}
        </button>
      )}
    </form>
  );
}
