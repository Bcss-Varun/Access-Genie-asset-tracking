import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/scope.service.js';
import type { CreateScopeInput, UpdateScopeInput } from '../validators/scope.validator.js';

/**
 * The location hierarchy.
 *
 * Reads are ungated — every screen that shows where something is needs the
 * tree, and the scope picker is part of the chrome. Writes are administrative
 * and audited: the hierarchy decides what each role can see, so adding or
 * removing a node changes an access boundary, not just a label.
 */

export const list = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await service.listScopeNodes());
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const created = await service.createScopeNode(req.body as CreateScopeInput);
  recordAudit(req, {
    action: 'scope.create',
    target: created.id,
    category: 'Configuration',
    metadata: { level: created.level, name: created.name },
  });
  sendData(res, created, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const updated = await service.updateScopeNode(id, req.body as UpdateScopeInput);
  recordAudit(req, { action: 'scope.update', target: id, category: 'Configuration' });
  sendData(res, updated);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await service.deleteScopeNode(id);
  recordAudit(req, { action: 'scope.delete', target: id, category: 'Configuration' });
  res.status(204).end();
});
