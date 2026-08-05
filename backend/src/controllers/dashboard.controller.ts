import type { Request, Response } from 'express';
import { getDataset } from '../services/dataset.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { getDashboardSummary } from '../services/dashboard.service.js';
import { scopeTreeWithCounts } from '../services/scopeFilter.service.js';

export const summary = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await getDashboardSummary());
});

/** The Org ▸ Region ▸ Facility ▸ … tree behind the scope switcher. */
export const scopeTree = asyncHandler(async (_req: Request, res: Response) => {
  // Same tree, same counts as the dataset carries — the switcher must not show
  // one number here and a different one after a refresh.
  sendData(res, await scopeTreeWithCounts());
});

/**
 * The reference dataset the application screens read, scoped to the caller's
 * module grants. See dataset.service.ts for why this is one endpoint.
 */
export const dataset = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  // `?scope=` narrows the payload to one site and everything under it. Absent
  // means the whole organisation, which is what the root selection sends.
  const scopeId = typeof req.query.scope === 'string' ? req.query.scope : undefined;
  sendData(res, await getDataset(req.auth.modules, req.auth.user.id, scopeId));
});
