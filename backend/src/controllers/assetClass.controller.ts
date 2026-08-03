import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/assetClass.service.js';
import type { CreateAssetClassInput, UpdateAssetClassInput } from '../validators/assetClass.validator.js';

/**
 * Asset classes. Reads are open to anyone with the `assets` grant — the class
 * is what every registration screen picks from — while writes are administrative
 * and audited, because a class change propagates to every asset of that kind.
 */

export const list = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await service.listAssetClasses());
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await service.getAssetClass(req.params.id as string));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const created = await service.createAssetClass(req.body as CreateAssetClassInput);
  recordAudit(req, { action: 'asset_class.create', target: created.id, category: 'Configuration' });
  sendData(res, created, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const updated = await service.updateAssetClass(id, req.body as UpdateAssetClassInput);
  recordAudit(req, { action: 'asset_class.update', target: id, category: 'Configuration' });
  sendData(res, updated);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await service.deleteAssetClass(id);
  recordAudit(req, { action: 'asset_class.delete', target: id, category: 'Configuration' });
  res.status(204).end();
});
