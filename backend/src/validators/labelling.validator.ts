import { z } from 'zod';
import { LABEL_FIELD_KEYS, LABEL_MEDIUMS, LABEL_SIZE_KEYS } from '@access-genie/shared';
import { listQuerySchema } from './common.js';

const templateFields = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).default(''),
  medium: z.enum(LABEL_MEDIUMS),
  size: z.enum(LABEL_SIZE_KEYS),
  // Order is print order on the label, so duplicates are a real mistake rather
  // than a harmless one.
  fields: z.array(z.enum(LABEL_FIELD_KEYS)).min(1).max(LABEL_FIELD_KEYS.length),
  showLogo: z.boolean().default(true),
  showBorder: z.boolean().default(false),
  stock: z.string().trim().max(60).default(''),
});

export const createTemplateSchema = templateFields.refine(
  (t) => new Set(t.fields).size === t.fields.length,
  { message: 'A field can only appear once on a template', path: ['fields'] },
);

export const updateTemplateSchema = templateFields.partial().refine(
  (t) => !t.fields || new Set(t.fields).size === t.fields.length,
  { message: 'A field can only appear once on a template', path: ['fields'] },
);

export const createPrintJobSchema = z.object({
  templateId: z.string().trim().min(1),
  deviceId: z.string().trim().min(1),
  /** Bounded so one submission cannot queue the entire estate by accident. */
  assetIds: z.array(z.string().trim().min(1)).min(1).max(500),
  copies: z.coerce.number().int().min(1).max(20).default(1),
});

export const printJobQuerySchema = listQuerySchema.extend({
  state: z.string().trim().min(1).optional(),
  deviceId: z.string().trim().min(1).optional(),
  templateId: z.string().trim().min(1).optional(),
  /** `?open=true` — jobs that are still going to change on their own. */
  open: z.enum(['true', 'false']).optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type CreatePrintJobInput = z.infer<typeof createPrintJobSchema>;
export type PrintJobQuery = z.infer<typeof printJobQuerySchema>;
