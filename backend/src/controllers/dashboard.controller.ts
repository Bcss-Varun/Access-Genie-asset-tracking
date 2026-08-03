import type { Request, Response } from 'express';
import { getDataset } from '../services/dataset.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { getDashboardSummary } from '../services/dashboard.service.js';
import { ScopeNodeModel, buildScopeTree } from '../models/index.js';

export const summary = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await getDashboardSummary());
});

/** The Org ▸ Region ▸ Facility ▸ … tree behind the scope switcher. */
export const scopeTree = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await ScopeNodeModel.find().lean();
  sendData(res, buildScopeTree(rows));
});

/**
 * The reference dataset the application screens read, scoped to the caller's
 * module grants. See dataset.service.ts for why this is one endpoint.
 */
export const dataset = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  sendData(res, await getDataset(req.auth.modules, req.auth.user.id));
});
