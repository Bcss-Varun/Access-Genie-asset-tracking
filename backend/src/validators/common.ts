import { z } from 'zod';

type WithoutDefaults<T extends z.ZodRawShape> = {
  [K in keyof T]: T[K] extends z.ZodDefault<infer Inner> ? Inner : T[K];
};

/**
 * Derive a PATCH schema from a create schema.
 *
 * **Use this instead of `.partial()`.** `.partial()` marks a field optional but
 * leaves its `.default(…)` in place, so a PATCH that omits the field still
 * parses to the default — and every update service writes what it is handed,
 * skipping only `undefined`. The result is silent data loss on the fields the
 * caller never mentioned:
 *
 *     PATCH /work-orders/WO-7  { "title": "…" }
 *       → status reset to New, priority to Medium, checklist and parts emptied
 *
 *     PATCH /assets/AST-16  { "name": "…" }
 *       → status reset to Active, healthScore to 100, purchasePrice to 0
 *
 * Twenty of this project's update schemas had that bug. Stripping the defaults
 * before going partial is what makes "absent means leave it alone" true, which
 * is what the services already document themselves as doing.
 *
 * Defaults nested *inside* an object field are left alone deliberately: sending
 * `onboarding` at all replaces the whole object, so its defaults should apply.
 */
export function partialUpdate<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const stripped = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [
      key,
      field instanceof z.ZodDefault ? field.removeDefault() : field,
    ]),
  ) as WithoutDefaults<T>;

  return z.object(stripped).partial();
}

/** `?page=&limit=&sort=&q=` — shared by every list endpoint. */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.string().optional(),
  q: z.string().trim().min(1).max(120).optional(),
});

export type ListQueryInput = z.infer<typeof listQuerySchema>;

/** A business ID in a path, e.g. `/assets/AST-1001`. */
export const idParamSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

/** Accepts `Active` or `Active,Maintenance`; the service turns it into `$in`. */
export const csvString = z.string().trim().min(1).optional();

/** ISO-8601 date string in, `Date` out. */
export const isoDateString = z.iso.datetime({ offset: true }).or(z.iso.date());

/**
 * Treat `""` as "not provided".
 *
 * A form that has not been filled in sends an empty string, not `undefined` —
 * JSON has no way to express the latter from an untouched `<input>`. Without
 * this, every optional-but-blank field fails validation with a message about
 * length or format, which reads as a bug rather than as "you left it empty".
 */
export const blankToUndefined = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);
