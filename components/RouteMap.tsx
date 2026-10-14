"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MLMap, StyleSpecification, GeoJSONSource, LngLatBoundsLike } from "maplibre-gl";
import type { Place, RankedRoute } from "@/lib/engine/types";
import { layersGeoJSON } from "@/lib/geo/zones";
import { en } from "@/messages/en";
import { RouteSketch } from "./RouteSketch";

interface Props {
  ranked: RankedRoute[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  origin: Place | null;
  destination: Place | null;
  monsoonActive: boolean;
  /** Space covered by overlays (search panel, bottom sheet), so routes fit in the visible part. */
  padding: { top: number; bottom: number; left: number; right: number };
}

/** OpenFreeMap: free, no key, OpenStreetMap data. Override with NEXT_PUBLIC_MAP_STYLE_URL. */
const DEFAULT_STYLE = "https://tiles.openfreemap.org/styles/positron";
const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_STYLE;
const BLR_CENTER: [number, number] = [77.62, 12.96];
const CONTEXT = layersGeoJSON();

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#7f938a";
}

/** Plain background used when street tiles can't load. Routes and context still draw. */
function fallbackStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: "bg", type: "background", paint: { "background-color": cssVar("--map-bg") } }],
  };
}

export function RouteMap({ ranked, selectedId, onSelect, origin, destination, monsoonActive, padding }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  // Bumped on every style load (including the fallback), so data effects re-apply.
  const [styleVersion, setStyleVersion] = useState(0);
  const [tilesFailed, setTilesFailed] = useState(false);
  /** WebGL or the worker failed: the SVG sketch stays as the map. */
  const [mapFailed, setMapFailed] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Create the map once, and only when there are routes to show. Until then the idle
  // screen needs no map, and skipping the 1 MB library keeps first load fast. The SVG
  // sketch covers the gap while it loads.
  const wantMap = ranked.length > 0;
  useEffect(() => {
    if (!wantMap || mapRef.current) return;
    let cancelled = false;
    let fellBack = false;
    (async () => {
      const [ml] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]);
      if (cancelled || !containerRef.current) return;
      ml.setWorkerUrl(`/maplibre/maplibre-gl-worker.mjs?v=${ml.getVersion()}`);
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      let map: MLMap;
      try {
        map = new ml.Map({
          container: containerRef.current,
          style:
            dark && !process.env.NEXT_PUBLIC_MAP_STYLE_URL ? "https://tiles.openfreemap.org/styles/dark" : STYLE_URL,
          center: BLR_CENTER,
          zoom: 11,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
          fadeDuration: 0,
        });
      } catch {
        setMapFailed(true);
        return;
      }
      map.touchZoomRotate.disableRotation();
      mapRef.current = map;

      const fallBack = () => {
        if (fellBack || cancelled) return;
        fellBack = true;
        setTilesFailed(true);
        map.setStyle(fallbackStyle());
      };
      const timer = setTimeout(() => {
        if (!map.isStyleLoaded()) fallBack();
      }, 6000);
      map.on("error", (e: { error?: { message?: string } }) => {
        if (/worker/i.test(e.error?.message ?? "")) return setMapFailed(true);
        // Style or tile fetch failures. Only fall back if the style itself never loaded.
        if (!map.isStyleLoaded()) fallBack();
        else if (process.env.NODE_ENV !== "production") console.warn("map", e.error?.message);
      });
      map.on("style.load", () => {
        clearTimeout(timer);
        addLayers(map);
        setReady(true);
        setStyleVersion((v) => v + 1);
      });

      for (const layer of ["routes-other", "routes-sel"]) {
        map.on("click", layer, (e: { features?: { properties?: Record<string, unknown> }[] }) => {
          const id = e.features?.[0]?.properties?.id;
          if (typeof id === "string") onSelectRef.current(id);
        });
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wantMap]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  // Route data and selection.
  const routeKey = ranked
    .map((r) => r.candidate.route.id)
    .sort()
    .join("|");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const apply = () => {
      const src = map.getSource("routes") as GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: "FeatureCollection",
        features: ranked.map((r) => ({
          type: "Feature",
          properties: { id: r.candidate.route.id, selected: r.candidate.route.id === selectedId },
          geometry: { type: "LineString", coordinates: r.candidate.route.path },
        })),
      });
      const ends = map.getSource("ends") as GeoJSONSource | undefined;
      ends?.setData({
        type: "FeatureCollection",
        features: [origin && { kind: "origin", p: origin }, destination && { kind: "destination", p: destination }]
          .filter((x): x is { kind: string; p: Place } => Boolean(x))
          .map((x) => ({
            type: "Feature" as const,
            properties: { kind: x.kind },
            geometry: { type: "Point" as const, coordinates: [x.p.lng, x.p.lat] },
          })),
      });
      // Only show the chokepoints, works, and flood roads these routes actually touch.
      const touched = Array.from(
        new Set(
          ranked.flatMap((r) => [
            ...r.candidate.context.chokepoints.map((z) => z.id),
            ...r.candidate.context.works.map((w) => w.id),
            ...(monsoonActive ? r.candidate.context.floods.map((f) => f.id) : []),
          ]),
        ),
      );
      const near = ["in", ["get", "id"], ["literal", touched]] as const;
      map.setFilter("ctx-flood", ["all", ["==", ["get", "layer"], "flood"], near] as never);
      map.setFilter("ctx-works", [
        "all",
        ["==", ["get", "layer"], "works"],
        ["==", ["geometry-type"], "LineString"],
        near,
      ] as never);
      map.setFilter("ctx-corridor", [
        "all",
        ["==", ["get", "layer"], "chokepoint"],
        ["==", ["geometry-type"], "LineString"],
        near,
      ] as never);
      map.setFilter("ctx-chokepoint", [
        "all",
        ["==", ["get", "layer"], "chokepoint"],
        ["==", ["geometry-type"], "Point"],
        near,
      ] as never);
    };
    apply();
  }, [ranked, selectedId, ready, styleVersion, origin, destination, monsoonActive]);

  // Selected route: grow the line in so the eye finds it. 240 ms ease-out, skipped under reduced motion.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer("routes-sel")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      map.setPaintProperty("routes-sel", "line-width", 6);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 240);
      const eased = 1 - Math.pow(1 - k, 3);
      map.setPaintProperty("routes-sel", "line-width", 2 + 4 * eased);
      map.setPaintProperty("routes-sel-casing", "line-width", 4 + 6 * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selectedId, ready, styleVersion]);

  // Fit all routes into the visible part of the map when a new set arrives.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || ranked.length === 0) return;
    let minX = 180,
      minY = 90,
      maxX = -180,
      maxY = -90;
    for (const r of ranked)
      for (const [x, y] of r.candidate.route.path) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bounds: LngLatBoundsLike = [
      [minX, minY],
      [maxX, maxY],
    ];
    const pad = {
      top: padding.top + 32,
      bottom: padding.bottom + 32,
      left: padding.left + 32,
      right: padding.right + 32,
    };
    try {
      map.fitBounds(bounds, { padding: pad, duration: reduce ? 0 : 450, maxZoom: 14 });
    } catch {
      map.fitBounds(bounds, { padding: 24, duration: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, ready, padding.top, padding.bottom, padding.left]);

  return (
    <div
      className="absolute inset-0"
      role="region"
      aria-label={en.map.label}
      style={{ background: "var(--map-bg)" }}
      data-testid="map-region"
      data-selected-route={selectedId ?? ""}
    >
      {(!ready || mapFailed) && (
        <RouteSketch
          ranked={ranked}
          selectedId={selectedId}
          onSelect={onSelect}
          origin={origin}
          destination={destination}
          padding={padding}
        />
      )}
      <div
        ref={containerRef}
        // MapLibre's CSS sets position: relative on this element, so size it with h/w, not inset.
        className="h-full w-full"
        style={{ opacity: ready && !mapFailed ? 1 : 0, transition: "opacity 200ms ease" }}
        data-testid="map"
        data-map-ready={ready && !mapFailed}
      />
      {(tilesFailed || mapFailed) && (
        <p
          className="absolute right-3 rounded-lg bg-paper-raised px-3 py-1.5 text-xs text-ink-soft shadow-[0_4px_14px_-6px_rgb(19_32_27/0.4)]"
          style={{ top: padding.top + 8 }}
          role="status"
        >
          {mapFailed ? en.map.sketchOnly : en.map.tilesFailed}
        </p>
      )}
    </div>
  );
}

