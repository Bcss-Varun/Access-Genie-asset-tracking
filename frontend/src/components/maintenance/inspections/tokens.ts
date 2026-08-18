import type { Inspection, InspectionQuestionType, InspectionResult, InspectionStatus, InspectionType } from '@access-genie/shared';

/**
 * The vocabulary the records list, the template library and the execution
 * screen all speak.
 *
 * One place, because a Failed inspection has to look the same wherever it
 * appears — a card and its row disagreeing about what colour "Failed" is, is
 * how a design system quietly stops being one.
 */

export const STATUS_PILL: Record<InspectionStatus, string> = {
  Scheduled: 'bg-slate-100 text-slate-700 border-slate-200',
  'In Progress': 'bg-amber-50 text-amber-700 border-amber-200',
  Passed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Failed: 'bg-red-50 text-red-700 border-red-200',
};

export const STATUS_DOT: Record<InspectionStatus, string> = {
  Scheduled: 'bg-slate-400',
  'In Progress': 'bg-amber-500',
  Passed: 'bg-health-good',
  Failed: 'bg-health-critical',
};

/** The graded outcome of one checkpoint. */
export const RESULT_PILL: Record<InspectionResult, string> = {
  Pass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Fail: 'bg-red-50 text-red-700 border-red-200',
  'N/A': 'bg-slate-100 text-slate-500 border-slate-200',
  Pending: 'bg-slate-50 text-slate-400 border-dashed border-slate-200',
};

export const TYPE_EMOJI: Record<InspectionType, string> = {
  Safety: '🦺',
  Compliance: '📜',
  Condition: '🔧',
  Operational: '⚙️',
  Preventive: '🛡️',
};

export const QUESTION_EMOJI: Record<InspectionQuestionType, string> = {
  'Pass/Fail': '✅',
  'Yes/No': '❓',
  Number: '🔢',
  Text: '✏️',
  Note: '📝',
};

/** What each question type asks for, shown beside it in the template editor. */
export const QUESTION_HINT: Record<InspectionQuestionType, string> = {
  'Pass/Fail': 'Inspector picks Pass, Fail or N/A.',
  'Yes/No': 'Inspector picks Yes, No or N/A. Set which answer is the failure.',
  Number: 'A reading. Set a min/max band to make it a test rather than a note.',
  Text: 'A short free-text answer — a serial, a reading, a name.',
  Note: 'Free-text observation. Never fails on its own.',
};

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

/**
 * How a scheduled date reads on a row.
 *
 * A completed inspection reports its outcome rather than a countdown: "4 days
 * overdue" on a check that was carried out last week is noise that makes the
 * estate look worse than it is.
 */
export function dueInfo(inspection: Inspection, now: number): { overdue: boolean; text: string } {
  if (inspection.status === 'Passed' || inspection.status === 'Failed') {
    return { overdue: false, text: inspection.completedAt ? `Done ${formatDateShort(inspection.completedAt)}` : 'Complete' };
  }

  const diff = Date.parse(inspection.scheduledFor) - now;
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

/** `<input type="date">` speaks `YYYY-MM-DD`. */
export function dateInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** How far through a checklist an inspection is, 0–100. */
export function completion(inspection: Inspection): number {
  const { total, pending } = inspection.summary;
  if (total === 0) return 0;
  return Math.round(((total - pending) / total) * 100);
}
