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
import type { ListQueryInput } from '../validators/common.js';

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

// ── Alert rules ──────────────────────────────────────────────────────────────
export const listAlertRules = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await AlertRule.find().sort({ name: 1 }).lean());
});

export const toggleAlertRule = asyncHandler(async (req: Request, res: Response) => {
  const { enabled } = req.body as { enabled: boolean };
  const rule = await AlertRule.findByIdAndUpdate(req.params.id as string, { $set: { enabled } }, { new: true }).lean();

  if (!rule) throw ApiError.notFound('Alert rule');
  sendData(res, rule);
});
