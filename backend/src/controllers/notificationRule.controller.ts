import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { validatedQuery } from '../middleware/validate.js';
import { recordAudit } from '../services/audit.service.js';
import { NotificationRule, ScopeNodeModel, nextId, type NotificationRuleDoc } from '../models/index.js';
import * as rules from '../services/notificationRule.service.js';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await rules.listRules());
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  if (body.scopeId) {
    const node = await ScopeNodeModel.findById(body.scopeId as string).lean();
    if (!node) throw ApiError.badRequest(`No location ${String(body.scopeId)} exists to scope this rule to.`);
  }

  const doc = await NotificationRule.create({
    ...body,
    _id: await nextId('notificationRule', 'NR'),
    createdBy: req.auth?.user.name ?? '',
  });

  recordAudit(req, { action: 'notification_rule.create', target: doc._id, category: 'Configuration' });
  sendData(res, await rules.toView(doc.toObject()), 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const doc = await NotificationRule.findByIdAndUpdate(id, { $set: req.body }, { new: true }).lean<NotificationRuleDoc>();
  if (!doc) throw ApiError.notFound('Notification rule');

  recordAudit(req, { action: 'notification_rule.update', target: id, category: 'Configuration' });
  sendData(res, await rules.toView(doc));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const doc = await NotificationRule.findByIdAndDelete(id).lean();
  if (!doc) throw ApiError.notFound('Notification rule');

  // The log survives the rule. Deleting the configuration must not erase the
  // record of what it already sent.
  recordAudit(req, { action: 'notification_rule.delete', target: id, category: 'Configuration' });
  res.status(204).send();
});

/** What the rule would say — no send, no log. */
export const preview = asyncHandler(async (req: Request, res: Response) => {
  const doc = await NotificationRule.findById(req.params.id as string).lean<NotificationRuleDoc>();
  if (!doc) throw ApiError.notFound('Notification rule');
  sendData(res, rules.previewMessage(doc));
});

/** Deliver it now, to the real recipients, bypassing throttle and quiet hours. */
export const testSend = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await rules.testSend(id, req.auth?.user.name ?? 'Unknown');
  recordAudit(req, { action: 'notification_rule.test', target: id, category: 'Configuration' });
  sendData(res, result);
});

export const log = asyncHandler(async (_req: Request, res: Response) => {
  const query = validatedQuery<{ ruleId?: string; limit: number }>(res);
  sendData(res, await rules.listLog(query.ruleId, query.limit));
});
