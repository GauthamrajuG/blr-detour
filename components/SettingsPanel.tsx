"use client";

import { useId } from "react";
import { DEFAULT_WEIGHTS, SLIDER_MAX, SLIDER_MIN } from "@/lib/engine/config";
import type { Weights } from "@/lib/engine/types";
import { en } from "@/messages/en";

interface Props {
  weights: Weights;
  onChange: (w: Weights) => void;
  monsoonActive: boolean;
}

const ROWS: { key: keyof Weights; label: string }[] = [
  { key: "time", label: en.settings.time },
  { key: "calm", label: en.settings.calm },
  { key: "predictability", label: en.settings.predictability },
  { key: "flood", label: en.settings.flood },
];

function level(v: number): string {
  const l = en.settings.levels;
  return l[Math.min(l.length - 1, Math.round((v / SLIDER_MAX) * (l.length - 1)))];
}

/** Weight sliders. Changing one re-ranks the cards immediately; no submit. */
export function SettingsPanel({ weights, onChange, monsoonActive }: Props) {
  const base = useId();
  const isDefault = ROWS.every((r) => weights[r.key] === DEFAULT_WEIGHTS[r.key]);

  return (
    <section aria-labelledby={`${base}-h`} className="rounded-xl bg-paper-sunk px-4 pt-3 pb-2" data-testid="settings">
      <div className="flex items-center justify-between gap-3">
        <h3 id={`${base}-h`} className="text-base font-bold">
          {en.settings.heading}
        </h3>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_WEIGHTS)}
          disabled={isDefault}
          className="pressable min-h-11 rounded-lg px-2 text-sm font-semibold text-signboard underline underline-offset-4 disabled:text-ink-soft disabled:no-underline"
        >
          {en.settings.reset}
        </button>
      </div>
      {ROWS.map((row) => {
        const id = `${base}-${row.key}`;
        const v = weights[row.key];
        const hintId = row.key === "flood" ? `${id}-hint` : undefined;
        return (
          <div key={row.key} className="mt-1">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={id} className="text-sm font-semibold">
                {row.label}
              </label>
              <span className="text-sm text-ink-soft" aria-hidden="true">
                {level(v)}
              </span>
            </div>
            <input
              id={id}
              data-testid={`weight-${row.key}`}
              type="range"
              className="slider"
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              step={1}
              value={v}
              aria-valuetext={level(v)}
              aria-describedby={hintId}
              style={{ "--fill": `${(v / SLIDER_MAX) * 100}%` } as React.CSSProperties}
              onChange={(e) => onChange({ ...weights, [row.key]: Number(e.target.value) })}
            />
            {hintId && (
              <p id={hintId} className="-mt-1 mb-1 text-xs text-ink-soft">
                {monsoonActive ? en.settings.floodHint : en.settings.floodOff}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
