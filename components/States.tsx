"use client";

import type { Place } from "@/lib/engine/types";
import type { RoutesResponse } from "@/lib/schema";
import { dateLabel } from "@/lib/ui/format";
import { en, fmt } from "@/messages/en";
import { Icon } from "./Icon";

export type ErrorCode = keyof typeof en.states.errors;

export const EXAMPLES: { from: Place; to: Place }[] = [
  {
    from: { label: "Koramangala", lat: 12.9352, lng: 77.6245 },
    to: { label: "Electronic City", lat: 12.8452, lng: 77.6602 },
  },
  { from: { label: "HSR Layout", lat: 12.9116, lng: 77.6389 }, to: { label: "Whitefield", lat: 12.9698, lng: 77.75 } },
  {
    from: { label: "Jayanagar", lat: 12.925, lng: 77.5938 },
    to: { label: "Marathahalli", lat: 12.9591, lng: 77.6974 },
  },
];

export function IdleState({ onExample }: { onExample: (e: (typeof EXAMPLES)[number]) => void }) {
  return (
    <div className="px-1 pt-1" data-testid="idle">
      <h2 className="text-2xl leading-tight font-bold tracking-[-0.015em]">{en.idle.title}</h2>
      <p className="mt-1 max-w-[60ch] text-base text-ink-soft">{en.idle.body}</p>
      <h3 className="mt-4 text-base font-semibold">{en.idle.examples}</h3>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {EXAMPLES.map((e) => (
          <li key={e.from.label + e.to.label}>
            <button
              type="button"
              onClick={() => onExample(e)}
              className="pressable flex min-h-12 w-full items-center gap-3 rounded-xl border-[1.5px] border-rule bg-paper-raised px-3 text-left text-base font-semibold"
            >
              <Icon name="pin" size={18} className="shrink-0 text-signboard" />
              {fmt(en.idle.example, { from: e.from.label, to: e.to.label })}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LoadingState() {
  return (
    <div role="status" aria-live="polite" data-testid="loading">
      <span className="sr-only">{en.states.loading}</span>
      <ul className="flex flex-col gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="px-4 py-3">
            <div className="flex justify-between">
              <div className="skeleton h-8 w-28" />
              <div className="skeleton h-5 w-14" />
            </div>
            <div className="skeleton mt-2 h-4 w-44" />
            <div className="skeleton mt-3 h-3 w-full" />
            <div className="skeleton mt-3 h-4 w-11/12" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ErrorState({ code, onRetry }: { code: ErrorCode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex gap-3 rounded-xl border-[1.5px] border-brick px-4 py-3" data-testid="error">
      <Icon name="alert" size={22} className="mt-0.5 shrink-0 text-brick" />
      <div className="min-w-0">
        <p className="text-base">{en.states.errors[code]}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="pressable mt-2 min-h-11 rounded-lg bg-ink px-4 text-sm font-bold text-paper"
          >
            {en.states.retry}
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="px-1" data-testid="empty" role="status">
      <h2 className="text-lg font-bold">{en.states.emptyTitle}</h2>
      <p className="mt-1 text-base text-ink-soft">{en.states.emptyBody}</p>
    </div>
  );
}

export function DemoBanner() {
  return (
    <p
      className="flex items-start gap-2 rounded-lg bg-kerb px-3 py-1.5 text-xs font-semibold text-kerb-ink"
      data-testid="demo-banner"
    >
      <Icon name="info" size={16} className="shrink-0" />
      {en.demo.banner}
    </p>
  );
}

export function DataFreshness({ layers, monsoonActive }: { layers: RoutesResponse["layers"]; monsoonActive: boolean }) {
  const name = { zones: en.freshness.zones, construction: en.freshness.construction, flood: en.freshness.flood };
  return (
    <section className="border-t border-rule pt-3 text-sm" aria-labelledby="fresh-h" data-testid="freshness">
      <h2 id="fresh-h" className="text-base font-bold">
        {en.freshness.heading}
      </h2>
      <dl className="mt-1.5 flex flex-col gap-1.5">
        {layers.map((l) => (
          <div key={l.id}>
            <dt className="font-semibold">{name[l.id]}</dt>
            <dd className="text-ink-soft">
              {fmt(l.verification === "field" ? en.freshness.field : en.freshness.seed, {
                date: dateLabel(l.lastVerified),
              })}
              {l.id === "flood" && ` ${monsoonActive ? en.freshness.floodActive : en.freshness.floodInactive}`}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-ink-soft">{en.freshness.noLiveClosures}</p>

      <h3 className="mt-3 font-semibold">{en.freshness.legend}</h3>
      <ul className="mt-1 flex flex-col gap-1 text-ink-soft">
        <li className="flex items-center gap-2">
          <span className="jam-strip w-10" aria-hidden="true">
            <span className="jam-strip__mark jam-strip__mark--peak" style={{ left: 0, width: "100%" }} />
          </span>
          {en.freshness.legendPeak}
        </li>
        <li className="flex items-center gap-2">
          <span className="jam-strip w-10" aria-hidden="true">
            <span className="jam-strip__mark jam-strip__mark--quiet" style={{ left: 0, width: "100%" }} />
          </span>
          {en.freshness.legendQuiet}
        </li>
        <li className="flex items-center gap-2">
          <span className="jam-strip w-10" aria-hidden="true">
            <span className="jam-strip__mark jam-strip__mark--flood" style={{ left: 0, width: "100%" }} />
          </span>
          {en.freshness.legendFlood}
        </li>
      </ul>
    </section>
  );
}
