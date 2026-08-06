import type { Request, Response } from 'express';
import { ASSET_CATEGORIES, DASHBOARD_PERIODS, type AssetCategory, type DashboardPeriod } from '@access-genie/shared';
import { getDataset } from '../services/dataset.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { getDashboardSummary } from '../services/dashboard.service.js';
import { scopeTreeWithCounts } from '../services/scopeFilter.service.js';

/**
 * The dashboard, narrowed the same two ways the screen offers.
 *
 * `?scope=` is the site switcher and `?period=` the range selector. Both are
 * read here rather than defaulted in the service so the endpoint's contract is
 * visible at the edge — and an unrecognised period falls back to 30 days rather
 * than being refused, because a stale bookmark should still render a dashboard.
 */
export const summary = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  const str = (key: string): string | undefined => {
    const value = req.query[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  };

  const requested = str('period') ?? '';
  const period = (DASHBOARD_PERIODS as readonly string[]).includes(requested)
    ? (requested as DashboardPeriod)
    : '30d';

  // A half-supplied or unparseable range falls back to the period rather than
  // being refused: a bookmark from a stale build should still render.
  const parseDate = (value?: string) => {
    if (!value) return undefined;
    const at = new Date(value);
    return Number.isNaN(at.getTime()) ? undefined : at;
  };

  const rawCategory = str('category');
  const category = (ASSET_CATEGORIES as readonly string[]).includes(rawCategory ?? '')
    ? (rawCategory as AssetCategory)
    : undefined;

  sendData(
    res,
    await getDashboardSummary({
      modules: req.auth.modules,
      userName: req.auth.user.name,
      scopeId: str('scope'),
      period,
      from: parseDate(str('from')),
      to: parseDate(str('to')),
      department: str('department'),
      category,
    }),
  );
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