function addLayers(map: MLMap) {
  const c = {
    kerb: cssVar("--kerb"),
    ink: cssVar("--ink"),
    inkSoft: cssVar("--ink-soft"),
    paper: cssVar("--paper-raised"),
    flood: cssVar("--flood"),
    signboard: cssVar("--signboard"),
    muted: cssVar("--route-muted"),
  };
  const empty = { type: "FeatureCollection" as const, features: [] };
  if (!map.getSource("context")) map.addSource("context", { type: "geojson", data: CONTEXT });
  if (!map.getSource("routes")) map.addSource("routes", { type: "geojson", data: empty });
  if (!map.getSource("ends")) map.addSource("ends", { type: "geojson", data: empty });

  const add = (layer: Parameters<MLMap["addLayer"]>[0]) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  };
  add({
    id: "ctx-corridor",
    type: "line",
    source: "context",
    filter: ["all", ["==", ["get", "layer"], "chokepoint"], ["==", ["geometry-type"], "LineString"]],
    paint: { "line-color": c.kerb, "line-width": 9, "line-opacity": 0.45 },
    layout: { "line-cap": "round" },
  });
  add({
    id: "ctx-works",
    type: "line",
    source: "context",
    filter: ["all", ["==", ["get", "layer"], "works"], ["==", ["geometry-type"], "LineString"]],
    paint: { "line-color": c.inkSoft, "line-width": 2, "line-dasharray": [2, 2] },
  });
  add({
    id: "ctx-flood",
    type: "circle",
    source: "context",
    filter: ["==", ["get", "layer"], "flood"],
    paint: {
      "circle-radius": 7,
      "circle-color": c.flood,
      "circle-opacity": 0.75,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": c.paper,
    },
  });
  add({
    id: "routes-other",
    type: "line",
    source: "routes",
    filter: ["==", ["get", "selected"], false],
    paint: { "line-color": c.muted, "line-width": 4, "line-opacity": 0.85 },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  add({
    id: "routes-sel-casing",
    type: "line",
    source: "routes",
    filter: ["==", ["get", "selected"], true],
    paint: { "line-color": c.paper, "line-width": 10 },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  add({
    id: "routes-sel",
    type: "line",
    source: "routes",
    filter: ["==", ["get", "selected"], true],
    paint: { "line-color": c.signboard, "line-width": 6 },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  add({
    id: "ctx-chokepoint",
    type: "circle",
    source: "context",
    filter: ["all", ["==", ["get", "layer"], "chokepoint"], ["==", ["geometry-type"], "Point"]],
    paint: { "circle-radius": 7, "circle-color": c.kerb, "circle-stroke-width": 2.5, "circle-stroke-color": c.ink },
  });
  add({
    id: "ends",
    type: "circle",
    source: "ends",
    paint: {
      "circle-radius": 8,
      "circle-color": ["match", ["get", "kind"], "origin", c.ink, c.signboard],
      "circle-stroke-width": 3,
      "circle-stroke-color": c.paper,
    },
  });
}
