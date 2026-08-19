import type {
  ApprovalRequest as ApprovalRequestView,
  ApprovalRequestStatus,
  ApprovalStepDecision,
  ApprovalTrigger,
  RoleId,
} from '@access-genie/shared';
import {
  ApprovalRequest,
  ApprovalWorkflow,
  ScopeNodeModel,
  User,
  nextId,
  type ApprovalRequestDoc,
  type ApprovalRequestStepDoc,
  type ApprovalWorkflowDoc,
  type ScopeNodeDoc,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';

/**
 * The approval engine.
 *
 * A workflow is configuration; this is the part that makes it bite. When an
 * operation that can require sign-off happens, the owning service asks
 * `openIfRequired` whether a workflow covers it. If one does, a request is
 * created and the operation is expected to hold — the caller decides what
 * "hold" means for its own record, because only it knows the state machine.
 * `onSettled` then tells the caller how it ended.
 *
 * That shape — ask, hold, call back — is deliberate. The alternative, having
 * this service reach into `Transfer` and mutate it, would put the transfer state
 * machine in two files and guarantee they eventually disagree.
 *
 * **Matching.** A request is governed by the most *specific* active workflow for
 * its trigger: a workflow scoped to the facility beats one scoped to the org,
 * which beats one with no scope at all. Ties are impossible by construction
 * because specificity is measured as depth in the location tree, and two nodes
 * at the same depth cannot both contain the same subject.
 *
 * **Who may decide.** A step names a role or a specific user. A role step is
 * satisfied by any active user holding that role *whose own scope contains the
 * subject* — an org admin can sign off anywhere, a facility manager only within
 * their facility. Nobody may approve their own request, at any step: the whole
 * point of the control is a second pair of eyes, and a workflow that lets the
 * requester wave their own transfer through is decoration.
 */

// ── Matching ─────────────────────────────────────────────────────────────────

/** Every ancestor of `nodeId`, nearest first, including the node itself. */
async function ancestorChain(nodeId: string | undefined): Promise<string[]> {
  if (!nodeId) return [];
  const rows = await ScopeNodeModel.find().lean<ScopeNodeDoc[]>();
  const byId = new Map(rows.map((r) => [r._id, r]));

  const chain: string[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = nodeId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    chain.push(cursor);
    cursor = byId.get(cursor)?.parentId;
  }
  return chain;
}

/**
 * The workflow governing this trigger at this place, or null.
 *
 * Only `Active` workflows fire. `Draft` and `Inactive` are configuration
 * somebody is still writing or has deliberately switched off, and treating
 * either as live would make the status field meaningless.
 */
export async function resolveWorkflow(
  trigger: ApprovalTrigger,
  scopeId?: string,
): Promise<ApprovalWorkflowDoc | null> {
  const candidates = await ApprovalWorkflow.find({ trigger, status: 'Active' }).lean<ApprovalWorkflowDoc[]>();
  if (candidates.length === 0) return null;

  const chain = await ancestorChain(scopeId);

  // Nearest ancestor wins; an unscoped workflow is the fallback. `chain` is
  // ordered nearest-first, so the first hit is the most specific by definition.
  for (const nodeId of chain) {
    const match = candidates.find((w) => w.scopeId === nodeId);
    if (match) return match;
  }
  return candidates.find((w) => !w.scopeId) ?? null;
}

// ── Opening ──────────────────────────────────────────────────────────────────

export interface OpenApprovalInput {
  trigger: ApprovalTrigger;
  subjectId: string;
  subjectLabel: string;
  scopeId?: string;
  requestedBy: string;
  requestedByName: string;
}

/**
 * Open a request if a workflow covers this operation; otherwise do nothing.
 *
 * Returns the request, or null when no workflow applies — which the caller must
 * read as "proceed as before". That is what keeps this additive: a deployment
 * with no workflows configured behaves exactly as it did before approvals
 * existed, rather than every transfer suddenly blocking on a queue nobody is
 * watching.
 */
export async function openIfRequired(input: OpenApprovalInput): Promise<ApprovalRequestDoc | null> {
  const workflow = await resolveWorkflow(input.trigger, input.scopeId);
  if (!workflow) return null;

  // A workflow with no steps approves nothing and would strand its subject in a
  // queue with no exit. Treated as "not configured" rather than as a block.
  if (workflow.steps.length === 0) {
    logger.warn('Approval workflow has no steps; skipping', { workflowId: workflow._id });
    return null;
  }

  const steps: ApprovalRequestStepDoc[] = [...workflow.steps]
    .sort((a, b) => a.order - b.order)
    .map((step, index) => ({
      order: index + 1,
      name: step.name,
      approverRole: step.approverRole,
      approverUserId: step.approverUserId,
    }));

  const now = new Date();
  const doc = await ApprovalRequest.create({
    _id: await nextId('approvalRequest', 'APR'),
    workflowId: workflow._id,
    workflowName: workflow.name,
    trigger: input.trigger,
    subjectType: input.trigger,
    subjectId: input.subjectId,
    subjectLabel: input.subjectLabel,
    scopeId: input.scopeId,
    status: 'Pending',
    currentStep: 0,
    steps,
    history: [
      {
        at: now,
        actorId: input.requestedBy,
        actorName: input.requestedByName,
        action: 'opened',
        comment: `${workflow.name} — ${steps.length} step${steps.length === 1 ? '' : 's'}`,
      },
    ],
    requestedBy: input.requestedBy,
    requestedByName: input.requestedByName,
    requestedAt: now,
  });

  return doc.toObject();
}

// ── Deciding ─────────────────────────────────────────────────────────────────

export interface Decider {
  id: string;
  name: string;
  roleId: RoleId;
  homeScopeId: string;
}

/**
 * May this person decide this step?
 *
 * Three conditions, all required: the step names them (by user or by role), the
 * subject sits inside their own scope, and they are not the requester.
 */
async function canDecide(
  request: ApprovalRequestDoc,
  step: ApprovalRequestStepDoc,
  decider: Decider,
): Promise<{ ok: boolean; reason?: string }> {
  if (decider.id === request.requestedBy) {
    return { ok: false, reason: 'You cannot approve a request you raised yourself.' };
  }

  if (step.approverUserId) {
    return step.approverUserId === decider.id
      ? { ok: true }
      : { ok: false, reason: 'This step is assigned to a specific approver.' };
  }

  if (step.approverRole) {
    if (step.approverRole !== decider.roleId) {
      return { ok: false, reason: `This step is approved by ${step.approverRole.replace(/_/g, ' ')}.` };
    }
    // Role steps are still bounded by the approver's own estate — a facility
    // manager approves within their facility, not across the organisation.
    const chain = await ancestorChain(request.scopeId);
    const orgWide: RoleId[] = ['super_admin', 'org_admin', 'executive'];
    if (!orgWide.includes(decider.roleId) && request.scopeId && !chain.includes(decider.homeScopeId)) {
      return { ok: false, reason: 'This request is outside the part of the estate you cover.' };
    }
    return { ok: true };
  }

  return { ok: false, reason: 'This step has no approver configured.' };
}

export interface DecisionResult {
  request: ApprovalRequestDoc;
  /** Set when this decision settled the whole request. */
  settled?: ApprovalRequestStatus;
}

/**
 * Record a decision on the current step.
 *
 * A rejection settles the entire request immediately — later approvers are not
 * asked to rubber-stamp something already refused. An approval advances to the
 * next step, or settles the request when it was the last.
 */
export async function decide(
  id: string,
  decision: ApprovalStepDecision,
  decider: Decider,
  comment = '',
): Promise<DecisionResult> {
  const request = await ApprovalRequest.findById(id);
  if (!request) throw ApiError.notFound('Approval request');
  if (request.status !== 'Pending') {
    throw ApiError.badRequest(`This request is already ${request.status.toLowerCase()}.`);
  }

  const step = request.steps[request.currentStep];
  if (!step) throw ApiError.badRequest('This request has no step awaiting a decision.');

  const permitted = await canDecide(request.toObject(), step, decider);
  if (!permitted.ok) throw ApiError.forbidden(permitted.reason ?? 'You cannot decide this step.');

  const now = new Date();
  step.decision = decision;
  step.decidedBy = decider.id;
  step.decidedByName = decider.name;
  step.decidedAt = now;
  step.comment = comment;

  request.history.push({
    at: now,
    actorId: decider.id,
    actorName: decider.name,
    action: decision === 'Approved' ? 'approved' : 'rejected',
    step: step.order,
    comment,
  });

  let settled: ApprovalRequestStatus | undefined;
  if (decision === 'Rejected') {
    request.status = 'Rejected';
    request.currentStep = -1;
    request.settledAt = now;
    settled = 'Rejected';
  } else if (request.currentStep >= request.steps.length - 1) {
    request.status = 'Approved';
    request.currentStep = -1;
    request.settledAt = now;
    settled = 'Approved';
  } else {
    request.currentStep += 1;
  }

  await request.save();
  return { request: request.toObject(), settled };
}

/** Withdraw a pending request — the requester's own escape hatch. */
export async function cancel(id: string, actor: Decider, reason = ''): Promise<ApprovalRequestDoc> {
  const request = await ApprovalRequest.findById(id);
  if (!request) throw ApiError.notFound('Approval request');
  if (request.status !== 'Pending') {
    throw ApiError.badRequest(`This request is already ${request.status.toLowerCase()}.`);
  }

  const orgWide: RoleId[] = ['super_admin', 'org_admin'];
  if (request.requestedBy !== actor.id && !orgWide.includes(actor.roleId)) {
    throw ApiError.forbidden('Only the requester or an administrator can cancel this request.');
  }

  const now = new Date();
  request.status = 'Cancelled';
  request.currentStep = -1;
  request.settledAt = now;
  request.history.push({
    at: now,
    actorId: actor.id,
    actorName: actor.name,
    action: 'cancelled',
    comment: reason,
  });

  await request.save();
  return request.toObject();
}

// ── Reading ──────────────────────────────────────────────────────────────────

/** The open request for a subject, if there is one. */
export async function openRequestFor(
  subjectType: ApprovalTrigger,
  subjectId: string,
): Promise<ApprovalRequestDoc | null> {
  return ApprovalRequest.findOne({ subjectType, subjectId, status: 'Pending' }).lean<ApprovalRequestDoc>();
}

export interface ListApprovalsQuery {
  status?: ApprovalRequestStatus;
  trigger?: ApprovalTrigger;
  /** Only requests this person can act on right now. */
  mine?: boolean;
}

export function toView(doc: ApprovalRequestDoc, canAct: boolean): ApprovalRequestView & { canDecide: boolean } {
  return {
    id: doc._id,
    workflowId: doc.workflowId,
    workflowName: doc.workflowName,
    trigger: doc.trigger,
    subjectType: doc.subjectType,
    subjectId: doc.subjectId,
    subjectLabel: doc.subjectLabel,
    scopeId: doc.scopeId,
    status: doc.status,
    currentStep: doc.currentStep,
    steps: doc.steps.map((s) => ({
      order: s.order,
      name: s.name,
      approverRole: s.approverRole,
      approverUserId: s.approverUserId,
      decision: s.decision,
      decidedBy: s.decidedBy,
      decidedByName: s.decidedByName,
      decidedAt: s.decidedAt?.toISOString(),
      comment: s.comment,
    })),
    history: doc.history.map((h) => ({
      at: h.at.toISOString(),
      actorId: h.actorId,
      actorName: h.actorName,
      action: h.action,
      step: h.step,
      comment: h.comment,
    })),
    requestedBy: doc.requestedBy,
    requestedByName: doc.requestedByName,
    requestedAt: doc.requestedAt.toISOString(),
    settledAt: doc.settledAt?.toISOString(),
    canDecide: canAct,
  };
}

export async function listRequests(
  query: ListApprovalsQuery,
  viewer: Decider,
): Promise<(ApprovalRequestView & { canDecide: boolean })[]> {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.trigger) filter.trigger = query.trigger;

  const rows = await ApprovalRequest.find(filter).sort({ requestedAt: -1 }).limit(200).lean<ApprovalRequestDoc[]>();

  const views = [];
  for (const row of rows) {
    const step = row.status === 'Pending' ? row.steps[row.currentStep] : undefined;
    const permitted = step ? await canDecide(row, step, viewer) : { ok: false };
    if (query.mine && !permitted.ok) continue;
    views.push(toView(row, permitted.ok));
  }
  return views;
}

/** One request, with whether this viewer may act on it. */
export async function getRequest(
  id: string,
  viewer: Decider,
): Promise<ApprovalRequestView & { canDecide: boolean }> {
  const row = await ApprovalRequest.findById(id).lean<ApprovalRequestDoc>();
  if (!row) throw ApiError.notFound('Approval request');
  const step = row.status === 'Pending' ? row.steps[row.currentStep] : undefined;
  const permitted = step ? await canDecide(row, step, viewer) : { ok: false };
  return toView(row, permitted.ok);
}

/** Names for the approver pickers — active users, by role. */
export async function approverCandidates(): Promise<{ id: string; name: string; roleId: RoleId }[]> {
  const rows = await User.find({ status: 'active' }).select('name roleId').lean<{ _id: string; name: string; roleId: RoleId }[]>();
  return rows.map((r) => ({ id: r._id, name: r.name, roleId: r.roleId }));
}
