import { z } from 'zod';
import {
  ADD_ASSET_SOURCES,
  ASSET_CATEGORIES,
  FIELD_TYPES,
  REGISTRATION_SECTIONS,
  fieldByKey,
} from '@access-genie/shared';
import { partialUpdate } from './common.js';

/**
 * Shapes for the rebuilt add-asset flow.
 *
 * Two distinct kinds of validation live in this module's path and it is worth
 * separating them:
 *
 *   • *Structural* validation — is this a well-formed request? — is Zod's job
 *     and happens here, at the edge, before a controller runs.
 *   • *Field* validation — is `serialNumber` required for this template, is
 *     this MAC address well-formed? — cannot be expressed statically, because
 *     the answer depends on a template stored in the database. That lives in
 *     registration.service.ts and runs against the resolved field list.
 *
 * Trying to express the second in Zod would mean rebuilding a schema per
 * request from a database read, which is both slower and harder to report on:
 * the flow needs per-section completeness, not a flat list of issues.
 */

/** A value as it arrives from a form input. Nulls mean "explicitly cleared". */
const fieldValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const registrationDraftSchema = z
  .object({
    source: z.enum(ADD_ASSET_SOURCES),
    templateId: z.string().trim().max(64).optional(),
    cloneOfId: z.string().trim().max(64).optional(),
    values: z.record(z.string().trim().min(1).max(80), fieldValue).default({}),
  })
  .refine((d) => d.source !== 'template' || !!d.templateId, {
    message: 'A template registration must name its template',
    path: ['templateId'],
  })
  .refine((d) => d.source !== 'clone' || !!d.cloneOfId, {
    message: 'A clone registration must name the asset it copies',
    path: ['cloneOfId'],
  });

export type RegistrationDraftInput = z.infer<typeof registrationDraftSchema>;

// ── Templates ────────────────────────────────────────────────────────────────

const templateFieldSchema = z.object({
  key: z.string().trim().min(1).max(80),
  required: z.boolean().default(false),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  order: z.number().int().min(0).max(999).default(0),
});

const customFieldSchema = z.object({
  // Stored as an attribute key, so it has to be a safe identifier rather than
  // an arbitrary label — `onboarding.attributes.<key>` is a Mongo path.
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Field keys start with a letter and contain only letters, numbers and underscores'),
  label: z.string().trim().min(1).max(80),
  section: z.enum(REGISTRATION_SECTIONS),
  type: z.enum(FIELD_TYPES),
  options: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  unit: z.string().trim().max(20).optional(),
  help: z.string().trim().max(200).optional(),
  required: z.boolean().default(false),
  identity: z.boolean().default(false),
  order: z.number().int().min(0).max(999).default(0),
});

export const createTemplateSchema = z
  .object({
    id: z.string().trim().regex(/^TPL-\d+$/, 'Template IDs look like TPL-12').optional(),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(300).default(''),
    icon: z.string().trim().max(8).default('📋'),
    category: z.enum(ASSET_CATEGORIES),
    fields: z.array(templateFieldSchema).max(80).default([]),
    customFields: z.array(customFieldSchema).max(40).default([]),
    status: z.enum(['active', 'archived']).default('active'),
  })
  // Every selected key must resolve — to the catalogue or to a custom field
  // defined on this same template. A template referencing a field that does not
  // exist renders a form with a hole in it, and the hole is invisible until
  // someone tries to use it.
  .superRefine((tpl, ctx) => {
    const custom = new Set(tpl.customFields.map((c) => c.key));
    tpl.fields.forEach((f, i) => {
      if (!fieldByKey(f.key) && !custom.has(f.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['fields', i, 'key'],
          message: `"${f.key}" is not a known field and is not defined in this template`,
        });
      }
    });

    const seen = new Set<string>();
    for (const [i, f] of tpl.fields.entries()) {
      if (seen.has(f.key)) {
        ctx.addIssue({ code: 'custom', path: ['fields', i, 'key'], message: `"${f.key}" is selected twice` });
      }
      seen.add(f.key);
    }

    // A custom field may not shadow a catalogue key: both would write to a
    // different path under the same name and the last one to run would win.
    for (const [i, c] of tpl.customFields.entries()) {
      if (fieldByKey(c.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['customFields', i, 'key'],
          message: `"${c.key}" is already a standard field — select it instead of redefining it`,
        });
      }
      if (c.type === 'select' && (!c.options || c.options.length === 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['customFields', i, 'options'],
          message: 'A dropdown needs at least one option',
        });
      }
    }
  });

export const updateTemplateSchema = partialUpdate(
  z.object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(300),
    icon: z.string().trim().max(8),
    category: z.enum(ASSET_CATEGORIES),
    fields: z.array(templateFieldSchema).max(80),
    customFields: z.array(customFieldSchema).max(40),
    status: z.enum(['active', 'archived']),
  }),
);

export const templateListQuerySchema = z.object({
  category: z.string().trim().optional(),
  status: z.enum(['active', 'archived', 'all']).default('active'),
  q: z.string().trim().max(120).optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type TemplateListQuery = z.infer<typeof templateListQuerySchema>;
