import type { Request, Response } from 'express';
import type { RoleId } from '@access-genie/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/audit.service.js';
import { requireScope } from '../middleware/scope.js';
import * as service from '../services/lifecycle.service.js';
import type { BulkTransitionInput, DecideInput, TransitionInput } from '../validators/lifecycle.validator.js';

/**
 * The signed-in user: the name is what records display, the id is what
 * segregation of duties is decided on (a name can be changed by its owner).
 */
function actorOf(req: Request): { actor: string; actorId: string; role: RoleId } {
  if (!req.auth) throw ApiError.unauthorized();
  return { actor: req.auth.user.name, actorId: String(req.auth.user.id), role: req.auth.roleId };
}

export const board = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await service.getLifecycleBoard(requireScope(req)));
});

export const kpis = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await service.getLifecycleKpis(requireScope(req)));
});

/** The approvals queue's lifecycle half — every pending stage change the caller can see. */
export const pending = asyncHandler(async (req: Request, res: Response) => {
  const { actor, actorId, role } = actorOf(req);
  sendData(res, await service.listPendingStageChanges(requireScope(req), actor, role, actorId));
});

export const history = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await service.listTransitions(requireScope(req), req.params.id as string));
});

export const transition = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { actor, actorId, role } = actorOf(req);
  const result = await service.requestStageChange(requireScope(req), id, req.body as TransitionInput, actor, role, actorId);

  recordAudit(req, {
    action: result.status === 'Applied' ? 'lifecycle.transition' : 'lifecycle.transition_requested',
    target: id,
    category: 'Lifecycle',
    metadata: { toStage: (req.body as TransitionInput).toStage, status: result.status },
  });
  sendData(res, result, result.status === 'Pending' ? 202 : 200);
});

export const decide = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { actor, actorId, role } = actorOf(req);
  const { decision } = req.body as DecideInput;

  const transition = await service.decideStageChange(requireScope(req), id, decision, actor, role, actorId);
  recordAudit(req, { action: `lifecycle.${decision.toLowerCase()}`, target: id, category: 'Lifecycle' });
  sendData(res, transition);
});

export const bulkTransition = asyncHandler(async (req: Request, res: Response) => {
  const { actor, actorId, role } = actorOf(req);
  const { ids, ...input } = req.body as BulkTransitionInput;

  const result = await service.bulkStageChange(requireScope(req), ids, input, actor, role, actorId);
  recordAudit(req, {
    action: 'lifecycle.bulk_transition',
    target: `${ids.length} assets`,
    category: 'Lifecycle',
    metadata: { toStage: input.toStage, updated: result.updated.length, pending: result.pendingApproval.length, failed: result.failed.length },
  });
  sendData(res, result);
});
