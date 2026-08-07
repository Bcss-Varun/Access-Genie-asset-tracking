import { z } from 'zod';
import { ALERT_SEVERITIES, CUSTODY_ACTIONS } from '@access-genie/shared';
import { partialUpdate } from './common.js';

/**
 * Bodies for the supporting collections that screens write to — custody moves
 * and alert rules. Both used to be read-only endpoints paired with screens that
 * mutated component state, so the action looked like it worked and survived
 * exactly as long as the page did.
 */

export const createCustodySchema = z.object({
  assetId: z.string().trim().min(1).max(64),
  holder: z.string().trim().min(1).max(120),
  action: z.enum(CUSTODY_ACTIONS),
  note: z.string().trim().max(500).optional(),
});

export const createAlertRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  condition: z.string().trim().min(1).max(300),
  severity: z.enum(ALERT_SEVERITIES),
  channels: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  enabled: z.boolean().default(true),
});

export const updateAlertRuleSchema = partialUpdate(createAlertRuleSchema);
