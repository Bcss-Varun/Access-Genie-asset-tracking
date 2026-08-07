import { z } from 'zod';
import { partialUpdate } from './common.js';
import {
  ASSET_CATEGORIES,
  ATTRIBUTE_TYPES,
  CRITICALITIES,
  DOC_TYPES,
  GATE_KEYS,
  SENSOR_KINDS,
} from '@access-genie/shared';

/**
 * An asset class is configuration: editing one changes how every asset of that
 * kind behaves. The schema is therefore strict about the vocabulary — a typo in
 * a gate name would otherwise silently make the gate unenforceable.
 */
const attributeSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(48)
    // Attribute keys become object keys on every asset of the class, so they are
    // held to identifier rules rather than accepting arbitrary label text.
    .regex(/^[a-z][a-zA-Z0-9_]*$/, 'Use a lowerCamelCase key, e.g. "ramGb"'),
  label: z.string().trim().min(1).max(80),
  type: z.enum(ATTRIBUTE_TYPES),
  unit: z.string().trim().max(24).optional(),
  options: z.array(z.string().trim().min(1)).max(50).optional(),
  required: z.boolean().optional(),
});

/**
 * The field set, before the cross-field rules. Kept separate so the update
 * schema can be derived with `.partial()` — a refinement wraps the object and
 * `.partial()` is no longer available once it has been applied.
 */
const assetClassFields = z.object({
    name: z.string().trim().min(2).max(60),
    icon: z.string().trim().min(1).max(8).default('📦'),
    description: z.string().trim().max(400).default(''),
    // Which reporting category assets of this class land in. Defaulted rather
    // than required so an existing integration that does not send it still
    // creates a usable class — see the AssetClass contract for why it is
    // declared here instead of read off the class name.
    category: z.enum(ASSET_CATEGORIES).default('Compute'),
    parentId: z.string().trim().min(1).optional(),
    attributes: z.array(attributeSchema).max(60).default([]),

    trackingExpected: z.boolean().default(true),
    preferredTags: z.array(z.enum(SENSOR_KINDS)).default([]),
    monitoringProfileId: z.string().trim().max(60).default(''),
    activationGates: z.array(z.enum(GATE_KEYS)).default([]),

    depreciationMethod: z.string().trim().max(60).default('Straight-line (5yr)'),
    usefulLifeYears: z.coerce.number().int().min(1).max(40).default(5),
    pmPlan: z.string().trim().max(120).default(''),
    documentChecklist: z.array(z.enum(DOC_TYPES)).default([]),
    defaultCriticality: z.enum(CRITICALITIES).default('Medium'),
    approvalThreshold: z.coerce.number().min(0).default(0),
});

/** Attribute rules that only make sense across the whole list. */
const attributeRules = <T extends { attributes?: z.infer<typeof attributeSchema>[] }>(schema: z.ZodType<T>) =>
  schema
    .refine((c) => new Set((c.attributes ?? []).map((a) => a.key)).size === (c.attributes ?? []).length, {
      message: 'Attribute keys must be unique within a class',
      path: ['attributes'],
    })
    .refine(
      // A select with no options is a field nobody can fill in.
      (c) => (c.attributes ?? []).every((a) => a.type !== 'select' || (a.options?.length ?? 0) > 0),
      { message: 'A "select" attribute needs at least one option', path: ['attributes'] },
    );

export const createAssetClassSchema = attributeRules(assetClassFields);
export const updateAssetClassSchema = attributeRules(partialUpdate(assetClassFields));

export type CreateAssetClassInput = z.infer<typeof createAssetClassSchema>;
export type UpdateAssetClassInput = z.infer<typeof updateAssetClassSchema>;
