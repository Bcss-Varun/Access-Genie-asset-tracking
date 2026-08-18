import { z } from 'zod';
import {
  PREDICTIVE_ALERT_SOURCES,
  PREDICTIVE_ALERT_TYPES,
  PREDICTIVE_SEVERITIES,
  WORK_ORDER_PRIORITIES,
} from '@access-genie/shared';
import { blankToUndefined, csvString, isoDateString, listQuerySchema } from './common.js';

/**
 * Predictive-alert validation.
 *
 * The create schema is the **ingestion contract**: it is what a person raising
 * an alert by hand sends today and what a predictive engine will send tomorrow,
 * and it is the same schema for both. Nothing here is optional-because-the-form-
 * is-lazy — every required field is one without which the alert cannot be
 * triaged. An alert with no reason and no recommendation is a red dot.
 *
 * `confidence` is required for the same reason. A detector that cannot say how
 * sure it is has not made a prediction, and defaulting it to a number would be
 * this module inventing the one figure it exists to report honestly.
 */

export const predictiveAlertListQuerySchema = listQuerySchema.extend({
  // CSV and deliberately not enum-checked — an unrecognised member is dropped by
  // the service rather than refused, so a stale bookmark renders a list instead
  // of an error. Same rule as work orders.
  status: csvString,
  severity: csvString,
  type: csvString,
  source: csvString,

  assetId: blankToUndefined(z.string().trim().max(64)).optional(),
  /** Scope-node id. Matches every asset sitting anywhere beneath it. */
  facility: blankToUndefined(z.string().trim().max(64)).optional(),

  /** Detection-date window. Either end may be given on its own. */
  from: blankToUndefined(isoDateString).optional(),
  to: blankToUndefined(isoDateString).optional(),

  /** `?minConfidence=80` — the high-confidence cut the summary card counts. */
  minConfidence: z.coerce.number().min(0).max(100).optional(),
  /** `?open=true` — Open and Acknowledged only, whatever else is filtered. */
  open: z.enum(['true', 'false']).optional(),
});

const signalSchema = z.object({
  label: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(120),
  baseline: z.string().trim().max(120).optional(),
  detail: z.string().trim().max(400).optional(),
  weight: z.number().min(0).max(100).optional(),
});

export const createPredictiveAlertSchema = z.object({
  title: z.string().trim().min(4).max(160),
  severity: z.enum(PREDICTIVE_SEVERITIES),
  type: z.enum(PREDICTIVE_ALERT_TYPES),
  assetId: z.string().trim().min(1),
  confidence: z.number().min(0).max(100),

  /** Absent means "now" — a live detector has no reason to say so explicitly. */
  detectedAt: blankToUndefined(isoDateString).optional(),
  predictedFailureAt: blankToUndefined(isoDateString).optional(),

  reason: z.string().trim().min(10).max(2000),
  // Capped at twelve: past that the detail view is a data dump, and a detector
  // emitting fifty signals is describing its feature set, not its evidence.
  signals: z.array(signalSchema).max(12).default([]),

  recommendation: z.object({
    action: z.string().trim().min(5).max(500),
    priority: z.enum(WORK_ORDER_PRIORITIES).default('Medium'),
    dueInDays: z.number().int().min(0).max(365).default(7),
    estimatedHours: z.number().min(0).max(1000).default(2),
    requiredSkill: z.string().trim().max(80).optional(),
  }),

  source: z.enum(PREDICTIVE_ALERT_SOURCES).default('Manual'),
  /**
   * Which model produced it.
   *
   * Refused on `source: 'Manual'` by the service — attributing a person's
   * judgement to a model is exactly the kind of fake AI provenance this module
   * is built to avoid.
   */
  detector: z
    .object({
      name: z.string().trim().min(2).max(80),
      version: z.string().trim().max(40).optional(),
      modelId: z.string().trim().max(64).optional(),
    })
    .optional(),
});

/** Acknowledge / resolve / reopen all take an optional note. */
export const predictiveAlertNoteSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

/**
 * Dismissal takes a *required* reason.
 *
 * Dismissing is the one action that removes an alert from every queue without
 * anything being done about it. "Why" is the only thing that makes that
 * reviewable later, so it is not optional.
 */
export const dismissPredictiveAlertSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

/**
 * Raising work from an alert.
 *
 * Every field is optional and falls back to the alert's own recommendation —
 * the default path is "do what the alert said", and overriding is the exception.
 */
export const raisePredictiveWorkOrderSchema = z.object({
  title: z.string().trim().min(4).max(140).optional(),
  priority: z.enum(WORK_ORDER_PRIORITIES).optional(),
  assignedTo: z.string().trim().max(120).optional(),
  dueInDays: z.number().int().min(0).max(365).optional(),
  estimatedHours: z.number().min(0).max(1000).optional(),
  scheduledDate: blankToUndefined(isoDateString).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type PredictiveAlertListQuery = z.infer<typeof predictiveAlertListQuerySchema>;
export type CreatePredictiveAlertInput = z.infer<typeof createPredictiveAlertSchema>;
export type DismissPredictiveAlertInput = z.infer<typeof dismissPredictiveAlertSchema>;
export type RaisePredictiveWorkOrderInput = z.infer<typeof raisePredictiveWorkOrderSchema>;
