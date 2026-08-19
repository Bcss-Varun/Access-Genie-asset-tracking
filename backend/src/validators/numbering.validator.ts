import { z } from 'zod';
import { NUMBERED_ENTITIES, SEQUENCE_SCOPES } from '@access-genie/shared';
import { blankToUndefined } from './common.js';

/**
 * Numbering rules.
 *
 * The pattern must contain `{SEQ}`. Without it every record of the entity would
 * render the same string, and the first insert after that would fail on a
 * duplicate `_id` — a validation error now is a great deal clearer than a write
 * conflict later.
 */
const patternSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((p) => /\{SEQ(?::\d+)?\}/.test(p), {
    message: 'The pattern must include {SEQ} — without it every ID would be identical',
  });

export const createNumberingRuleSchema = z.object({
  name: z.string().trim().min(1).max(160),
  entity: z.enum(NUMBERED_ENTITIES),
  prefix: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9-]+$/, 'Letters, digits and hyphens only'),
  pattern: patternSchema,
  startAt: z.coerce.number().int().min(0).max(1_000_000).default(1),
  sequenceScope: z.enum(SEQUENCE_SCOPES).default('global'),
  categories: z.array(z.string().trim().max(60)).max(30).default([]),
  scopeId: blankToUndefined(z.string().trim().max(64)).optional(),
  status: z.enum(['active', 'inactive']).default('inactive'),
});

/**
 * Built by hand rather than with `partialUpdate` for `startAt`: changing it once
 * a sequence is running does not renumber what has already been issued, and the
 * service is explicit about that, so it must arrive only when actually sent.
 */
export const updateNumberingRuleSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  prefix: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9-]+$/).optional(),
  pattern: patternSchema.optional(),
  startAt: z.coerce.number().int().min(0).max(1_000_000).optional(),
  sequenceScope: z.enum(SEQUENCE_SCOPES).optional(),
  categories: z.array(z.string().trim().max(60)).max(30).optional(),
  scopeId: blankToUndefined(z.string().trim().max(64)).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

/** Ad-hoc preview from the builder, before anything is saved. */
export const previewNumberingSchema = z.object({
  prefix: z.string().trim().min(1).max(12),
  pattern: patternSchema,
  startAt: z.coerce.number().int().min(0).max(1_000_000).default(1),
  sequenceScope: z.enum(SEQUENCE_SCOPES).default('global'),
  category: blankToUndefined(z.string().trim().max(60)).optional(),
  scopeId: blankToUndefined(z.string().trim().max(64)).optional(),
});

export type CreateNumberingRuleInput = z.infer<typeof createNumberingRuleSchema>;
export type UpdateNumberingRuleInput = z.infer<typeof updateNumberingRuleSchema>;
export type PreviewNumberingInput = z.infer<typeof previewNumberingSchema>;
