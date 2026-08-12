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
    // Blank is a legitimate value, not missing data — a part can be received
    // before it has a shelf assigned. `required: true` would reject the empty
    // string Mongoose's own required-check treats as "unset" for a String
    // path, even though the validator (partFields.bin) defaults it to ''.
    bin: { type: String, default: '' },
    abcClass: { type: String, required: true, enum: ['A', 'B', 'C'], index: true },
    // Same reasoning as `bin`: "None" is a real, UI-selectable option (see
    // partFields.supplierId's default('')) — a part with no supplier simply
    // never gets auto-ordered, which is not a validation failure.
    supplierId: { type: String, default: '', ref: 'Supplier' },
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

// ── Stock movement ledger ────────────────────────────────────────────────────
/**
 * Every change to `onHand`, and why.
 *
 * Without this, a part's current quantity is the only fact the system holds
 * about it: you can see there are four, and nothing about how it got to four.
 * The part detail screen was filling that gap with a generated sine wave and a
 * table of invented receipts — plausible, stable across renders, and entirely
 * fictional.
 *
 * Append-only. `after` is stored alongside `delta` so the ledger can be read
 * without replaying it, and so a discrepancy between the ledger and the part is
 * visible rather than silently reconciled.
 */
export const STOCK_MOVEMENT_KINDS = ['Receipt', 'Issue', 'Adjustment'] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number];

export interface StockMovementDoc {
  _id: string; // SM-1
  sku: string;
  partId: string;
  warehouseId: string;
  kind: StockMovementKind;
  /** Signed: negative is stock leaving the shelf. */
  delta: number;
  after: number;
  reason: string;
  /** What caused it — a work order, a purchase order, or a person. */
  reference: string;
  actor: string;
  at: Date;
}

const stockMovementSchema = new Schema<StockMovementDoc>(
  {
    _id: { type: String, required: true },
    sku: { type: String, required: true, index: true },
    partId: { type: String, required: true, ref: 'Part', index: true },
    warehouseId: { type: String, required: true },
    kind: { type: String, required: true, enum: STOCK_MOVEMENT_KINDS },
    delta: { type: Number, required: true },
    after: { type: Number, required: true, min: 0 },
    reason: { type: String, default: '' },
    reference: { type: String, default: '' },
    actor: { type: String, default: '' },
    at: { type: Date, required: true, index: true },
  },
  { versionKey: false },
);

stockMovementSchema.plugin(baseSchemaPlugin);
stockMovementSchema.index({ sku: 1, at: -1 });
export const StockMovement = model<StockMovementDoc>('StockMovement', stockMovementSchema);
