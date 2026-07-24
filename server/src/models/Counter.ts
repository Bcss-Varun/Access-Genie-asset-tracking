import { model, Schema } from 'mongoose';

/**
 * Atomic ID sequences. Business IDs in this platform are human-readable
 * (`AST-1042`, `WO-2051`) because they are printed on labels and quoted in
 * tickets, so they are minted from a counter rather than derived from an
 * ObjectId. `findOneAndUpdate` with `$inc` is atomic, so two concurrent
 * creates can never collide on the same number.
 */
export interface CounterDoc {
  _id: string; // sequence name, e.g. 'asset'
  seq: number;
}

const counterSchema = new Schema<CounterDoc>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
);

export const Counter = model<CounterDoc>('Counter', counterSchema);

/**
 * Reserve the next ID in a sequence.
 * @param name  sequence name (one per collection)
 * @param prefix  ID prefix, e.g. `AST`
 */
export async function nextId(name: string, prefix: string): Promise<string> {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  return `${prefix}-${counter?.seq ?? 1}`;
}

/**
 * Fast-forward a sequence past the highest ID already in a collection, so the
 * seeded records and anything created afterwards share one numbering. `$max`
 * means running it twice, or against a lower value, is a no-op.
 */
export async function syncCounter(name: string, highestSeq: number): Promise<void> {
  await Counter.findByIdAndUpdate(name, { $max: { seq: highestSeq } }, { upsert: true });
}

/** Highest numeric suffix across a set of IDs — `['AST-9','AST-1014']` → 1014. */
export function highestSuffix(ids: string[]): number {
  return ids.reduce((max, id) => {
    const suffix = Number.parseInt(id.split('-').pop() ?? '', 10);
    return Number.isFinite(suffix) && suffix > max ? suffix : max;
  }, 0);
}
