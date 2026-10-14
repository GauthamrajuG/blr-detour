/** Small deterministic hash (FNV-1a) for stable mock jitter. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic value in [-1, 1] for a key. */
export function jitter(key: string): number {
  return (hash(key) % 2001) / 1000 - 1;
}
