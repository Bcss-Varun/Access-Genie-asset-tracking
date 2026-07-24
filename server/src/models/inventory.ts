import { model, Schema } from 'mongoose';
import { PO_STATUSES, type AbcClass, type PoStatus } from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

// Spare-parts inventory. These four collections are only ever read and written
// together, so they share a file rather than fragmenting into four near-empty
// modules.

// ── Warehouse ────────────────────────────────────────────────────────────────
export interface WarehouseDoc {
  _id: string; // WH-01
  name: string;
  location: string;
  binCount: number;
  skuCount: number;
  valueInr: number;
}

const warehouseSchema = new Schema<WarehouseDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    location: { type: String, required: true },
    binCount: { type: Number, default: 0, min: 0 },
    skuCount: { type: Number, default: 0, min: 0 },
    valueInr: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false },
);
warehouseSchema.plugin(baseSchemaPlugin);
export const Warehouse = model<WarehouseDoc>('Warehouse', warehouseSchema);

// ── Supplier ─────────────────────────────────────────────────────────────────
export interface SupplierDoc {
  _id: string; // SUP-01
  name: string;
  category: string;
  leadTimeDays: number;
  rating: number;
  contact: string;
  onTimePct: number;
}

const supplierSchema = new Schema<SupplierDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    leadTimeDays: { type: Number, required: true, min: 0 },
    rating: { type: Number, required: true, min: 0, max: 5 },
    contact: { type: String, required: true },
    onTimePct: { type: Number, required: true, min: 0, max: 100 },
  },
  { versionKey: false },
);
supplierSchema.plugin(baseSchemaPlugin);
export const Supplier = model<SupplierDoc>('Supplier', supplierSchema);

// ── Part ─────────────────────────────────────────────────────────────────────
export interface PartDoc {
  _id: string; // PRT-01
  sku: string;
  name: string;
  category: string;
  onHand: number;
  reorderPoint: number;
  unitCost: number;
  warehouseId: string;
  bin: string;
  abcClass: AbcClass;
  supplierId: string;
  leadTimeDays: number;
}

const partSchema = new Schema<PartDoc>(
  {
    _id: { type: String, required: true },
    sku: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, required: true, index: true },
    onHand: { type: Number, required: true, min: 0 },
    reorderPoint: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    warehouseId: { type: String, required: true, ref: 'Warehouse', index: true },
    bin: { type: String, required: true },
    abcClass: { type: String, required: true, enum: ['A', 'B', 'C'], index: true },
    supplierId: { type: String, required: true, ref: 'Supplier' },
    leadTimeDays: { type: Number, required: true, min: 0 },
  },
  { versionKey: false },
);
partSchema.plugin(baseSchemaPlugin);
partSchema.index({ name: 'text', sku: 'text' }, { name: 'part_search' });
export const Part = model<PartDoc>('Part', partSchema);

// ── Purchase order ───────────────────────────────────────────────────────────
export interface PurchaseOrderDoc {
  _id: string; // PO-01
  supplierId: string;
  supplierName: string;
  status: PoStatus;
  expectedAt: Date;
  total: number;
  lines: { sku: string; name: string; qty: number; unitCost: number }[];
  createdAt: Date;
  updatedAt: Date;
}

const poLineSchema = new Schema(
  {
    sku: { type: String, required: true },
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    unitCost: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const purchaseOrderSchema = new Schema<PurchaseOrderDoc>(
  {
    _id: { type: String, required: true },
    supplierId: { type: String, required: true, ref: 'Supplier', index: true },
    supplierName: { type: String, required: true },
    status: { type: String, required: true, enum: PO_STATUSES, default: 'Draft', index: true },
    expectedAt: { type: Date, required: true },
    total: { type: Number, required: true, min: 0 },
    lines: { type: [poLineSchema], default: [] },
  },
  { timestamps: true },
);
purchaseOrderSchema.plugin(baseSchemaPlugin);
export const PurchaseOrder = model<PurchaseOrderDoc>('PurchaseOrder', purchaseOrderSchema);
