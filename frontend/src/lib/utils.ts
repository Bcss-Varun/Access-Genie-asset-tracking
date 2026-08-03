/** Tiny className combiner — filters falsy values and joins with spaces. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Indian digit grouping (last 3, then pairs): 1234567 → "12,34,567".
 * Hand-rolled rather than `toLocaleString('en-IN')` so server and client always
 * agree regardless of the runtime's ICU build (no hydration drift).
 */
export function groupINR(n: number): string {
  const s = Math.round(Math.abs(n)).toString();
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}

/** Plain INR with digit grouping: ₹17,800. `—` when there is no figure. */
export function formatRupees(n: number | undefined | null): string {
  return n === undefined || n === null ? '—' : `₹${groupINR(n)}`;
}

/** Compact INR formatter (lakh/crore): ₹2,084 Cr / ₹7.2 L / ₹17,800. */
export function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  // One decimal below 100 units, grouped whole units above (₹2,084 Cr).
  const unit = (v: number) => {
    const r = Math.round(v * 10) / 10;
    return r >= 100 ? groupINR(r) : r.toString();
  };
  if (abs >= 1_00_00_000) return `${sign}₹${unit(abs / 1_00_00_000)} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${unit(abs / 1_00_000)} L`;
  return `${sign}₹${groupINR(abs)}`;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Indian-style date: "20 Jan 2020". Read in UTC and formatted by hand so the
 * server and the browser never disagree (the app is timezone-agnostic; the
 * tenant clock is IST).
 */
export function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Clock time, "14:02". UTC-fixed for the same reason as `formatDate`. */
export function formatTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** "23 Jul 2026 · 14:02" — a whole timestamp on one line. */
export function formatDateTime(iso: string): string {
  const date = formatDate(iso);
  return date ? `${date} · ${formatTime(iso)}` : '';
}

/** Calendar day key, for grouping a list of timestamps under date headings. */
export function dayKey(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * The clock everything relative is measured against.
 *
 * A function rather than a constant: a constant would be captured when the
 * module first loads and would then quietly stop advancing, so a screen left
 * open would keep reporting the same "3m ago" all afternoon.
 *
 * The seeded dataset is shifted to the moment it was loaded (see the backend's
 * seed/fixtures.ts), so relative labels read naturally against a real clock.
 */
export const nowMs = (): number => Date.now();

export function relTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const diff = nowMs() - Date.parse(iso);
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

/** Past its due date. Used to badge work orders, PMs and certifications. */
export function isOverdue(iso: string | undefined | null): boolean {
  return !!iso && Date.parse(iso) < nowMs();
}

/** "1 asset" / "4 assets" — count and noun agreeing, in one call. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
