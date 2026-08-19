import { z } from 'zod';
import {
  CONDITION_OPERATORS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  RECIPIENT_KINDS,
  ROLE_IDS,
} from '@access-genie/shared';
import { blankToUndefined } from './common.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const conditionSchema = z.object({
  field: z.string().trim().min(1).max(60),
  op: z.enum(CONDITION_OPERATORS),
  value: z.union([z.string().max(200), z.number(), z.array(z.string().max(200)).max(30)]),
});

/**
 * A recipient must carry the value its kind needs. `requester` is the one that
 * takes none — it resolves to whoever triggered the event — so the check is
 * per-kind rather than a blanket "value required".
 */
const recipientSchema = z
  .object({
    kind: z.enum(RECIPIENT_KINDS),
    value: blankToUndefined(z.string().trim().max(64)).optional(),
  })
  .refine((r) => r.kind === 'requester' || Boolean(r.value), {
    message: 'Pick the role or the user this should go to',
    path: ['value'],
  });

const quietHoursSchema = z.object({
  enabled: z.boolean().default(false),
  start: z.string().regex(HHMM, 'Use HH:MM').default('22:00'),
  end: z.string().regex(HHMM, 'Use HH:MM').default('07:00'),
});

const escalationSchema = z.object({
  enabled: z.boolean().default(false),
  afterHours: z.coerce.number().int().min(1).max(720).default(24),
  toRole: z.enum(ROLE_IDS).optional(),
});

export const createNotificationRuleSchema = z.object({
  name: z.string().trim().min(1).max(160),
  event: z.enum(NOTIFICATION_EVENTS),
  conditions: z.array(conditionSchema).max(10).default([]),
  // At least one channel: a rule with none decides to tell nobody, which is
  // what `inactive` is for.
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1).max(3),
  recipients: z.array(recipientSchema).min(1).max(20),
  throttleMinutes: z.coerce.number().int().min(0).max(10_080).default(0),
  quietHours: quietHoursSchema.default({ enabled: false, start: '22:00', end: '07:00' }),
  escalation: escalationSchema.default({ enabled: false, afterHours: 24 }),
  scopeId: blankToUndefined(z.string().trim().max(64)).optional(),
  status: z.enum(['active', 'inactive']).default('inactive'),
});

export const updateNotificationRuleSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  event: z.enum(NOTIFICATION_EVENTS).optional(),
  conditions: z.array(conditionSchema).max(10).optional(),
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1).max(3).optional(),
  recipients: z.array(recipientSchema).min(1).max(20).optional(),
  throttleMinutes: z.coerce.number().int().min(0).max(10_080).optional(),
  quietHours: quietHoursSchema.optional(),
  escalation: escalationSchema.optional(),
  scopeId: blankToUndefined(z.string().trim().max(64)).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const logQuerySchema = z.object({
  ruleId: blankToUndefined(z.string().trim().max(64)).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
