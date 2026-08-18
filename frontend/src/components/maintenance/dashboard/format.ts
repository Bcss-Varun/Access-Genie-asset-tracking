/**
 * Date and duration formatting for the Maintenance Dashboard.
 *
 * UTC throughout, matching the rest of the app: a due date rendered in the
 * reader's timezone against an overdue count computed in the server's would
 * disagree by a day for anyone west of the API — and "3 days overdue" next to
 * a date that reads as tomorrow is how a correct dashboard loses its
 * credibility.
 *
 * Kept out of `shell.tsx` so that file exports components only, which is what
 * lets fast refresh work on it.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}

export function formatDateShort(iso: string | null): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
}

/** "3 days overdue" / "due in 5 days" — the phrasing the tables sort by. */
export function describeDue(daysOverdue: number, overdue: boolean): string {
  const magnitude = Math.abs(daysOverdue);
  const unit = magnitude === 1 ? 'day' : 'days';
  if (overdue && daysOverdue > 0) return `${magnitude} ${unit} overdue`;
  if (daysOverdue === 0) return 'due today';
  return `due in ${magnitude} ${unit}`;
}

export function formatRelative(iso: string, now: number): string {
  const diff = now - Date.parse(iso);
  if (!Number.isFinite(diff)) return '';
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.round(diff / 86_400_000)}d ago`;
  return formatDateShort(iso);
}
