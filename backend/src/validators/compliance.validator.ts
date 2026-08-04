import { z } from 'zod';
import {
  CERT_STATUSES,
  CYCLE_COUNT_STATUSES,
  INSPECTION_RESULTS,
  INSPECTION_STATUSES,
} from '@access-genie/shared';
import { isoDateString } from './common.js';

/**
 * Compliance records — inspections, certifications and cycle counts.
 *
 * All three were read-only, which meant the compliance programme was whatever
 * the seed contained: an inspection could never be scheduled, a certificate
 * never renewed, a count never carried out. Evidence you cannot create is not
 * evidence.
 */

const inspectionItem = z.object({
  label: z.string().trim().min(1).max(160),
  result: z.enum(INSPECTION_RESULTS).default('Pending'),
  note: z.string().trim().max(500).optional(),
});

const inspectionFields = {
  title: z.string().trim().min(4).max(140),
  assetId: z.string().trim().min(1),
  template: z.string().trim().max(120).default('Standard'),
  status: z.enum(INSPECTION_STATUSES).default('Scheduled'),
  dueDate: isoDateString,
  inspector: z.string().trim().min(2).max(120),
  items: z.array(inspectionItem).max(80).default([]),
};
export const createInspectionSchema = z.object(inspectionFields);
export const updateInspectionSchema = z.object(inspectionFields).omit({ assetId: true }).partial();

const certificationFields = {
  assetId: z.string().trim().min(1),
  name: z.string().trim().min(2).max(140),
  authority: z.string().trim().min(2).max(140),
  issuedAt: isoDateString,
  expiresAt: isoDateString,
  // Derived from the dates on write, so it is accepted but not required.
  status: z.enum(CERT_STATUSES).optional(),
};
export const createCertificationSchema = z.object(certificationFields);
export const updateCertificationSchema = z.object(certificationFields).omit({ assetId: true }).partial();

const cycleCountFields = {
  location: z.string().trim().min(2).max(120),
  status: z.enum(CYCLE_COUNT_STATUSES).default('Scheduled'),
  expected: z.coerce.number().int().min(0),
  counted: z.coerce.number().int().min(0).default(0),
  date: isoDateString,
  assignedTo: z.string().trim().min(2).max(120),
};
export const createCycleCountSchema = z.object(cycleCountFields);
export const updateCycleCountSchema = z.object(cycleCountFields).partial();

export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;
export type UpdateInspectionInput = z.infer<typeof updateInspectionSchema>;
export type CreateCertificationInput = z.infer<typeof createCertificationSchema>;
export type UpdateCertificationInput = z.infer<typeof updateCertificationSchema>;
export type CreateCycleCountInput = z.infer<typeof createCycleCountSchema>;
export type UpdateCycleCountInput = z.infer<typeof updateCycleCountSchema>;
