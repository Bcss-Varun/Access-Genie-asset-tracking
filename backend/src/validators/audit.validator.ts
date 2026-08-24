import { z } from 'zod';
import { AUDIT_FINDING_STATUSES, AUDIT_STATUSES, AUDIT_TYPES, COMPLIANCE_SEVERITIES } from '@access-genie/shared';
import { isoDateString, partialUpdate } from './common.js';

const auditFields = {
  name: z.string().trim().min(4).max(160),
  type: z.enum(AUDIT_TYPES),
  scopeId: z.string().trim().min(1),
  leadAuditor: z.string().trim().min(1),
  startDate: isoDateString,
  dueDate: isoDateString,
  summary: z.string().trim().max(2000).optional(),
};

export const createAuditSchema = z.object(auditFields);
export const updateAuditSchema = partialUpdate(z.object(auditFields));

export const transitionAuditSchema = z.object({
  status: z.enum(AUDIT_STATUSES),
});

const findingFields = {
  assetId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(4).max(160),
  description: z.string().trim().min(4).max(2000),
  severity: z.enum(COMPLIANCE_SEVERITIES),
  correctiveAction: z.string().trim().max(1000).optional(),
  assignedTo: z.string().trim().min(1).optional(),
  dueDate: isoDateString.optional(),
};

export const createFindingSchema = z.object(findingFields);
export const updateFindingSchema = partialUpdate(
  z.object({ ...findingFields, status: z.enum(AUDIT_FINDING_STATUSES) }),
);

export const resolveFindingSchema = z.object({
  status: z.enum(['Resolved', 'Waived']),
});

export const addEvidenceSchema = z.object({
  label: z.string().trim().min(2).max(160),
  note: z.string().trim().max(1000).optional(),
  url: z.string().trim().url().max(500).optional(),
});

export type CreateAuditInput = z.infer<typeof createAuditSchema>;
export type UpdateAuditInput = z.infer<typeof updateAuditSchema>;
export type CreateFindingInput = z.infer<typeof createFindingSchema>;
export type UpdateFindingInput = z.infer<typeof updateFindingSchema>;
export type AddEvidenceInput = z.infer<typeof addEvidenceSchema>;
