import type { Request, Response } from 'express';
import type { RoleId } from '@access-genie/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/lifecycle.service.js';
import type { BulkTransitionInput, DecideInput, TransitionInput } from '../validators/lifecycle.validator.js';

/** The signed-in user's name and role — the requester/decider/approver on every record. */
function actorOf(req: Request): { actor: string; role: RoleId } {
  if (!req.auth) throw ApiError.unauthorized();
  return { actor: req.auth.user.name, role: req.auth.roleId };
}

export const board = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await service.getLifecycleBoard());
});

export const kpis = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await service.getLifecycleKpis());
});

export const history = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await service.listTransitions(req.params.id as string));
});

export const transition = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { actor, role } = actorOf(req);
  const result = await service.requestStageChange(id, req.body as TransitionInput, actor, role);

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
  const { actor, role } = actorOf(req);
  const { decision } = req.body as DecideInput;

  const transition = await service.decideStageChange(id, decision, actor, role);
  recordAudit(req, { action: `lifecycle.${decision.toLowerCase()}`, target: id, category: 'Lifecycle' });
  sendData(res, transition);
});

export const bulkTransition = asyncHandler(async (req: Request, res: Response) => {
  const { actor, role } = actorOf(req);
  const { ids, ...input } = req.body as BulkTransitionInput;

  const result = await service.bulkStageChange(ids, input, actor, role);
  recordAudit(req, {
    action: 'lifecycle.bulk_transition',
    target: `${ids.length} assets`,
    category: 'Lifecycle',
    metadata: { toStage: input.toStage, updated: result.updated.length, pending: result.pendingApproval.length, failed: result.failed.length },
  });
  sendData(res, result);
});
