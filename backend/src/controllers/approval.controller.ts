import type { Request, Response } from 'express';
import type { ApprovalRequestStatus, ApprovalTrigger, ApprovalWorkflow as ApprovalWorkflowView } from '@access-genie/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { validatedQuery } from '../middleware/validate.js';
import { recordAudit } from '../services/audit.service.js';
import {
  ApprovalWorkflow,
  ScopeNodeModel,
  nextId,
  type ApprovalWorkflowDoc,
} from '../models/index.js';
import * as approvals from '../services/approval.service.js';
import { applyApprovalOutcome } from '../services/operations.service.js';
import type {
  CreateWorkflowInput,
  DecideInput,
  UpdateWorkflowInput,
} from '../validators/approval.validator.js';

/**
 * Approval workflows (configuration) and approval requests (the live instances).
 *
 * Kept in one controller because they are one feature: a workflow that raises no
 * requests is the configuration-only screen this module was rebuilt to stop
 * being, and a request with no workflow behind it cannot exist.
 */

function decider(req: Request): approvals.Decider {
  if (!req.auth) throw ApiError.unauthorized();
  return {
    id: req.auth.user.id,
    name: req.auth.user.name,
    roleId: req.auth.roleId,
    homeScopeId: req.auth.user.homeScopeId,
  };
}

/** Join the scope name on read, rather than storing a copy that goes stale. */
async function toView(doc: ApprovalWorkflowDoc): Promise<ApprovalWorkflowView> {
  const scope = doc.scopeId ? await ScopeNodeModel.findById(doc.scopeId).lean() : null;
  return {
    id: doc._id,
    name: doc.name,
    description: doc.description ?? '',
    trigger: doc.trigger,
    scopeId: doc.scopeId,
    scopeName: scope?.name,
    steps: [...(doc.steps ?? [])].sort((a, b) => a.order - b.order),
    status: doc.status,
    createdBy: doc.createdBy ?? '',
    createdAt: doc.createdAt?.toISOString() ?? '',
    updatedAt: doc.updatedAt?.toISOString() ?? '',
  };
}

// ── Workflows ────────────────────────────────────────────────────────────────

export const listWorkflows = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await ApprovalWorkflow.find().sort({ trigger: 1, name: 1 }).lean<ApprovalWorkflowDoc[]>();
  sendData(res, await Promise.all(rows.map(toView)));
});

export const createWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateWorkflowInput;

  if (body.scopeId) {
    const node = await ScopeNodeModel.findById(body.scopeId).lean();
    if (!node) throw ApiError.badRequest(`No location ${body.scopeId} exists to scope this workflow to.`);
  }

  const doc = await ApprovalWorkflow.create({
    _id: await nextId('approvalWorkflow', 'WF'),
    ...body,
    createdBy: req.auth?.user.name ?? '',
  });

  recordAudit(req, { action: 'approval_workflow.create', target: doc._id, category: 'Configuration' });
  sendData(res, await toView(doc.toObject()), 201);
});

export const updateWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const body = req.body as UpdateWorkflowInput;

  if (body.scopeId) {
    const node = await ScopeNodeModel.findById(body.scopeId).lean();
    if (!node) throw ApiError.badRequest(`No location ${body.scopeId} exists to scope this workflow to.`);
  }

  const doc = await ApprovalWorkflow.findByIdAndUpdate(id, { $set: body }, { new: true }).lean<ApprovalWorkflowDoc>();
  if (!doc) throw ApiError.notFound('Approval workflow');

  recordAudit(req, { action: 'approval_workflow.update', target: id, category: 'Configuration' });
  sendData(res, await toView(doc));
});

export const removeWorkflow = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  // Requests already raised keep their copied steps and stay readable, so a
  // deleted workflow does not erase the history of what it approved.
  const doc = await ApprovalWorkflow.findByIdAndDelete(id).lean();
  if (!doc) throw ApiError.notFound('Approval workflow');

  recordAudit(req, { action: 'approval_workflow.delete', target: id, category: 'Configuration' });
  res.status(204).send();
});

// ── Requests ─────────────────────────────────────────────────────────────────

export const listRequests = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<{ status?: ApprovalRequestStatus; trigger?: ApprovalTrigger; mine?: boolean }>(res);
  sendData(res, await approvals.listRequests(query, decider(req)));
});

export const getRequest = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await approvals.getRequest(req.params.id as string, decider(req)));
});

/**
 * Decide the current step.
 *
 * When the decision settles the whole request, the gated transaction is moved
 * with it — that call is what makes this feature affect the module it governs
 * rather than only recording an opinion about it.
 */
export const decideRequest = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { decision, comment } = req.body as DecideInput;
  const actor = decider(req);

  const { request, settled } = await approvals.decide(id, decision, actor, comment);

  // `settled` is only ever Approved or Rejected — Pending means "not settled"
  // and Cancelled comes from the cancel route, never from a decision. Narrowed
  // rather than cast so a new terminal status has to be handled here explicitly.
  if ((settled === 'Approved' || settled === 'Rejected') && request.subjectType === 'asset_transfer') {
    await applyApprovalOutcome(request.subjectId, settled, actor.name);
  }

  recordAudit(req, {
    action: `approval.${decision.toLowerCase()}`,
    target: id,
    category: 'Configuration',
  });

  sendData(res, approvals.toView(request, false));
});

export const cancelRequest = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { reason } = req.body as { reason: string };
  const request = await approvals.cancel(id, decider(req), reason);

  recordAudit(req, { action: 'approval.cancel', target: id, category: 'Configuration' });
  sendData(res, approvals.toView(request, false));
});

/** Who can be named as an approver — active users with their roles. */
export const listApprovers = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await approvals.approverCandidates());
});
