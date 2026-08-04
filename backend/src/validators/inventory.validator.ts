import { z } from 'zod';
import { PO_STATUSES } from '@access-genie/shared';
import { isoDateString } from './common.js';

/** Inventory and procurement writes. */

const warehouseFields = {
  name: z.string().trim().min(2).max(80),
  location: z.string().trim().min(2).max(120),
};
export const createWarehouseSchema = z.object(warehouseFields);
export const updateWarehouseSchema = z.object(warehouseFields).partial();

const supplierFields = {
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  leadTimeDays: z.coerce.number().int().min(0).max(365).default(7),
  rating: z.coerce.number().min(0).max(5).default(3),
  contact: z.string().trim().min(3).max(160),
  onTimePct: z.coerce.number().min(0).max(100).default(100),
};
export const createSupplierSchema = z.object(supplierFields);
export const updateSupplierSchema = z.object(supplierFields).partial();

const partFields = {
  sku: z.string().trim().min(2).max(60),
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  onHand: z.coerce.number().int().min(0).default(0),
  reorderPoint: z.coerce.number().int().min(0).default(0),
  unitCost: z.coerce.number().min(0),
  warehouseId: z.string().trim().min(1),
  bin: z.string().trim().max(40).default(''),
  // A/B/C stock classification — `AbcClass` is a union rather than a const
  // array in the contract, so the values are spelled out here.
  abcClass: z.enum(['A', 'B', 'C']).default('C'),
  supplierId: z.string().trim().max(60).default(''),
  leadTimeDays: z.coerce.number().int().min(0).max(365).default(7),
};
export const createPartSchema = z.object(partFields);
/**
 * `onHand` is not updatable here on purpose — stock moves through the
 * adjustment endpoint, which records why. See inventory.service.ts.
 */
export const updatePartSchema = z.object(partFields).omit({ onHand: true, sku: true }).partial();

export const stockAdjustmentSchema = z.object({
  delta: z.number().int().refine((n) => n !== 0, 'An adjustment of zero changes nothing'),
  reason: z.string().trim().min(3).max(200),
});

const poLine = z.object({
  sku: z.string().trim().min(1),
  name: z.string().trim().min(1),
  qty: z.coerce.number().int().min(1),
  unitCost: z.coerce.number().min(0),
});

const poFields = {
  supplierId: z.string().trim().min(1),
  status: z.enum(PO_STATUSES).default('Draft'),
  expectedAt: isoDateString,
  lines: z.array(poLine).min(1, 'A purchase order needs at least one line'),
};
export const createPurchaseOrderSchema = z.object(poFields);
export const updatePurchaseOrderSchema = z.object(poFields).omit({ supplierId: true }).partial();

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type CreatePartInput = z.infer<typeof createPartSchema>;
export type UpdatePartInput = z.infer<typeof updatePartSchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;
