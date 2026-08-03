import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData, sendList } from '../utils/response.js';
import { validatedQuery } from '../middleware/validate.js';
import { parsePagination, paginate } from '../utils/query.js';
import { ApiError } from '../utils/ApiError.js';
import {
  AlertRule,
  AuditLog,
  CustodyRecord,
  Notification,
  Part,
  PurchaseOrder,
  Supplier,
  Warehouse,
} from '../models/index.js';
import { nextId } from '../models/Counter.js';
import type { ListQueryInput } from '../validators/common.js';
import { recordCustody } from '../services/custody.service.js';
import { recordAudit } from '../services/audit.service.js';
import type { CustodyAction } from '@access-genie/shared';

/**
 * Read endpoints for the supporting collections — inventory, notifications,
 * audit, custody and alert rules. They share a controller because each is a
 * straight paginated read with no domain rules of its own; the moment one grows
 * real behaviour it earns its own service and file.
 */

// ── Inventory ────────────────────────────────────────────────────────────────
export const listParts = asyncHandler(async (_req: Request, res: Response) => {
  const query = validatedQuery<ListQueryInput & { warehouseId?: string; abcClass?: string; reorder?: string }>(res);
  const filter: Record<string, unknown> = {};

  if (query.warehouseId) filter.warehouseId = query.warehouseId;
  if (query.abcClass) filter.abcClass = query.abcClass;
  // `?reorder=true` → at or below the reorder point. `$expr` compares two
  // fields of the same document, which a plain filter cannot do.
  if (query.reorder === 'true') filter.$expr = { $lte: ['$onHand', '$reorderPoint'] };
  if (query.q) filter.$text = { $search: query.q };

  const pagination = parsePagination(query, ['name', 'sku', 'onHand', 'unitCost'], 'name');
  const { items, meta } = await paginate(Part, filter, pagination);
  sendList(res, items, meta);
});

export const listWarehouses = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await Warehouse.find().sort({ name: 1 }).lean());
});

export const listSuppliers = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await Supplier.find().sort({ name: 1 }).lean());
});

export const listPurchaseOrders = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await PurchaseOrder.find().sort({ createdAt: -1 }).limit(100).lean());
});

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

export const listCustody = asyncHandler(async (_req: Request, res: Response) => {
  const query = validatedQuery<ListQueryInput & { assetId?: string }>(res);
  const filter: Record<string, unknown> = {};
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
