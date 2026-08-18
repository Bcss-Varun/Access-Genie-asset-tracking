import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireScope } from '../middleware/scope.js';
import { assetClause } from '../services/tenancy.service.js';
import { sendData, sendList } from '../utils/response.js';
import { validatedQuery } from '../middleware/validate.js';
import { parsePagination, paginate } from '../utils/query.js';
import { ApiError } from '../utils/ApiError.js';
import {
  AlertRule,
  AuditLog,
  CustodyRecord,
  Notification,
} from '../models/index.js';
import { nextId } from '../models/Counter.js';
import type { ListQueryInput } from '../validators/common.js';
import { recordCustody } from '../services/custody.service.js';
import { recordAudit } from '../services/audit.service.js';
import type { CustodyAction } from '@access-genie/shared';

/**
 * Read endpoints for the supporting collections — notifications, audit,
 * custody and alert rules. They share a controller because each is a
 * straight paginated read with no domain rules of its own; the moment one grows
 * real behaviour it earns its own service and file.
 */

// ── Notifications ────────────────────────────────────────────────────────────
export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  // A notification with no `userId` is a broadcast every user receives.
  const notifications = await Notification.find({ $or: [{ userId: req.auth.user.id }, { userId: { $exists: false } }] })
    .sort({ at: -1 })
    .limit(100)
    .lean();

  sendData(res, notifications);
});

export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const notification = await Notification.findByIdAndUpdate(
    req.params.id as string,
    { $set: { read: true } },
    { new: true },
  ).lean();

  if (!notification) throw ApiError.notFound('Notification');
  sendData(res, notification);
});

export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  const result = await Notification.updateMany(
    { $or: [{ userId: req.auth.user.id }, { userId: { $exists: false } }], read: false },
    { $set: { read: true } },
  );

  sendData(res, { updated: result.modifiedCount });
});

// ── Compliance ───────────────────────────────────────────────────────────────
export const listAudit = asyncHandler(async (_req: Request, res: Response) => {
  const query = validatedQuery<ListQueryInput & { category?: string; actor?: string }>(res);
  const filter: Record<string, unknown> = {};

  if (query.category) filter.category = query.category;
  if (query.actor) filter.actor = query.actor;

  const pagination = parsePagination(query, ['timestamp', 'actor', 'category'], '-timestamp');
  const { items, meta } = await paginate(AuditLog, filter, pagination);
  sendList(res, items, meta);
});

export const listCustody = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<ListQueryInput & { assetId?: string }>(res);
  // The custody chain records who held which asset. It carries no location of
  // its own, so it is narrowed by the assets inside the caller's estate —
  // otherwise a facility manager reads the movement history of the whole
  // organisation, which is exactly what this used to do.
  const filter: Record<string, unknown> = { ...(await assetClause(requireScope(req))) };
  if (query.assetId) filter.assetId = query.assetId;

  const pagination = parsePagination(query, ['at', 'holder'], '-at');
  const { items, meta } = await paginate(CustodyRecord, filter, pagination);
  sendList(res, items, meta);
});

/**
 * Check an asset in or out.
 *
 * The screen kept its log in component state, so the chain of custody it showed
 * was gone on reload and the asset's profile still named the previous holder.
 * The move is a domain action rather than an insert — see custody.service.ts.
 */
export const createCustody = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { assetId: string; holder: string; action: CustodyAction; note?: string };
  const actor = req.auth?.user.name ?? req.auth?.user.email ?? 'system';

  const record = await recordCustody(body, actor);

  recordAudit(req, {
    action: 'custody.record',
    target: body.assetId,
    category: 'Operations',
    metadata: { action: body.action, holder: body.holder },
  });

  sendData(res, record, 201);
});

// ── Alert rules ──────────────────────────────────────────────────────────────
export const listAlertRules = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await AlertRule.find().sort({ name: 1 }).lean());
});

export const createAlertRule = asyncHandler(async (req: Request, res: Response) => {
  const _id = await nextId('alertRule', 'RUL');
  const rule = await AlertRule.create({ ...(req.body as object), _id });

  recordAudit(req, { action: 'alert_rule.create', target: _id, category: 'Configuration' });
  sendData(res, rule.toJSON(), 201);
});

export const updateAlertRule = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const rule = await AlertRule.findByIdAndUpdate(id, { $set: req.body as object }, { new: true, runValidators: true }).lean();

  if (!rule) throw ApiError.notFound('Alert rule');
  recordAudit(req, { action: 'alert_rule.update', target: id, category: 'Configuration' });
  sendData(res, rule);
});

export const deleteAlertRule = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const rule = await AlertRule.findByIdAndDelete(id).lean();

  if (!rule) throw ApiError.notFound('Alert rule');
  recordAudit(req, { action: 'alert_rule.delete', target: id, category: 'Configuration' });
  res.status(204).end();
});

export const toggleAlertRule = asyncHandler(async (req: Request, res: Response) => {
  const { enabled } = req.body as { enabled: boolean };
  const rule = await AlertRule.findByIdAndUpdate(req.params.id as string, { $set: { enabled } }, { new: true }).lean();

  if (!rule) throw ApiError.notFound('Alert rule');
  sendData(res, rule);
});
