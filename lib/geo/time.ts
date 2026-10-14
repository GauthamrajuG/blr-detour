/** Bengaluru is UTC+05:30 all year (no daylight saving). */
const IST_OFFSET_MIN = 330;

export interface IstParts {
  ymd: string;
  month: number; // 1-12
  dayOfWeek: number; // 0 = Sunday
  minuteOfDay: number;
  hour: number;
}

export function istParts(d: Date): IstParts {
  const t = new Date(d.getTime() + IST_OFFSET_MIN * 60000);
  const minuteOfDay = t.getUTCHours() * 60 + t.getUTCMinutes();
  return {
    ymd: t.toISOString().slice(0, 10),
    month: t.getUTCMonth() + 1,
    dayOfWeek: t.getUTCDay(),
    minuteOfDay,
    hour: t.getUTCHours(),
  };
}

export function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export function inWindows(minuteOfDay: number, windows: [string, string][]): boolean {
  return windows.some(([a, b]) => minuteOfDay >= parseHHMM(a) && minuteOfDay < parseHHMM(b));
}

/** A Date for the next 8:00 AM IST after `now` (tomorrow if already past 8 today). */
export function tomorrowAt8Ist(now: Date): Date {
  const p = istParts(now);
  const base = Date.parse(`${p.ymd}T08:00:00+05:30`);
  return new Date(base + 24 * 3600 * 1000);
}
