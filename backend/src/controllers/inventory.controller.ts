import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/inventory.service.js';

/** Inventory and procurement writes. Stock movements are audited; they are money. */

const audited = (req: Request, action: string, target: string) =>
  recordAudit(req, { action, target, category: 'Inventory' });

export const createWarehouse = asyncHandler(async (req: Request, res: Response) => {
  const created = await service.createWarehouse(req.body);
  audited(req, 'warehouse.create', created._id);
  sendData(res, created, 201);
});
export const updateWarehouse = asyncHandler(async (req: Request, res: Response) => {
  const updated = await service.updateWarehouse(req.params.id as string, req.body);
  audited(req, 'warehouse.update', req.params.id as string);
  sendData(res, updated);
});
export const removeWarehouse = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteWarehouse(req.params.id as string);
  audited(req, 'warehouse.delete', req.params.id as string);
  res.status(204).end();
});

export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
  const created = await service.createSupplier(req.body);
  audited(req, 'supplier.create', created._id);
  sendData(res, created, 201);
});
export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
  const updated = await service.updateSupplier(req.params.id as string, req.body);
  audited(req, 'supplier.update', req.params.id as string);
  sendData(res, updated);
});
export const removeSupplier = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteSupplier(req.params.id as string);
  audited(req, 'supplier.delete', req.params.id as string);
  res.status(204).end();
});

export const createPart = asyncHandler(async (req: Request, res: Response) => {
  const created = await service.createPart(req.body);
  audited(req, 'part.create', created._id);
  sendData(res, created, 201);
});
export const updatePart = asyncHandler(async (req: Request, res: Response) => {
  const updated = await service.updatePart(req.params.id as string, req.body);
  audited(req, 'part.update', req.params.id as string);
  sendData(res, updated);
});
export const removePart = asyncHandler(async (req: Request, res: Response) => {
  await service.deletePart(req.params.id as string);
  audited(req, 'part.delete', req.params.id as string);
  res.status(204).end();
});

/** A counted correction, receipt or write-off — recorded with its reason. */
export const adjustStock = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const updated = await service.adjustStock(id, req.body, req.auth?.user.name ?? '');
  recordAudit(req, {
    action: 'part.stock_adjust',
    target: id,
    category: 'Inventory',
    metadata: { delta: req.body.delta, reason: req.body.reason },
  });
  sendData(res, updated);
});

export const reorderList = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await service.reorderList());
});

export const draftReorders = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.draftReorders();
  recordAudit(req, { action: 'purchase_order.draft_reorders', target: 'inventory', category: 'Inventory', metadata: { ...result } });
  sendData(res, result, 201);
});

export const createPurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const created = await service.createPurchaseOrder(req.body);
  audited(req, 'purchase_order.create', created._id);
  sendData(res, created, 201);
});
export const updatePurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const updated = await service.updatePurchaseOrder(req.params.id as string, req.body);
  audited(req, 'purchase_order.update', req.params.id as string);
  sendData(res, updated);
});
export const receivePurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await service.receivePurchaseOrder(id);
  audited(req, 'purchase_order.receive', id);
  sendData(res, result);
});

/** A part's movement history — every change to its quantity, and why. */
export const partMovements = asyncHandler(async (req: Request, res: Response) => {
  const movements = await service.movementsFor(req.params.sku as string);
  sendData(res, movements);
});

