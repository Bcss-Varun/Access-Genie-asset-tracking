import { z } from 'zod';
import { PM_FREQUENCIES, WORK_ORDER_TYPES } from '@access-genie/shared';
import { isoDateString, partialUpdate } from './common.js';

/**
 * A preventive schedule — the rule that says how often an asset needs work.
 *
 * These were read-only, which meant the maintenance programme was whatever the
 * seed contained and could never be changed. They are the input to the
 * automation that raises work orders, so creating one is the act that starts
 * preventive maintenance happening at all.
 */
const pmFields = {
  title: z.string().trim().min(4).max(140),
  assetId: z.string().trim().min(1),
  frequency: z.enum(PM_FREQUENCIES),
  type: z.enum(WORK_ORDER_TYPES).default('Preventive'),
  nextDue: isoDateString,
  estHours: z.number().min(0).max(200).default(1),
  assignedTeam: z.string().trim().max(120).default('Unassigned'),
};

export const createPmScheduleSchema = z.object(pmFields);
/** `assetId` is omitted: moving a schedule between assets is a new schedule. */
export const updatePmScheduleSchema = partialUpdate(z.object(pmFields).omit({ assetId: true }));

export type CreatePmScheduleInput = z.infer<typeof createPmScheduleSchema>;
export type UpdatePmScheduleInput = z.infer<typeof updatePmScheduleSchema>;
