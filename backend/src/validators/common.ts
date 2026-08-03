import { z } from 'zod';

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
