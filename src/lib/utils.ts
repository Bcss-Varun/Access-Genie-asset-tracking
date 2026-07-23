/** Tiny className combiner — filters falsy values and joins with spaces. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** Compact USD formatter: $1.2M / $74k / $250. */
export function formatMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n.toLocaleString()}`;
}

/** Demo clock — mock data anchors timestamps here (deterministic, no hydration drift). */
export const DEMO_NOW = Date.parse('2026-07-23T09:00:00.000Z');

export function relTime(iso: string): string {
  const diff = DEMO_NOW - Date.parse(iso);
  if (Number.isNaN(diff)) return '';
  const future = diff < 0;
  const s = Math.floor(Math.abs(diff) / 1000);
  const fmt = (n: number, unit: string) => (future ? `in ${n}${unit}` : `${n}${unit} ago`);
  if (s < 60) return future ? 'just now' : `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return fmt(m, 'm');
  const h = Math.floor(m / 60);
  if (h < 24) return fmt(h, 'h');
  return fmt(Math.floor(h / 24), 'd');
}
