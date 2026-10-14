/** Authored icon set: 24px grid, 1.75 stroke, round caps. No emoji or glyph stand-ins. */
const paths = {
  swap: "M7 4v16M7 4 4 7M7 4l3 3M17 20V4m0 16-3-3m3 3 3-3",
  locate: "M12 3v3m0 12v3M3 12h3m12 0h3M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-3a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  close: "M6 6l12 12M18 6 6 18",
  sliders: "M4 7h9m4 0h3M4 17h3m4 0h9M15 4v6M9 14v6",
  chevron: "m6 9 6 6 6-6",
  drop: "M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5Z",
  cone: "M9.5 4h5l4.5 15H5L9.5 4Zm-2 8h9M3 19.5h18",
  alert: "M12 8v5m0 3.5v.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  info: "M12 11v6m0-9.5v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  pin: "M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  dot: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  junction: "M12 3v18M3 12h18",
  arrive: "M5 21V4m0 0h11l-2 4 2 4H5",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={paths[name]} />
    </svg>
  );
}
