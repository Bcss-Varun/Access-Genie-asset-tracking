import { z } from 'zod';
import {
  ANALYTICS_PERIODS,
  REPORT_DATA_SOURCES,
  REPORT_EXPORT_FORMATS,
  REPORT_FILTER_OPERATORS,
  REPORT_VISUALIZATIONS,
  SCHEDULE_FREQUENCIES,
} from '@access-genie/shared';
import { blankToUndefined, csvString, isoDateString } from './common.js';

/**
 * `GET /analytics/dashboard` query.
 *
 * Every field narrows; none is required. No parameters means the caller's whole
 * permitted estate over the last twelve months.
 *
 * Enum members inside the CSV fields are not validated here on purpose — a
 * bookmark carrying a category that has since been renamed should still render
 * a dashboard, so the service drops what it does not recognise. A malformed
 * *date* is refused, because silently ignoring it would answer a question
 * nobody asked.
 */
export const analyticsDashboardQuerySchema = z
  .object({
    period: z.enum(ANALYTICS_PERIODS).optional(),
    from: blankToUndefined(isoDateString).optional(),
    to: blankToUndefined(isoDateString).optional(),
    /** A scope-node id at any level, not only a facility. */
    facility: blankToUndefined(z.string().trim().max(64)).optional(),
    category: csvString,
    status: csvString,
  })
  .refine((query) => query.period !== 'custom' || (Boolean(query.from) && Boolean(query.to)), {
    message: 'A custom period needs both "from" and "to"',
    path: ['period'],
  });

export type AnalyticsDashboardQueryInput = z.infer<typeof analyticsDashboardQuerySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Report definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A filter value.
 *
 * Genuinely polymorphic: `eq` takes a scalar, `in` a list, `between` a pair.
 * Which shape is legal for which operator is checked in the query engine, where
 * the field's type is also known — doing it here would duplicate that table and
 * let the two drift.
 */
const filterValueSchema = z.union([
  z.string().max(200),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string().max(200), z.number()])).max(50),
]);

export const reportFilterSchema = z.object({
  field: z.string().trim().min(1).max(60),
  op: z.enum(REPORT_FILTER_OPERATORS),
  value: filterValueSchema,
});

export const reportDefinitionSchema = z.object({
  source: z.enum(REPORT_DATA_SOURCES),
  // Capped: past three or four, a grouped table stops being readable and starts
  // being a row per record with extra steps.
  dimensions: z.array(z.string().trim().min(1).max(60)).max(4).default([]),
  measures: z.array(z.string().trim().min(1).max(60)).min(1).max(8),
  filters: z.array(reportFilterSchema).max(20).default([]),
  visualization: z.enum(REPORT_VISUALIZATIONS).default('table'),
  sort: blankToUndefined(z.string().trim().max(61)).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export const createReportSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).default(''),
  category: blankToUndefined(z.string().trim().max(60)).optional(),
  persona: blankToUndefined(z.string().trim().max(60)).optional(),
  definition: reportDefinitionSchema,
});

/**
 * PATCH. Built by hand rather than with `partialUpdate` because `definition` is
 * replaced wholesale — a half-sent definition is not a report, and merging one
 * field of it into the stored version would produce a query nobody wrote.
 */
export const updateReportSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().max(60).optional(),
  persona: z.string().trim().max(60).optional(),
  definition: reportDefinitionSchema.optional(),
});

/** `POST /analytics/reports/preview` — run a definition that is not saved yet. */
export const previewReportSchema = z.object({
  definition: reportDefinitionSchema,
  facility: blankToUndefined(z.string().trim().max(64)).optional(),
});

export const runReportSchema = z.object({
  facility: blankToUndefined(z.string().trim().max(64)).optional(),
});

export const exportQuerySchema = z.object({
  format: z.enum(REPORT_EXPORT_FORMATS).default('csv'),
  facility: blankToUndefined(z.string().trim().max(64)).optional(),
});

/** Ad-hoc export straight from the builder, before anything is saved. */
export const exportPreviewSchema = z.object({
  definition: reportDefinitionSchema,
  format: z.enum(REPORT_EXPORT_FORMATS).default('csv'),
  facility: blankToUndefined(z.string().trim().max(64)).optional(),
  title: z.string().trim().min(1).max(160).default('Report'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Schedules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recipients are validated as email addresses because that is what a delivery
 * needs. Permissively — corporate addresses break clever regexes far more often
 * than a clever regex catches a real typo, the same rule the User model applies.
 */
const recipientSchema = z.string().trim().toLowerCase().max(160).regex(/^\S+@\S+\.\S+$/, 'Invalid email address');

export const createScheduleSchema = z.object({
  reportId: z.string().trim().min(1).max(64),
  frequency: z.enum(SCHEDULE_FREQUENCIES),
  format: z.enum(REPORT_EXPORT_FORMATS).default('csv'),
  recipients: z.array(recipientSchema).min(1).max(25),
  startDate: isoDateString,
  endDate: blankToUndefined(isoDateString).optional(),
  enabled: z.boolean().default(true),
});

export const updateScheduleSchema = z.object({
  frequency: z.enum(SCHEDULE_FREQUENCIES).optional(),
  format: z.enum(REPORT_EXPORT_FORMATS).optional(),
  recipients: z.array(recipientSchema).min(1).max(25).optional(),
  startDate: isoDateString.optional(),
  endDate: blankToUndefined(isoDateString).optional(),
  enabled: z.boolean().optional(),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type UpdateReportInput = z.infer<typeof updateReportSchema>;
export type PreviewReportInput = z.infer<typeof previewReportSchema>;
export type ExportPreviewInput = z.infer<typeof exportPreviewSchema>;
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
