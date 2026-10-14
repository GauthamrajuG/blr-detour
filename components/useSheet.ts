"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type Snap = "peek" | "half" | "full";
const ORDER: Snap[] = ["peek", "half", "full"];

/**
 * Bottom sheet with three heights. Drag the handle and it follows the finger with no
 * transition; on release it snaps (320 ms, iOS drawer curve) to the nearest height,
 * biased by flick velocity. Tap or Enter on the handle steps up; arrow keys step.
 * A new drag interrupts a running snap from wherever it is.
 */
export function useSheet() {
  const [snap, setSnap] = useState<Snap>("half");
  const [vh, setVh] = useState(800);
  const [dragPx, setDragPx] = useState<number | null>(null);
  const drag = useRef<{
    startY: number;
    startVisible: number;
    lastY: number;
    lastT: number;
    v: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const update = () => setVh(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const heights = useMemo(() => ({ peek: 176, half: Math.round(vh * 0.54), full: Math.round(vh * 0.88) }), [vh]);
  const visiblePx = dragPx ?? heights[snap];

  const step = useCallback((dir: 1 | -1) => {
    setSnap((s) => ORDER[Math.min(2, Math.max(0, ORDER.indexOf(s) + dir))]);
  }, []);

  const handleProps = {
    onPointerDown: (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = {
        startY: e.clientY,
        startVisible: heights[snap],
        lastY: e.clientY,
        lastT: e.timeStamp,
        v: 0,
        moved: false,
      };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dy = e.clientY - d.startY;
      if (Math.abs(dy) > 6) d.moved = true;
      if (!d.moved) return;
      const dt = Math.max(1, e.timeStamp - d.lastT);
      d.v = (e.clientY - d.lastY) / dt; // px per ms, positive = downward
      d.lastY = e.clientY;
      d.lastT = e.timeStamp;
      setDragPx(Math.min(heights.full, Math.max(96, d.startVisible - dy)));
    },
    onPointerUp: () => {
      const d = drag.current;
      drag.current = null;
      if (!d || !d.moved || dragPx === null) {
        setDragPx(null);
        return;
      }
      // Project 120 ms ahead along the flick, then pick the nearest height.
      const projected = dragPx - d.v * 120;
      const nearest = ORDER.reduce((a, b) =>
        Math.abs(heights[b] - projected) < Math.abs(heights[a] - projected) ? b : a,
      );
      setSnap(nearest);
      setDragPx(null);
    },
    onPointerCancel: () => {
      drag.current = null;
      setDragPx(null);
    },
    onClick: (e: React.MouseEvent) => {
      // Pointer drags end with a click event; only treat true taps and keyboard as steps.
      if (e.detail > 0 && drag.current === null && dragPx !== null) return;
      setSnap((s) => (s === "full" ? "half" : ORDER[ORDER.indexOf(s) + 1]));
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        step(-1);
      }
    },
  };

  return {
    snap,
    setSnap,
    visiblePx,
    dragging: dragPx !== null,
    style: { "--visible": `${visiblePx}px` } as React.CSSProperties,
    handleProps,
  };
}
