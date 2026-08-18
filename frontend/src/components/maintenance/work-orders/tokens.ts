import type { WorkOrder, WorkOrderPriority, WorkOrderSource, WorkOrderStatus, WorkOrderType } from '@access-genie/shared';
import { WORK_ORDER_SOURCE_LABELS } from '@access-genie/shared';

/**
 * The vocabulary the board and the list both speak.
 *
 * Both views render the same record, so a Critical order has to look Critical
 * in both — one set of pills, one set of labels, one place to change them.
 * Splitting these across the two views is how a card and its row end up
 * disagreeing about what colour "On Hold" is.
 *
 * Kept out of `shared.tsx` so that file exports components only, which is what
 * lets fast refresh work on it.
 */

export const STATUS_PILL: Record<WorkOrderStatus, string> = {
  New: 'bg-slate-100 text-slate-700 border-slate-200',
  Assigned: 'bg-primary-50 text-primary-700 border-primary-100',
  'In Progress': 'bg-amber-50 text-amber-700 border-amber-200',
  'On Hold': 'bg-slate-100 text-slate-600 border-slate-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

export const STATUS_DOT: Record<WorkOrderStatus, string> = {
  New: 'bg-slate-400',
  Assigned: 'bg-primary-500',
  'In Progress': 'bg-amber-500',
  'On Hold': 'bg-slate-400',
  Completed: 'bg-health-good',
  Cancelled: 'bg-slate-300',
};

export const PRIORITY_PILL: Record<WorkOrderPriority, string> = {
  Critical: 'bg-red-50 text-red-700 border-red-200',
  High: 'bg-amber-50 text-amber-700 border-amber-200',
  Medium: 'bg-primary-50 text-primary-700 border-primary-100',
  Low: 'bg-slate-100 text-slate-600 border-slate-200',
};

/** The left rail on a board card — priority at a glance, before reading. */
export const PRIORITY_RAIL: Record<WorkOrderPriority, string> = {
  Critical: 'border-l-health-critical',
  High: 'border-l-amber-500',
  Medium: 'border-l-primary-500',
  Low: 'border-l-slate-300',
};

export const TYPE_EMOJI: Record<WorkOrderType, string> = {
  Preventive: '🛡️',
  Corrective: '🔧',
  Inspection: '🔎',
  // Parked, but records still carry it — see ACTIVE_WORK_ORDER_TYPES.
  Predictive: '📈',
};

const SOURCE_EMOJI: Record<string, string> = {
  Manual: '✍️',
  'Scheduled Maintenance': '🔁',
  'Inspection Failure': '⚠️',
};

/** A missing `source` is a hand-raised order from before the field existed. */
export function sourceLabel(source: WorkOrderSource | undefined): string {
  const value = source ?? 'Manual';
  return WORK_ORDER_SOURCE_LABELS[value as keyof typeof WORK_ORDER_SOURCE_LABELS] ?? value;
}

export function sourceEmoji(source: WorkOrderSource | undefined): string {
  return SOURCE_EMOJI[source ?? 'Manual'] ?? '📄';
}

// ── Dates ────────────────────────────────────────────────────────────────────
// UTC throughout, matching the rest of the app: a due date rendered in the
// reader's timezone against an overdue flag computed in the server's would
// disagree by a day for anyone west of the API.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
}

export interface DueInfo {
  overdue: boolean;
  text: string;
}

/**
 * How a due date reads on a card.
 *
 * A closed order reports its outcome instead of a countdown: "Overdue 4d" on a
 * job that was finished last week is noise that makes a board look worse than
 * the estate is.
 */
export function dueInfo(workOrder: WorkOrder, now: number): DueInfo {
  if (workOrder.status === 'Completed') return { overdue: false, text: 'Completed' };
  if (workOrder.status === 'Cancelled') return { overdue: false, text: 'Cancelled' };

  const diff = Date.parse(workOrder.dueDate) - now;
  if (!Number.isFinite(diff)) return { overdue: false, text: '—' };

  const days = Math.round(Math.abs(diff) / 86_400_000);
  const unit = days === 1 ? 'day' : 'days';

  if (diff < 0) return { overdue: true, text: days === 0 ? 'Overdue today' : `${days} ${unit} overdue` };
  if (days === 0) return { overdue: false, text: 'Due today' };
  return { overdue: false, text: `Due in ${days} ${unit}` };
}

export function initials(name: string): string {
  if (!name || name === 'Unassigned') return '—';
  const parts = name.replace(/[^A-Za-z ]/g, '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '—';
}

