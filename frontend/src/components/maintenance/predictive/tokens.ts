import type { PredictiveAlertStatus, PredictiveAlertType, PredictiveSeverity } from '@access-genie/shared';

/**
 * The vocabulary the table, the drawer and the dialogs all speak.
 *
 * One place, because a Critical alert has to look the same wherever it appears —
 * a row and its detail panel disagreeing about what colour "Critical" is, is how
 * a design system quietly stops being one.
 */

export const SEVERITY_PILL: Record<PredictiveSeverity, string> = {
  Critical: 'bg-red-50 text-red-700 border-red-200',
  High: 'bg-orange-50 text-orange-700 border-orange-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  Low: 'bg-slate-100 text-slate-600 border-slate-200',
};

/** The left rail on a row and the meter fill in the drawer. */
export const SEVERITY_BAR: Record<PredictiveSeverity, string> = {
  Critical: 'bg-health-critical',
  High: 'bg-orange-500',
  Medium: 'bg-amber-500',
  Low: 'bg-slate-300',
};

export const STATUS_PILL: Record<PredictiveAlertStatus, string> = {
  Open: 'bg-primary-50 text-primary-700 border-primary-200',
  Acknowledged: 'bg-amber-50 text-amber-700 border-amber-200',
  'Work Order Created': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  // Dismissed is deliberately the quietest thing on the board: it is a decision
  // to stop looking, and it should not compete with the alerts still waiting.
  Dismissed: 'bg-slate-50 text-slate-400 border-dashed border-slate-200',
  Resolved: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const TYPE_EMOJI: Record<PredictiveAlertType, string> = {
  'Impending Failure': '💥',
  'Degradation Trend': '📉',
  'Anomalous Reading': '〽️',
  'Thermal Stress': '🌡️',
  Vibration: '📳',
  'Battery Health': '🔋',
  'Capacity Exhaustion': '🧯',
  'Usage Threshold': '⏱️',
  'End of Life': '🪦',
};

// ── Dates ────────────────────────────────────────────────────────────────────
// UTC throughout, matching the rest of the app: a date rendered in the reader's
// timezone against a window computed in the server's would disagree by a day for
// anyone west of the API.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}

/** Date and time — what "detected at" needs, since two alerts a day apart is a trend. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  const hh = String(at.getUTCHours()).padStart(2, '0');
  const mm = String(at.getUTCMinutes()).padStart(2, '0');
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
}

/** "3 days ago" / "in 2 weeks". Relative to a `now` the caller pins per render. */
export function relative(iso: string | null | undefined, now: number): string {
  if (!iso) return '—';
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '—';

  const diff = at - now;
  const past = diff < 0;
  const minutes = Math.round(Math.abs(diff) / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return past ? `${minutes}m ago` : `in ${minutes}m`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return past ? `${hours}h ago` : `in ${hours}h`;

  const days = Math.round(hours / 24);
  if (days < 30) return past ? `${days}d ago` : `in ${days}d`;

  const months = Math.round(days / 30);
  return past ? `${months}mo ago` : `in ${months}mo`;
}

/**
 * How a confidence score reads.
 *
 * Banded rather than shown as a bare percentage everywhere, because 62% and 91%
 * call for different responses and a number alone leaves each reader to invent
 * their own threshold. The high band matches the server's
 * `HIGH_CONFIDENCE_THRESHOLD`, which is what the summary card counts at.
 */
export function confidenceBand(confidence: number): { label: string; text: string; bar: string } {
  if (confidence >= 80) return { label: 'High', text: 'text-emerald-700', bar: 'bg-emerald-500' };
  if (confidence >= 60) return { label: 'Moderate', text: 'text-amber-700', bar: 'bg-amber-500' };
  return { label: 'Low', text: 'text-slate-500', bar: 'bg-slate-400' };
}
