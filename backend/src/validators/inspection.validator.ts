import { z } from 'zod';
import {
  ASSET_CATEGORIES,
  INSPECTION_QUESTION_TYPES,
  INSPECTION_TYPES,
  WORK_ORDER_PRIORITIES,
} from '@access-genie/shared';
import { blankToUndefined, csvString, isoDateString, listQuerySchema } from './common.js';

/**
 * Inspections & Checklists validation.
 *
 * The rule worth stating: a client may send a checkpoint's **question** and a
 * response's **value**, never a response's `result`. Grading is the server's —
 * see `grade()` in the service — because a compliance record whose outcome the
 * browser decided is not a compliance record.
 */

// ── Templates ────────────────────────────────────────────────────────────────

const checkpointSchema = z.object({
  /** Present when editing: preserving it keeps the checkpoint's identity. */
  key: blankToUndefined(z.string().trim().max(60)).optional(),
  label: z.string().trim().min(2).max(200),
  type: z.enum(INSPECTION_QUESTION_TYPES).default('Pass/Fail'),
  required: z.boolean().default(true),
  helpText: blankToUndefined(z.string().trim().max(400)).optional(),
  // Number-only; the service strips these from other types rather than storing
  // configuration that silently does nothing.
  min: z.number().optional(),
  max: z.number().optional(),
  unit: blankToUndefined(z.string().trim().max(20)).optional(),
  /** Pass/Fail and Yes/No only — which answer is the bad one. */
  failWhen: z.enum(['Fail', 'No', 'Yes']).optional(),
});

const scopeSchema = z
  .object({
    assetIds: z.array(z.string().trim().min(1)).max(500).default([]),
    assetCategories: z.array(z.enum(ASSET_CATEGORIES)).default([]),
    facilityIds: z.array(z.string().trim().min(1)).max(100).default([]),
  })
  .default({ assetIds: [], assetCategories: [], facilityIds: [] });

export const createInspectionTemplateSchema = z.object({
  name: z.string().trim().min(3).max(140),
  description: z.string().trim().max(2000).default(''),
  type: z.enum(INSPECTION_TYPES).default('Safety'),
  category: z.string().trim().min(1).max(60).default('General'),
  icon: z.string().trim().max(8).default('🔎'),
  checkpoints: z.array(checkpointSchema).max(200).default([]),
  scope: scopeSchema,
  estimatedMinutes: z.number().int().min(0).max(1440).default(15),
  active: z.boolean().default(true),
});

/**
 * Hand-written rather than derived with `partialUpdate`.
 *
 * `checkpoints` and `scope` are wholesale replacements — sending `checkpoints`
 * means "these are now the checks", so the array's own defaults should still
 * apply to each element. `partialUpdate` strips top-level defaults, which is
 * right for scalars and wrong for these two.
 */
export const updateInspectionTemplateSchema = z.object({
  name: z.string().trim().min(3).max(140).optional(),
  description: z.string().trim().max(2000).optional(),
  type: z.enum(INSPECTION_TYPES).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  icon: z.string().trim().max(8).optional(),
  checkpoints: z.array(checkpointSchema).max(200).optional(),
  scope: z
    .object({
      assetIds: z.array(z.string().trim().min(1)).max(500).default([]),
      assetCategories: z.array(z.enum(ASSET_CATEGORIES)).default([]),
      facilityIds: z.array(z.string().trim().min(1)).max(100).default([]),
    })
    .optional(),
  estimatedMinutes: z.number().int().min(0).max(1440).optional(),
  active: z.boolean().optional(),
});

export const templateListQuerySchema = listQuerySchema.extend({
  type: csvString,
  active: z.enum(['true', 'false']).optional(),
});

// ── Records ──────────────────────────────────────────────────────────────────

export const inspectionListQuerySchema = listQuerySchema.extend({
  // CSV and deliberately not enum-checked here — the service drops members it
  // does not recognise so a stale bookmark still renders a list.
  status: csvString,
  type: csvString,
  category: csvString,

  templateId: blankToUndefined(z.string().trim().max(64)).optional(),
  assetId: blankToUndefined(z.string().trim().max(64)).optional(),
  assignedTo: blankToUndefined(z.string().trim().max(120)).optional(),
  /** Scope-node id — matches every asset beneath it. */
  facility: blankToUndefined(z.string().trim().max(64)).optional(),

  overdue: z.enum(['true', 'false']).optional(),
  unassigned: z.enum(['true', 'false']).optional(),

  /** Scheduled-date window. Either end may be given on its own. */
  from: blankToUndefined(isoDateString).optional(),
  to: blankToUndefined(isoDateString).optional(),
});

export const createInspectionSchema = z.object({
  templateId: z.string().trim().min(1),
  assetId: z.string().trim().min(1),
  /** Defaults to "<template> — <asset>" server-side when omitted. */
  title: blankToUndefined(z.string().trim().max(160)).optional(),
  /** Overrides the template's type for this one record. */
  type: z.enum(INSPECTION_TYPES).optional(),
  scheduledFor: isoDateString,
  assignedTo: z.string().trim().max(120).default('Unassigned'),
  notes: z.string().trim().max(4000).default(''),
});

/** Schedule one template against many assets — one record per asset. */
export const createInspectionsBulkSchema = z.object({
  templateId: z.string().trim().min(1),
  assetIds: z.array(z.string().trim().min(1)).min(1).max(200),
  scheduledFor: isoDateString,
  assignedTo: z.string().trim().max(120).default('Unassigned'),
  type: z.enum(INSPECTION_TYPES).optional(),
});

export const updateInspectionSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  type: z.enum(INSPECTION_TYPES).optional(),
  scheduledFor: isoDateString.optional(),
  assignedTo: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
});

/**
 * A batch of answers.
 *
 * `value` is `unknown` by design — its shape follows the checkpoint's type, and
 * the server grades it against that type. Constraining it here would mean
 * duplicating the type table in two places that could disagree.
 */
export const respondSchema = z.object({
  responses: z
    .array(
      z.object({
        key: z.string().trim().min(1),
        value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
        note: z.string().trim().max(1000).optional(),
        finding: z.string().trim().max(1000).optional(),
      }),
    )
    .min(1)
    .max(200),
});

export const completeInspectionSchema = z.object({
  notes: z.string().trim().max(4000).optional(),
  /** Defaults to the caller when omitted. */
  performedBy: blankToUndefined(z.string().trim().max(120)).optional(),
});

export const assignInspectionSchema = z.object({
  assignedTo: z.string().trim().max(120),
});

export const raiseCorrectiveSchema = z.object({
  priority: z.enum(WORK_ORDER_PRIORITIES).optional(),
  dueInDays: z.number().int().min(0).max(365).optional(),
  assignedTo: z.string().trim().max(120).optional(),
});

export type CreateInspectionTemplateInput = z.infer<typeof createInspectionTemplateSchema>;
export type UpdateInspectionTemplateInput = z.infer<typeof updateInspectionTemplateSchema>;
export type TemplateListQuery = z.infer<typeof templateListQuerySchema>;
export type InspectionListQuery = z.infer<typeof inspectionListQuerySchema>;
export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;
export type RespondInput = z.infer<typeof respondSchema>;
