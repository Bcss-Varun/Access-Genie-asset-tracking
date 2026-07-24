import { z } from 'zod';
import { ALERT_SEVERITIES } from '@access-genie/shared';
import { csvString, listQuerySchema } from './common.js';

export const alertListQuerySchema = listQuerySchema.extend({
  status: csvString,
  severity: csvString,
  type: csvString,
  assetId: z.string().trim().optional(),
});

export const createAlertSchema = z.object({
  title: z.string().trim().min(4).max(160),
  severity: z.enum(ALERT_SEVERITIES),
  type: z.string().trim().min(2).max(60),
  assetId: z.string().trim().optional(),
  source: z.string().trim().min(2).max(80).default('Manual'),
});

/** Acknowledge / resolve / escalate all accept an optional note. */
export const alertActionSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export type AlertListQuery = z.infer<typeof alertListQuerySchema>;
export type CreateAlertInput = z.infer<typeof createAlertSchema>;
