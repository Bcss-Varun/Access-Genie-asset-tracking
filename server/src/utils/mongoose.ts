import type { Schema } from 'mongoose';

/**
 * Every document is exposed to clients as `{ id, ... }` — never `_id`/`__v`.
 * Applied through a plugin so the rule is stated once and cannot drift between
 * collections. `lean({ virtuals: true })` reads get the same treatment via the
 * `id` virtual that Mongoose adds for string `_id`s.
 */
export function baseSchemaPlugin(schema: Schema): void {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret: Record<string, unknown>) {
      ret.id = ret._id;
      delete ret._id;
      return ret;
    },
  });

  schema.set('toObject', { virtuals: true, versionKey: false });
}

/**
 * Mongo stores dates as BSON dates; the API contract is ISO-8601 strings.
 * Applied as a getter so the model layer keeps real Date objects (comparable,
 * indexable) while serialization stays on-contract.
 */
export const isoDate = {
  type: Date,
  get: (value: Date | undefined) => (value ? value.toISOString() : value),
};
