"use client";

import { useLayoutEffect, useRef } from "react";
import type { RankedRoute } from "@/lib/engine/types";
import { RouteCard } from "./RouteCard";

interface Props {
  ranked: RankedRoute[];
  selectedId: string | null;
  expandedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Cards slide to their new places when the ranking changes (FLIP), so a re-rank is
 * visible rather than a jump. 260 ms ease-in-out: on-screen movement, per Emil Kowalski.
 * Interruptible: a new re-rank cancels the running animation and starts from the
 * current position. Skipped entirely under reduced motion.
 */
export function RouteList({ ranked, selectedId, expandedId, onSelect }: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  const prev = useRef(new Map<string, number>());
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const order = ranked.map((r) => r.candidate.route.id).join("|");

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const items = Array.from(list.querySelectorAll<HTMLElement>("[data-route-id]"));
    const next = new Map<string, number>();
    for (const el of items) {
      const id = el.dataset.routeId!;
      const top = el.getBoundingClientRect().top;
      next.set(id, top);
      const before = prev.current.get(id);
      if (reduce || before === undefined) continue;
      const dy = before - top;
      if (Math.abs(dy) < 1) continue;
      el.getAnimations().forEach((a) => a.cancel());
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], {
        duration: 260,
        easing: "cubic-bezier(0.77, 0, 0.175, 1)",
      });
    }
    prev.current = next;
  }, [order]);

  function nav(from: number, dir: 1 | -1) {
    const target = ranked[from + dir];
    if (target) buttons.current.get(target.candidate.route.id)?.focus();
  }

  return (
    <ol ref={listRef} className="flex flex-col gap-1" data-testid="route-list">
      {ranked.map((r, i) => {
        const id = r.candidate.route.id;
        return (
          <RouteCard
            key={id}
            ref={(el) => {
              if (el) buttons.current.set(id, el);
              else buttons.current.delete(id);
            }}
            ranked={r}
            selected={id === selectedId}
            expanded={id === expandedId}
            onSelect={() => onSelect(id)}
            onKeyNav={(dir) => nav(i, dir)}
          />
        );
      })}
    </ol>
  );
}
