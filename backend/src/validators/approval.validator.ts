import { z } from 'zod';
import {
  APPROVAL_REQUEST_STATUSES,
  APPROVAL_STEP_DECISIONS,
  APPROVAL_TRIGGERS,
  ROLE_IDS,
  WORKFLOW_STATUSES,
} from '@access-genie/shared';
import { blankToUndefined } from './common.js';

/**
 * Approval workflows and the requests they raise.
 *
 * The one rule worth stating: a step must name exactly one approver — a role or
 * a user, never both and never neither. A step with no approver can never be
 * satisfied and would strand its request; a step with two invites the question
 * of which one wins, which is a question no caller should have to ask.
 */

const stepSchema = z
  .object({
    order: z.coerce.number().int().min(1).max(20),
    name: z.string().trim().min(1).max(120),
    approverRole: z.enum(ROLE_IDS).optional(),
    approverUserId: blankToUndefined(z.string().trim().max(64)).optional(),
  })
  .refine((step) => Boolean(step.approverRole) !== Boolean(step.approverUserId), {
    message: 'A step needs exactly one approver — either a role or a specific user',
    path: ['approverRole'],
  });

export const createWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).default(''),
  trigger: z.enum(APPROVAL_TRIGGERS),
  scopeId: blankToUndefined(z.string().trim().max(64)).optional(),
  // At least one step: a workflow with none approves nothing, and saving one is
  // almost always a half-finished edit rather than an intent.
  steps: z.array(stepSchema).min(1).max(10),
  status: z.enum(WORKFLOW_STATUSES).default('Draft'),
});

export const updateWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(500).optional(),
  trigger: z.enum(APPROVAL_TRIGGERS).optional(),
  scopeId: blankToUndefined(z.string().trim().max(64)).optional(),
  steps: z.array(stepSchema).min(1).max(10).optional(),
  status: z.enum(WORKFLOW_STATUSES).optional(),
});

export const listRequestsQuerySchema = z.object({
  status: z.enum(APPROVAL_REQUEST_STATUSES).optional(),
  trigger: z.enum(APPROVAL_TRIGGERS).optional(),
  /** `mine=true` narrows to requests this caller can act on right now. */
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const decideSchema = z.object({
  decision: z.enum(APPROVAL_STEP_DECISIONS),
  comment: z.string().trim().max(500).default(''),
});

export const cancelSchema = z.object({
  reason: z.string().trim().max(500).default(''),
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
export type DecideInput = z.infer<typeof decideSchema>;
