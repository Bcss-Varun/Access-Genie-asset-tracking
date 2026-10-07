/**
 * Record ordering — one rule for both sides.
 *
 * Business IDs are strings (`AST-12`, `WO-107`), so a plain string sort puts
 * `AST-10` between `AST-1` and `AST-2`. On a fresh install that happens from the
 * tenth record onwards, and the record someone just created lands in the middle
 * of a list (or on another page of it) instead of where they expect it.
 */

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Compare two business IDs by their number, not their spelling. */
export function compareIds(a: string | undefined | null, b: string | undefined | null): number {
  return collator.compare(a ?? '', b ?? '');
}

function timeOf(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

/**
 * Newest record first: by creation time, then by ID number (later IDs were
 * minted later, so they break ties between records created in the same instant).
 */
export function newestFirst<T extends { createdAt?: unknown; id?: string; _id?: unknown }>(a: T, b: T): number {
  const byTime = timeOf(b.createdAt) - timeOf(a.createdAt);
  if (byTime !== 0) return byTime;
  return compareIds(String(b.id ?? b._id ?? ''), String(a.id ?? a._id ?? ''));
}
