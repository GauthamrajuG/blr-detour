"use client";

import { forwardRef } from "react";
import type { Confidence, RankedRoute } from "@/lib/engine/types";
import { calmWord, confidenceLabel, deltaLabel, reasonText, srCardLabel } from "@/lib/ui/format";
import { en, fmt } from "@/messages/en";
import { Icon } from "./Icon";

interface Props {
  ranked: RankedRoute;
  selected: boolean;
  /** Steps are open. Separate from selection so the top pick can be highlighted without taking the screen. */
  expanded: boolean;
  onSelect: () => void;
  onKeyNav: (dir: 1 | -1) => void;
}

export const RouteCard = forwardRef<HTMLButtonElement, Props>(function RouteCard(
  { ranked: r, selected, expanded, onSelect, onKeyNav },
  ref,
) {
  const { route, estimate } = r.candidate;
  const stepsId = `steps-${route.id}`;
  const notes = r.reasons.slice(1);
  const delta = deltaLabel(r);
  const deltaTone = r.isFastest || r.deltaVsFastest <= 0 ? "text-signboard" : "text-ink";

  return (
    <li className="route-card" data-selected={selected} data-testid="route-card" data-route-id={route.id}>
      <button
        ref={ref}
        type="button"
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            onKeyNav(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            onKeyNav(-1);
          }
        }}
        aria-expanded={expanded}
        aria-current={selected ? "true" : undefined}
        aria-controls={stepsId}
        aria-label={srCardLabel(r)}
        className="block w-full rounded-[14px] px-4 pt-3 pb-3 text-left"
      >
        <div className="flex items-start justify-between gap-3" aria-hidden="true">
          <div className="min-w-0">
            <p className="flex items-baseline gap-2">
              <span className="tabular text-2xl leading-none font-bold tracking-[-0.01em]">
                {estimate.expected}
                <span className="ml-0.5 text-lg font-semibold">{en.results.min}</span>
              </span>
              <span className="tabular text-sm text-ink-soft">
                {fmt(en.results.range, { low: estimate.low, high: estimate.high })}
              </span>
            </p>
            <p className="mt-1.5 truncate text-base font-semibold">
              {route.label}
              <span className="tabular ml-2 font-normal text-ink-soft">
                {fmt(en.results.distance, { km: route.distanceKm })}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className={`tabular text-base font-bold ${deltaTone}`}>{delta}</span>
            {r.rank === 1 && (
              <span className="rounded-md bg-ink px-2 py-0.5 text-xs font-bold text-paper">{en.results.topPick}</span>
            )}
          </div>
        </div>

        <JamStrip ranked={r} />

        <p className="mt-2.5 text-base leading-snug" aria-hidden="true">
          {reasonText(r.reasons[0])}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm" aria-hidden="true">
          <StressMeter stress={r.stress} />
          <ConfidenceBadge confidence={r.confidence} />
        </div>

        {notes.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-soft" aria-hidden="true">
            {notes.map((n) => (
              <li key={n.key} className="flex items-start gap-1.5">
                <Icon
                  name={n.key === "floodRisk" ? "drop" : "cone"}
                  size={16}
                  className={`mt-0.5 shrink-0 ${n.key === "floodRisk" ? "text-flood" : "text-ink-soft"}`}
                />
                <span>{reasonText(n)}</span>
              </li>
            ))}
          </ul>
        )}
      </button>

      {/* Notes are hidden from the button's visual tree above, so repeat them for screen readers. */}
      {notes.length > 0 && <p className="sr-only">{notes.map(reasonText).join(" ")}</p>}

      <div
        className="expand"
        data-open={expanded}
        id={stepsId}
        role="region"
        aria-label={`${en.results.steps}: ${route.label}`}
      >
        <div>
          <ol className="mx-4 mb-3 border-t border-rule pt-2" hidden={!expanded}>
            {route.steps.map((s, i) => {
              const isJunction = s.instruction.startsWith("Through ");
              const isLast = i === route.steps.length - 1;
              return (
                <li key={i} className="flex min-h-10 items-center gap-3 text-sm">
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-full ${
                      isJunction ? "bg-kerb text-kerb-ink" : "bg-paper-sunk text-ink-soft"
                    }`}
                  >
                    <Icon name={isLast ? "arrive" : isJunction ? "junction" : "dot"} size={15} />
                  </span>
                  <span className="flex-1">{s.instruction}</span>
                  {s.distanceKm > 0 && (
                    <span className="tabular text-ink-soft">{fmt(en.results.distance, { km: s.distanceKm })}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </li>
  );
});

/** Where on the trip the trouble is: kerb hatching for chokepoints, blue for flood roads. */
function JamStrip({ ranked }: { ranked: RankedRoute }) {
  const { context } = ranked.candidate;
  const pct = (at: number) => `${Math.min(94, Math.max(0, at * 100 - 3))}%`;
  return (
    <div className="jam-strip mt-3" aria-hidden="true">
      <div className="jam-strip__route" />
      {context.monsoonActive &&
        context.floods.map((f) => (
          <span
            key={f.id}
            className="jam-strip__mark jam-strip__mark--flood"
            style={{ left: pct(f.at), width: "4%" }}
            title={f.name}
          />
        ))}
      {context.chokepoints.map((z) => (
        <span
          key={z.id}
          className={`jam-strip__mark ${z.inPeak ? "jam-strip__mark--peak" : "jam-strip__mark--quiet"}`}
          style={{ left: pct(z.at), width: `${Math.max(6, Math.min(16, z.delayMin * 0.7))}%` }}
          title={z.name}
        />
      ))}
    </div>
  );
}

function StressMeter({ stress }: { stress: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular font-semibold">{fmt(en.results.stress, { score: stress })}</span>
      <span className="text-ink-soft">{calmWord(stress)}</span>
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const style =
    confidence === "live"
      ? "border-signboard text-signboard"
      : confidence === "historical"
        ? "border-ink-soft text-ink"
        : "border-kerb text-ink";
  const hint =
    confidence === "live"
      ? en.confidence.liveHint
      : confidence === "historical"
        ? en.confidence.historicalHint
        : en.confidence.estimatedHint;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-2 py-0.5 text-xs font-bold ${style}`}
      title={hint}
      data-testid="confidence"
    >
      {confidence === "live" ? (
        <span className="size-2 rounded-full bg-signboard" />
      ) : confidence === "estimated" ? (
        <span className="size-2 rounded-full bg-kerb" />
      ) : (
        <span className="size-2 rounded-full border-[1.5px] border-ink-soft" />
      )}
      {confidenceLabel(confidence)}
    </span>
  );
}
