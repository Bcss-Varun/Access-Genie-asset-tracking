/**
 * Fixture loading helpers.
 *
 * The seed data is JSON, so every timestamp arrives as a string. Mongo wants
 * real `Date`s — a string in a date field is either rejected or, worse,
 * silently stored as a string that then sorts lexicographically. Rather than
 * hand-writing a mapper per collection (fifty of them, each a chance to miss a
 * nested field), each collection declares which paths are dates and this
 * converts them.
 */

/** Fixture records carry `id`; Mongo wants `_id`. */
export function withId<T extends { id: string }>(record: T): Omit<T, 'id'> & { _id: string } {
  const { id, ...rest } = record;
  return { ...rest, _id: id };
}

/** Re-key a record onto a different field as its `_id` (e.g. presence by assetId). */
export function keyedBy<T extends Record<string, unknown>>(field: keyof T & string) {
  return (record: T): Omit<T, typeof field> & { _id: string } => {
    const { [field]: key, ...rest } = record;
    return { ...rest, _id: String(key) } as Omit<T, typeof field> & { _id: string };
  };
}

/**
 * The instant the fixture set was authored against. Every timestamp in
 * `seed/data` is positioned relative to this — "raised 3 hours ago", "due
 * tomorrow", "last verified last night".
 */
const FIXTURE_ANCHOR = Date.parse('2026-07-23T09:00:00.000Z');

/**
 * Shift applied to every seeded timestamp, so the newest data is as old as the
 * seed run rather than as old as the fixture file.
 *
 * Without it, a screen that says "raised 3h ago" starts saying "raised 40d ago"
 * a month after the fixtures were written — the relationships between the
 * timestamps are right but the whole set has drifted into the past. Shifting
 * them together preserves every interval exactly while making the data as
 * recent as the moment it was loaded, which is what it actually is.
 *
 * Computed once per process so a single seed run is internally consistent.
 */
const OFFSET_MS = Date.now() - FIXTURE_ANCHOR;

/**
 * A path to a date field. `'raisedAt'` for a plain field, `'timeline[].at'` for
 * a field on every element of an array, `'a.b'` for a nested object.
 */
export type DatePath = string;

function convert(node: unknown, segments: string[]): void {
  if (node === null || typeof node !== 'object') return;

  const [head, ...rest] = segments;
  if (!head) return;

  if (head.endsWith('[]')) {
    const key = head.slice(0, -2);
    const list = (node as Record<string, unknown>)[key];
    if (Array.isArray(list)) for (const item of list) convert(item, rest);
    return;
  }

  const container = node as Record<string, unknown>;

  if (rest.length === 0) {
    const value = container[head];
    // Absent optional timestamps stay absent — writing `undefined` would put an
    // explicit null in the document where the schema expects nothing at all.
    if (typeof value === 'string' && value) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) container[head] = new Date(parsed + OFFSET_MS);
    }
    return;
  }

  convert(container[head], rest);
}

/** Convert the named paths on a record from ISO strings to `Date`s, in place. */
export function withDates<T extends object>(record: T, paths: DatePath[]): T {
  for (const path of paths) convert(record, path.split('.'));
  return record;
}

/** `withDates` over a list — the shape every seed step actually uses. */
export function datesOn<T extends object>(rows: T[], paths: DatePath[]): T[] {
  return rows.map((row) => withDates(structuredClone(row), paths));
}

/** Highest numeric suffix across a set of IDs — `['AST-9','AST-1014']` → 1014. */
export function highestSuffix(ids: string[]): number {
  return ids.reduce((max, id) => {
    const suffix = Number.parseInt(id.split('-').pop() ?? '', 10);
    return Number.isFinite(suffix) && suffix > max ? suffix : max;
  }, 0);
}
