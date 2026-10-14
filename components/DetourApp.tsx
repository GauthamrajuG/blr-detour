"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_WEIGHTS } from "@/lib/engine/config";
import { rankRoutes } from "@/lib/engine/score";
import type { Place, Weights } from "@/lib/engine/types";
import type { RoutesResponse } from "@/lib/schema";
import { type DepartureChoice, departureDate, whenLabel } from "@/lib/ui/format";
import { en, fmt } from "@/messages/en";
import { Icon } from "./Icon";
import { RouteList } from "./RouteList";
import { SearchPanel } from "./SearchPanel";
import { SettingsPanel } from "./SettingsPanel";
import { useSheet } from "./useSheet";
import { DataFreshness, DemoBanner, EmptyState, ErrorState, type ErrorCode, IdleState, LoadingState } from "./States";

// The map is context, not content: load it after the shell so the cards never wait on it.
const RouteMap = dynamic(() => import("./RouteMap").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <div className="absolute inset-0" style={{ background: "var(--map-bg)" }} aria-hidden="true" />,
});

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: RoutesResponse }
  | { kind: "empty"; data: RoutesResponse }
  | { kind: "error"; code: ErrorCode; retry: boolean };

const WEIGHTS_KEY = "blr-detour:weights";

function loadWeights(): Weights {
  try {
    const raw = localStorage.getItem(WEIGHTS_KEY);
    if (!raw) return DEFAULT_WEIGHTS;
    const w = JSON.parse(raw) as Partial<Weights>;
    const ok = (v: unknown) => typeof v === "number" && v >= 0 && v <= 10;
    return {
      time: ok(w.time) ? w.time! : DEFAULT_WEIGHTS.time,
      calm: ok(w.calm) ? w.calm! : DEFAULT_WEIGHTS.calm,
      predictability: ok(w.predictability) ? w.predictability! : DEFAULT_WEIGHTS.predictability,
      flood: ok(w.flood) ? w.flood! : DEFAULT_WEIGHTS.flood,
    };
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

export function DetourApp({ initialMode }: { initialMode: "demo" | "live" }) {
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [departure, setDeparture] = useState<DepartureChoice>("now");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(true);
  const [announce, setAnnounce] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [isDesktop, setIsDesktop] = useState(false);
  const [searchH, setSearchH] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const sheet = useSheet();

  const mode = status.kind === "ready" || status.kind === "empty" ? status.data.mode : initialMode;

  useEffect(() => setWeights(loadWeights()), []);
  useEffect(() => {
    try {
      localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights));
    } catch {
      /* Private mode: settings just won't persist. */
    }
  }, [weights]);

  // Keep "now" honest so a result left open goes stale on screen, not just in theory.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const el = searchRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSearchH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const run = useCallback(
    async (o: Place | null = origin, d: Place | null = destination, dep: DepartureChoice = departure) => {
      if (!o || !d) return;
      if (Math.abs(o.lat - d.lat) < 1e-4 && Math.abs(o.lng - d.lng) < 1e-4) {
        setStatus({ kind: "error", code: "same_place", retry: false });
        return;
      }
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setStatus({ kind: "loading" });
      if (sheet.snap === "peek") sheet.setSnap("half");
      const t = new Date();
      setNow(t);
      try {
        const res = await fetch("/api/routes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: o,
            destination: d,
            departureTime: dep === "now" ? undefined : departureDate(dep, t).toISOString(),
          }),
          signal: ctrl.signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const code = (json.error as ErrorCode) in en.states.errors ? (json.error as ErrorCode) : "provider_failed";
          setStatus({
            kind: "error",
            code,
            retry: !["outside_bengaluru", "bad_request", "departure_in_past"].includes(code),
          });
          return;
        }
        const data = json as RoutesResponse;
        if (data.candidates.length === 0) {
          setStatus({ kind: "empty", data });
          return;
        }
        setStatus({ kind: "ready", data });
        setSearchOpen(false);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setStatus({ kind: "error", code: "network", retry: true });
      }
    },
    [origin, destination, departure, sheet],
  );

  // Search as soon as both ends are known, and again when the departure chip changes.
  useEffect(() => {
    if (origin && destination) void run(origin, destination, departure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, departure]);

  const data = status.kind === "ready" ? status.data : null;
  const ranked = useMemo(
    () => (data ? rankRoutes(data.candidates, weights, { departure: new Date(data.departureTime), now }) : []),
    [data, weights, now],
  );

  // New results: select the top pick. Re-ranks keep the user's selection.
  useEffect(() => {
    setExpandedId(null);
    if (data)
      setSelectedId(
        rankRoutes(data.candidates, weights, { departure: new Date(data.departureTime), now: new Date() })[0]?.candidate
          .route.id ?? null,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const topId = ranked[0]?.candidate.route.id;
  const prevTop = useRef<string | undefined>(undefined);
  const prevData = useRef<RoutesResponse | null>(null);
  useEffect(() => {
    if (prevData.current === data && prevTop.current && topId && prevTop.current !== topId) {
      setAnnounce(fmt(en.results.reranked, { label: ranked[0].candidate.route.label }));
    }
    prevTop.current = topId;
    prevData.current = data;
  }, [topId, data, ranked]);

  /** Tapping a card selects it and opens its steps; tapping the open card closes them. */
  function selectCard(id: string) {
    setExpandedId((open) => (open === id && selectedId === id ? null : id));
    setSelectedId(id);
  }

  function selectFromMap(id: string) {
    setSelectedId(id);
    setExpandedId(id);
    document.querySelector(`[data-route-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
    if (!isDesktop && sheet.snap === "peek") sheet.setSnap("half");
  }

  const isDefaultWeights = (Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[]).every(
    (k) => weights[k] === DEFAULT_WEIGHTS[k],
  );
  const monsoonActive = data?.monsoonActive ?? (status.kind === "empty" ? status.data.monsoonActive : false);
  const depDate = data ? new Date(data.departureTime) : departureDate(departure, now);

  const padding = isDesktop
    ? { top: 0, bottom: 0, left: 0, right: 0 }
    : { top: searchH, bottom: sheet.visiblePx, left: 0, right: 0 };

  return (
    <main className="relative h-dvh overflow-hidden min-[900px]:grid min-[900px]:grid-cols-[minmax(380px,440px)_1fr]">
      <a
        href="#routes"
        className="absolute top-2 left-2 z-50 -translate-y-20 rounded-lg bg-ink px-4 py-3 font-bold text-paper focus:translate-y-0"
      >
        {en.app.skipToRoutes}
      </a>

      {/* Left column on desktop. On mobile, the search floats on top and the results live in a bottom sheet. */}
      <div className="contents min-[900px]:flex min-[900px]:min-h-0 min-[900px]:flex-col min-[900px]:overflow-y-auto min-[900px]:border-r min-[900px]:border-rule min-[900px]:bg-paper">
        <div
          ref={searchRef}
          className="absolute inset-x-0 top-0 z-20 rounded-b-[20px] bg-paper px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 shadow-[0_8px_24px_-14px_rgb(19_32_27/0.5)] min-[900px]:static min-[900px]:rounded-none min-[900px]:px-6 min-[900px]:pt-6 min-[900px]:shadow-none"
        >
          <header className="mb-3 flex items-baseline justify-between gap-3">
            <h1 className="shrink-0 text-xl leading-none font-bold tracking-[-0.015em] whitespace-nowrap">
              <span
                className="mr-1.5 inline-block h-3 w-5 rounded-[2px] bg-[repeating-linear-gradient(-45deg,var(--kerb)_0_3px,var(--kerb-ink)_3px_6px)] align-[1px]"
                aria-hidden="true"
              />
              {en.app.name}
            </h1>
            <p className="hidden min-w-0 text-right text-xs leading-snug text-ink-soft min-[360px]:block">
              {en.app.promise}
            </p>
          </header>

          {!searchOpen && origin && destination && (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="pressable flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border-[1.5px] border-rule bg-paper-raised px-3 text-left min-[900px]:hidden"
              aria-expanded={false}
              data-testid="search-summary"
            >
              <span className="min-w-0 truncate text-base font-semibold">
                {origin.label} <span className="font-normal text-ink-soft">to</span> {destination.label}
              </span>
              <span className="shrink-0 text-sm font-semibold text-signboard">Edit</span>
            </button>
          )}
          <div className={!searchOpen && origin && destination ? "hidden min-[900px]:block" : ""}>
            <SearchPanel
              origin={origin}
              destination={destination}
              departure={departure}
              onOrigin={setOrigin}
              onDestination={setDestination}
              onDeparture={setDeparture}
              onSwap={() => {
                setOrigin(destination);
                setDestination(origin);
              }}
              onSubmit={() => void run()}
              onLocateError={(code) => setStatus({ kind: "error", code, retry: false })}
              busy={status.kind === "loading"}
            />
          </div>
        </div>

        <section
          className="sheet z-10 flex flex-col bg-paper min-[900px]:flex-1"
          style={isDesktop ? undefined : sheet.style}
          data-dragging={sheet.dragging}
          aria-labelledby="routes-h"
        >
          <button
            type="button"
            className="flex h-7 w-full shrink-0 touch-none items-center justify-center min-[900px]:hidden"
            aria-label={sheet.snap === "full" ? en.sheet.collapse : en.sheet.expand}
            aria-expanded={sheet.snap === "full"}
            {...sheet.handleProps}
          >
            <span className="h-1.5 w-11 rounded-full bg-rule" />
          </button>

          <div
            id="routes"
            tabIndex={-1}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] min-[900px]:px-5 min-[900px]:pt-2"
          >
            <h2 id="routes-h" ref={resultsHeadingRef} className="sr-only">
              {en.results.heading}
            </h2>
            {mode === "demo" && <DemoBanner />}

            {status.kind === "idle" && (
              <IdleState
                onExample={(e) => {
                  setOrigin(e.from);
                  setDestination(e.to);
                }}
              />
            )}
            {status.kind === "loading" && <LoadingState />}
            {status.kind === "error" && (
              <ErrorState code={status.code} onRetry={status.retry ? () => void run() : undefined} />
            )}
            {status.kind === "empty" && <EmptyState />}

            {status.kind === "ready" && (
              <>
                <div className="flex items-center justify-between gap-3 px-1">
                  <div className="min-w-0">
                    <p className="text-base leading-tight font-bold" data-testid="results-summary">
                      {ranked.length === 1
                        ? fmt(en.results.summaryOne, { when: whenLabel(departure, depDate) })
                        : fmt(en.results.summary, { count: ranked.length, when: whenLabel(departure, depDate) })}
                    </p>
                    <p className="text-sm text-ink-soft">
                      {isDefaultWeights ? en.results.rankedBy : en.results.rankedCustom}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen((o) => !o);
                      if (!settingsOpen && !isDesktop) sheet.setSnap("full");
                    }}
                    aria-expanded={settingsOpen}
                    aria-controls="settings"
                    className="pressable inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border-[1.5px] border-rule bg-paper-raised px-3 text-sm font-bold"
                    data-testid="tune"
                  >
                    <Icon name="sliders" size={18} />
                    {settingsOpen ? en.settings.toggleClose : en.settings.toggleOpen}
                  </button>
                </div>
                <div id="settings" hidden={!settingsOpen}>
                  {settingsOpen && (
                    <SettingsPanel weights={weights} onChange={setWeights} monsoonActive={data!.monsoonActive} />
                  )}
                </div>
                <RouteList ranked={ranked} selectedId={selectedId} expandedId={expandedId} onSelect={selectCard} />
              </>
            )}

            {(status.kind === "ready" || status.kind === "empty") && (
              <DataFreshness layers={status.data.layers} monsoonActive={monsoonActive} />
            )}
            <p className="sr-only" aria-live="polite" role="status">
              {announce}
            </p>
          </div>
        </section>
      </div>

      <div className="absolute inset-0 z-0 min-[900px]:relative">
        <RouteMap
          ranked={ranked}
          selectedId={selectedId}
          onSelect={selectFromMap}
          origin={origin}
          destination={destination}
          monsoonActive={monsoonActive}
          padding={padding}
        />
      </div>
    </main>
  );
}
