import { z } from 'zod';
import { SHIFT_LABELS, TECHNICIAN_SKILLS, WEEKDAY_LABELS } from '@access-genie/shared';

const shiftSchema = z.object({
  label: z.enum(SHIFT_LABELS),
  start: z.coerce.number().min(0).max(24),
  end: z.coerce.number().min(0).max(24),
});

export const createTechnicianSchema = z.object({
  name: z.string().trim().min(2).max(120),
  title: z.string().trim().min(2).max(160),
  department: z.string().trim().min(2).max(120),
  skills: z.array(z.enum(TECHNICIAN_SKILLS)).min(1, 'Pick at least one skill'),
  locationId: z.string().trim().min(1, 'A home facility is required'),
  shift: shiftSchema,
  workingDays: z.array(z.enum(WEEKDAY_LABELS)).min(1, 'Pick at least one working day'),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(30).default(''),
});

export const updateTechnicianSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  title: z.string().trim().min(2).max(160).optional(),
  department: z.string().trim().min(2).max(120).optional(),
  skills: z.array(z.enum(TECHNICIAN_SKILLS)).min(1).optional(),
  locationId: z.string().trim().min(1).optional(),
  shift: shiftSchema.optional(),
  workingDays: z.array(z.enum(WEEKDAY_LABELS)).min(1).optional(),
  email: z.string().trim().email().max(160).optional(),
  phone: z.string().trim().max(30).optional(),
  active: z.boolean().optional(),
  /** Empty string clears an existing leave date. */
  onLeaveUntil: z.string().trim().max(10).optional(),
});

export type CreateTechnicianInput = z.infer<typeof createTechnicianSchema>;
export type UpdateTechnicianInput = z.infer<typeof updateTechnicianSchema>;
