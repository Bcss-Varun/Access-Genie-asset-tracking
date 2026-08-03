import type { Request, Response } from 'express';
import { validatedQuery } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData, sendList } from '../utils/response.js';
import * as insightService from '../services/insight.service.js';
import { recordAudit } from '../services/audit.service.js';
import type { ListQueryInput } from '../validators/common.js';

type InsightQuery = ListQueryInput & { type?: string; severity?: string; status?: string; assetId?: string };

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const query = validatedQuery<InsightQuery>(res);
  const { items, meta } = await insightService.listInsights(query);
  sendList(res, items, meta);
});

export const stats = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await insightService.getInsightStats());
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await insightService.getInsight(req.params.id as string));
});

export const action = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const insight = await insightService.setInsightStatus(id, 'actioned');

  recordAudit(req, { action: 'insight.action', target: id, category: 'AI' });
  sendData(res, insight);
});

export const dismiss = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const insight = await insightService.setInsightStatus(id, 'dismissed');

  recordAudit(req, { action: 'insight.dismiss', target: id, category: 'AI' });
  sendData(res, insight);
});
