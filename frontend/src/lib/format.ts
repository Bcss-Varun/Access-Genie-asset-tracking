/** Tiny className combiner — filters falsy values and joins with spaces. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Indian digit grouping (last three, then pairs): 1234567 → "12,34,567".
 * Hand-rolled rather than `toLocaleString('en-IN')` so the output is identical
 * on every runtime regardless of its ICU build.
 */
export function groupINR(n: number): string {
  const s = Math.round(Math.abs(n)).toString();
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}

/** Compact INR (lakh/crore): ₹2,084 Cr · ₹7.2 L · ₹17,800. */
export function formatMoney(n: number | undefined | null): string {
  if (n === undefined || n === null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';

  const unit = (v: number) => {
    const r = Math.round(v * 10) / 10;
    return r >= 100 ? groupINR(r) : r.toString();
  };

  if (abs >= 1_00_00_000) return `${sign}₹${unit(abs / 1_00_00_000)} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${unit(abs / 1_00_000)} L`;
  return `${sign}₹${groupINR(abs)}`;
}

/** Full rupee amount with grouping: ₹8,50,000. */
export function formatRupees(n: number | undefined | null): string {
  return n === undefined || n === null ? '—' : `₹${groupINR(n)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Indian-style date: "20 Jan 2020". Read in UTC — the tenant clock is IST. */
export function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const d = new Date(t);
  const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return `${formatDate(iso)}, ${time} UTC`;
}

/**
 * Relative time against the real clock. The seeded fixtures are anchored to a
 * fixed demo date, so a freshly-seeded database shows plausible relative ages
 * without any of the timestamps drifting between renders.
 */
export function relTime(iso: string | undefined | null): string {
  if (!iso) return '—';
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return '—';

  const future = diff < 0;
  const seconds = Math.floor(Math.abs(diff) / 1000);
  const fmt = (n: number, unit: string) => (future ? `in ${n}${unit}` : `${n}${unit} ago`);

  if (seconds < 60) return future ? 'just now' : `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return fmt(minutes, 'm');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return fmt(hours, 'h');
  return fmt(Math.floor(hours / 24), 'd');
}

/** True when a due date has passed — the one definition of "overdue". */
export function isOverdue(iso: string | undefined | null): boolean {
  return !!iso && Date.parse(iso) < Date.now();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
