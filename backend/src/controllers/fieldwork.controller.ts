import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import * as service from '../services/fieldwork.service.js';

/**
 * Mobile workforce. Both endpoints answer for the signed-in person by default —
 * a technician's phone should not have to know its own name.
 */

export const queue = asyncHandler(async (req: Request, res: Response) => {
  const assignee = (req.query.assignee as string) ?? req.auth?.user.name;
  sendData(res, await service.fieldQueue(assignee));
});

/** Everything unassigned or assigned to anyone — the planner's view. */
export const allWork = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await service.fieldQueue());
});

export const scan = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.auth?.user.name ?? 'field scan';
  const zone = typeof req.body?.zone === 'string' ? req.body.zone : undefined;
  sendData(res, await service.scanAsset(req.params.id as string, actor, zone));
});
