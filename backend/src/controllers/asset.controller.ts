import type { Request, Response } from 'express';
import { validatedQuery } from '../middleware/validate.js';
import { requireScope } from '../middleware/scope.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { sendData, sendList } from '../utils/response.js';
import * as assetService from '../services/asset.service.js';
import { recordAudit } from '../services/audit.service.js';
import type { AssetListQuery, CreateAssetInput, UpdateAssetInput } from '../validators/asset.validator.js';

/**
 * Controllers stay thin on purpose: read the request, call one service, send
 * the response. All business rules live in the service layer so they are
 * reachable from the seeder, a future GraphQL resolver or a job runner without
 * going through HTTP.
 */

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<AssetListQuery>(res);
  const { items, meta } = await assetService.listAssets(requireScope(req), query);
  sendList(res, items, meta);
});

export const stats = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await assetService.getAssetStats(requireScope(req)));
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await assetService.getAsset(requireScope(req), req.params.id as string));
});

/** Asset 360 — the record plus every timeline attached to it. */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await assetService.getAssetProfile(requireScope(req), req.params.id as string));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.auth?.user.name ?? 'system';
  const asset = await assetService.createAsset(requireScope(req), req.body as CreateAssetInput, actor);

  recordAudit(req, { action: 'asset.create', target: asset._id, category: 'Assets' });
  sendData(res, asset, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.auth?.user.name ?? 'system';
  const id = req.params.id as string;
  const asset = await assetService.updateAsset(requireScope(req), id, req.body as UpdateAssetInput, actor);

  recordAudit(req, { action: 'asset.update', target: id, category: 'Assets', metadata: { fields: Object.keys(req.body ?? {}) } });
  sendData(res, asset);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await assetService.deleteAsset(requireScope(req), id);

  recordAudit(req, { action: 'asset.delete', target: id, category: 'Assets' });
  res.status(204).send();
});

/** Apply one change across a selection. Partial success is reported, not thrown. */
export const bulkUpdate = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  const { ids, patch } = req.body as { ids: string[]; patch: Record<string, unknown> };
  const result = await assetService.bulkUpdateAssets(requireScope(req), ids, patch, req.auth.user.name);

  recordAudit(req, {
    action: 'asset.bulk_update',
    target: `${result.updated.length} assets`,
    category: 'Assets',
    metadata: { fields: Object.keys(patch), updated: result.updated.length, failed: result.failed.length },
  });
  sendData(res, result);
});

