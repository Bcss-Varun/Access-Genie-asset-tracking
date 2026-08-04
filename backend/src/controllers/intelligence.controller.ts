import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/audit.service.js';
import { explainAsset, recomputeAllMetrics } from '../services/metrics.service.js';
import { regenerateInsights } from '../services/insightEngine.service.js';

/**
 * Derived intelligence — recomputing the scores and regenerating the findings.
 *
 * Exposed as endpoints rather than run only on a timer because an operator who
 * has just corrected a batch of records should be able to see the effect
 * immediately, and because a scheduled job that cannot be triggered by hand is
 * impossible to reason about when the numbers look wrong.
 */

export const recompute = asyncHandler(async (req: Request, res: Response) => {
  const metrics = await recomputeAllMetrics();
  const insights = await regenerateInsights();

  recordAudit(req, {
    action: 'intelligence.recompute',
    target: 'estate',
    category: 'System',
    metadata: { ...metrics, ...insights },
  });

  sendData(res, { metrics, insights });
});

/** Why one asset scores the way it does — the explainability view. */
export const explain = asyncHandler(async (req: Request, res: Response) => {
  const result = await explainAsset(req.params.id as string);
  if (!result) throw ApiError.notFound('Asset');
  sendData(res, result);
});
