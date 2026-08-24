import { z } from 'zod';
import { COMPLIANCE_CATEGORIES, COMPLIANCE_SEVERITIES, COMPLIANCE_STATUSES } from '@access-genie/shared';
import { isoDateString, partialUpdate } from './common.js';

const complianceRecordFields = {
  assetId: z.string().trim().min(1).optional(),
  scopeId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(4).max(160),
  description: z.string().trim().min(4).max(2000),
  category: z.enum(COMPLIANCE_CATEGORIES),
  severity: z.enum(COMPLIANCE_SEVERITIES),
  dueDate: isoDateString.optional(),
  relatedAuditId: z.string().trim().min(1).optional(),
  relatedFindingId: z.string().trim().min(1).optional(),
};

export const createComplianceRecordSchema = z
  .object(complianceRecordFields)
  .refine((v) => Boolean(v.assetId) || Boolean(v.scopeId), {
    message: 'A finding needs either an assetId or a scopeId',
    path: ['assetId'],
  });

export const updateComplianceRecordSchema = partialUpdate(
  z.object({ ...complianceRecordFields, status: z.enum(COMPLIANCE_STATUSES) }),
);

export const resolveComplianceRecordSchema = z.object({
  status: z.enum(['Resolved', 'Waived']),
  resolutionNote: z.string().trim().max(1000).optional(),
});

export type CreateComplianceRecordInput = z.infer<typeof createComplianceRecordSchema>;
export type UpdateComplianceRecordInput = z.infer<typeof updateComplianceRecordSchema>;
export type ResolveComplianceRecordInput = z.infer<typeof resolveComplianceRecordSchema>;
