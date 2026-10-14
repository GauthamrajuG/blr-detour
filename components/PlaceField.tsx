"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Place } from "@/lib/engine/types";
import type { GeocodeResponse } from "@/lib/schema";
import { en, fmt } from "@/messages/en";
import { Icon } from "./Icon";

type Option = GeocodeResponse["results"][number];

interface Props {
  label: string;
  placeholder: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  /** Optional trailing action, e.g. "Use my location". */
  action?: React.ReactNode;
  testId: string;
}

/**
 * ARIA 1.2 combobox with a listbox popup. Arrow keys move, Enter picks, Escape closes.
 * Typing without picking and pressing Enter takes the first suggestion.
 */
export function PlaceField({ label, placeholder, value, onChange, action, testId }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState(value?.label ?? "");
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqRef = useRef(0);

  // Keep the visible text in sync when the place changes from outside (swap, examples, locate).
  useEffect(() => {
    setText(value?.label ?? "");
  }, [value]);

  useEffect(() => {
    const q = text.trim();
    if (!open || q.length < 1 || q === value?.label) {
      setOptions([]);
      setSearched(false);
      return;
    }
    const n = ++reqRef.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data = (await res.json()) as GeocodeResponse;
        if (n !== reqRef.current) return;
        setOptions(data.results);
        setActive(data.results.length ? 0 : -1);
        setSearched(true);
      } catch {
        /* Offline: the list stays empty; submitting shows the network error. */
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [text, open, value?.label]);

  function pick(o: Option) {
    onChange({ label: o.label, lat: o.lat, lng: o.lng });
    setText(o.label);
    setOpen(false);
    setOptions([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      if (open && options.length > 0) {
        e.preventDefault();
        pick(options[Math.max(0, active)]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  }

  const showList = open && (options.length > 0 || (searched && text.trim().length > 0));

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink-soft">
        {label}
      </label>
      <div className="flex items-center gap-1 rounded-xl border-[1.5px] border-rule bg-paper-raised focus-within:border-signboard">
        <input
          ref={inputRef}
          id={id}
          data-testid={testId}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            if (value) onChange(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-base text-ink placeholder:text-ink-soft focus:outline-none"
        />
        {text && (
          <button
            type="button"
            onClick={() => {
              setText("");
              onChange(null);
              inputRef.current?.focus();
            }}
            className="pressable grid size-11 shrink-0 place-items-center rounded-lg text-ink-soft"
            aria-label={fmt(en.search.clear, { field: label })}
          >
            <Icon name="close" size={18} />
          </button>
        )}
        {action}
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-xl border border-rule bg-paper-raised py-1 shadow-[0_10px_30px_-12px_rgb(19_32_27/0.45)]"
        >
          {options.length === 0 ? (
            <li className="px-3 py-3 text-sm text-ink-soft" role="presentation">
              {en.search.noMatches}
            </li>
          ) : (
            options.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 text-base ${
                  i === active ? "bg-signboard-wash" : ""
                }`}
              >
                <Icon name="pin" size={18} className="shrink-0 text-ink-soft" />
                {o.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
