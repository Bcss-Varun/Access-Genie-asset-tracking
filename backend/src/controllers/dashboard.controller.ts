import type { Request, Response } from 'express';
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
