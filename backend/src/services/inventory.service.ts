import {
  Part,
  PurchaseOrder,
  StockMovement,
  Supplier,
  Warehouse,
  nextId,
  type PartDoc,
  type PurchaseOrderDoc,
  type StockMovementDoc,
  type StockMovementKind,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import type {
  CreatePartInput,
  CreatePurchaseOrderInput,
  CreateSupplierInput,
  CreateWarehouseInput,
  StockAdjustmentInput,
  UpdatePartInput,
  UpdatePurchaseOrderInput,
  UpdateSupplierInput,
  UpdateWarehouseInput,
} from '../validators/inventory.validator.js';

/**
 * Inventory and procurement.
 *
 * All four collections here — parts, warehouses, suppliers, purchase orders —
 * were read-only: the screens rendered them and nothing could ever change one.
 * That made the whole supply side a display of the seed file.
 *
 * The part that makes this a supply *chain* rather than four CRUD tables is
 * `consumeParts` below. Stock has to fall when work consumes it, or every
 * number downstream — reorder points, warehouse value, "do we have one" — is
 * decorative. The link runs from a work order closing to the shelf.
 */

// ── Warehouses ───────────────────────────────────────────────────────────────

export async function createWarehouse(input: CreateWarehouseInput) {
  const created = await Warehouse.create({ ...input, _id: await nextId('warehouse', 'WH') });
  return created.toObject();
}

export async function updateWarehouse(id: string, patch: UpdateWarehouseInput) {
  const updated = await Warehouse.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean();
  if (!updated) throw ApiError.notFound('Warehouse');
  return updated;
}

export async function deleteWarehouse(id: string): Promise<void> {
  // Parts reference a warehouse by id; removing it would leave them pointing at
  // a shelf that does not exist.
  const stocked = await Part.countDocuments({ warehouseId: id });
  if (stocked > 0) {
    throw ApiError.conflict(`${stocked} part${stocked === 1 ? '' : 's'} are stocked here — move them before deleting this warehouse`);
  }
  const removed = await Warehouse.findByIdAndDelete(id).lean();
  if (!removed) throw ApiError.notFound('Warehouse');
}

// ── Suppliers ────────────────────────────────────────────────────────────────

export async function createSupplier(input: CreateSupplierInput) {
  const created = await Supplier.create({ ...input, _id: await nextId('supplier', 'SUP') });
  return created.toObject();
}

export async function updateSupplier(id: string, patch: UpdateSupplierInput) {
  const updated = await Supplier.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean();
  if (!updated) throw ApiError.notFound('Supplier');
  return updated;
}

export async function deleteSupplier(id: string): Promise<void> {
  const openPos = await PurchaseOrder.countDocuments({ supplierId: id, status: { $nin: ['Received', 'Cancelled'] } });
  if (openPos > 0) {
    throw ApiError.conflict(`${openPos} open purchase order${openPos === 1 ? '' : 's'} reference this supplier`);
  }
  const removed = await Supplier.findByIdAndDelete(id).lean();
  if (!removed) throw ApiError.notFound('Supplier');
}

// ── Parts ────────────────────────────────────────────────────────────────────

/** Keep the warehouse rollups true after any change to what it holds. */
async function refreshWarehouseTotals(warehouseId: string): Promise<void> {
  const parts = await Part.find({ warehouseId }).select('onHand unitCost bin').lean();
  await Warehouse.updateOne(
    { _id: warehouseId },
    {
      $set: {
        skuCount: parts.length,
        valueInr: Math.round(parts.reduce((sum, p) => sum + p.onHand * p.unitCost, 0)),
        binCount: new Set(parts.map((p) => p.bin).filter(Boolean)).size,
      },
    },
  );
}

export async function createPart(input: CreatePartInput): Promise<PartDoc> {
  const [warehouse, supplier] = await Promise.all([
    Warehouse.findById(input.warehouseId).lean(),
    input.supplierId ? Supplier.findById(input.supplierId).lean() : null,
  ]);
  if (!warehouse) throw ApiError.badRequest(`Warehouse ${input.warehouseId} does not exist`);
  if (input.supplierId && !supplier) throw ApiError.badRequest(`Supplier ${input.supplierId} does not exist`);

  const duplicate = await Part.findOne({ sku: input.sku }).lean();
  if (duplicate) throw ApiError.conflict(`SKU ${input.sku} already exists`);

  const created = await Part.create({ ...input, _id: await nextId('part', 'PRT') });
  await refreshWarehouseTotals(input.warehouseId);

  // Opening stock is a movement like any other. Without this row the ledger
  // starts mid-story and cannot explain where the first units came from.
  if (created.onHand > 0) {
    await recordMovement({ part: created, kind: 'Receipt', delta: created.onHand, reason: 'Opening stock' });
  }
  return created.toObject();
}

export async function updatePart(id: string, patch: UpdatePartInput): Promise<PartDoc> {
  const updated = await Part.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean<PartDoc>();
  if (!updated) throw ApiError.notFound('Part');
  await refreshWarehouseTotals(updated.warehouseId);
  return updated;
}

export async function deletePart(id: string): Promise<void> {
  const removed = await Part.findByIdAndDelete(id).lean<PartDoc>();
  if (!removed) throw ApiError.notFound('Part');

  /**
   * The ledger goes with the part.
   *
   * Movements are keyed by SKU, and a SKU is reusable — delete a part, create
   * another with the same code, and the new one inherits the old one's history.
   * The detail screen would then draw a stock chart running to a balance the
   * part has never held, and each row's `after` would contradict what is on the
   * shelf. Rows that explain a balance nobody holds any more explain nothing.
   */
  await StockMovement.deleteMany({ sku: removed.sku });

  await refreshWarehouseTotals(removed.warehouseId);
}

/**
 * Move stock by hand — a count correction, a receipt, a write-off.
 *
 * Separate from `updatePart` because a stock movement is an event with a
 * reason, not a field edit. Setting `onHand` directly through the part form
 * would let a typo silently become the truth with nothing recording why.
 */
/**
 * Append to the ledger.
 *
 * Called from every path that changes `onHand`, without exception — a movement
 * that skips this leaves the part's quantity unexplained, which is the state
 * this ledger exists to make impossible.
 */
async function recordMovement(input: {
  part: { _id: string; sku: string; warehouseId: string; onHand: number };
  kind: StockMovementKind;
  delta: number;
  reason: string;
  reference?: string;
  actor?: string;
}): Promise<void> {
  await StockMovement.create({
    _id: await nextId('stockMovement', 'SM'),
    sku: input.part.sku,
    partId: input.part._id,
    warehouseId: input.part.warehouseId,
    kind: input.kind,
    delta: input.delta,
    after: input.part.onHand,
    reason: input.reason,
    reference: input.reference ?? '',
    actor: input.actor ?? '',
    at: new Date(),
  });
}

export async function adjustStock(id: string, input: StockAdjustmentInput, actor = ''): Promise<PartDoc> {
  const part = await Part.findById(id);
  if (!part) throw ApiError.notFound('Part');

  const next = part.onHand + input.delta;
  if (next < 0) {
    throw ApiError.badRequest(`Cannot remove ${Math.abs(input.delta)} — only ${part.onHand} on hand`);
  }

  part.onHand = next;
  await part.save();
  await refreshWarehouseTotals(part.warehouseId);
  await recordMovement({ part, kind: 'Adjustment', delta: input.delta, reason: input.reason, actor });

  logger.info('Stock adjusted', { part: part._id, delta: input.delta, onHand: next, reason: input.reason });
  return part.toObject();
}

/** A part's movement history, newest first — what the detail screen reads. */
export async function movementsFor(sku: string, limit = 40): Promise<StockMovementDoc[]> {
  return StockMovement.find({ sku }).sort({ at: -1 }).limit(limit).lean<StockMovementDoc[]>();
}

export interface ConsumptionResult {
  sku: string;
  requested: number;
  consumed: number;
  onHand: number;
  shortfall?: number;
}

/**
 * Draw parts off the shelf for a work order.
 *
 * Short stock does **not** fail the call. A technician who has physically
 * fitted the last two of a part needs the work order to close; refusing it
 * because the system thought there was one left would leave the record wrong in
 * a worse way. The shortfall is reported so the discrepancy surfaces as a count
 * problem, which is what it is.
 */
export async function consumeParts(
  lines: { sku: string; qty: number }[],
  reference: string,
): Promise<ConsumptionResult[]> {
  const results: ConsumptionResult[] = [];
  const touchedWarehouses = new Set<string>();

  for (const line of lines) {
    const part = await Part.findOne({ sku: line.sku });
    if (!part) {
      results.push({ sku: line.sku, requested: line.qty, consumed: 0, onHand: 0, shortfall: line.qty });
      continue;
    }

    const consumed = Math.min(part.onHand, line.qty);
    part.onHand -= consumed;
    await part.save();
    touchedWarehouses.add(part.warehouseId);

    if (consumed > 0) {
      await recordMovement({
        part,
        kind: 'Issue',
        delta: -consumed,
        reason: 'Consumed by work',
        reference,
      });
    }

    results.push({
      sku: line.sku,
      requested: line.qty,
      consumed,
      onHand: part.onHand,
      ...(consumed < line.qty ? { shortfall: line.qty - consumed } : {}),
    });
  }

  for (const wh of touchedWarehouses) await refreshWarehouseTotals(wh);
  logger.info('Parts consumed', { reference, lines: results.length });
  return results;
}

// ── Purchase orders ──────────────────────────────────────────────────────────

export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrderDoc> {
  const supplier = await Supplier.findById(input.supplierId).lean();
  if (!supplier) throw ApiError.badRequest(`Supplier ${input.supplierId} does not exist`);

  const created = await PurchaseOrder.create({
    ...input,
    _id: await nextId('purchaseOrder', 'PO'),
    supplierName: supplier.name,
    expectedAt: new Date(input.expectedAt),
    total: input.lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0),
  });

  return created.toObject();
}

export async function updatePurchaseOrder(id: string, patch: UpdatePurchaseOrderInput): Promise<PurchaseOrderDoc> {
  const po = await PurchaseOrder.findById(id);
  if (!po) throw ApiError.notFound('Purchase order');
  if (po.status === 'Received') throw ApiError.conflict('A received purchase order cannot be edited');

  Object.assign(po, patch, patch.expectedAt ? { expectedAt: new Date(patch.expectedAt) } : {});
  if (patch.lines) po.total = patch.lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0);

  await po.save();
  return po.toObject();
}

/**
 * Receive a purchase order — the other half of the stock loop.
 *
 * Receiving raises stock for every line, so the shelf reflects the delivery
 * without anyone re-typing it. Guarded against double receipt: a PO received
 * twice would silently double the stock, and the count that follows would be
 * blamed on the warehouse rather than on the software.
 */
export async function receivePurchaseOrder(id: string, actor = ''): Promise<{ po: PurchaseOrderDoc; received: ConsumptionResult[] }> {
  const po = await PurchaseOrder.findById(id);
  if (!po) throw ApiError.notFound('Purchase order');
  if (po.status === 'Received') throw ApiError.conflict('This purchase order has already been received');
  if (po.status === 'Cancelled') throw ApiError.conflict('A cancelled purchase order cannot be received');

  const received: ConsumptionResult[] = [];
  const touchedWarehouses = new Set<string>();

  for (const line of po.lines) {
    const part = await Part.findOne({ sku: line.sku });
    if (!part) {
      // A line for something not in the catalogue is reported, not invented —
      // creating a part here would guess a warehouse and a reorder point.
      received.push({ sku: line.sku, requested: line.qty, consumed: 0, onHand: 0, shortfall: line.qty });
      continue;
    }

    part.onHand += line.qty;
    await part.save();
    touchedWarehouses.add(part.warehouseId);
    await recordMovement({
      part,
      kind: 'Receipt',
      delta: line.qty,
      reason: `Received from ${po.supplierName}`,
      reference: id,
      actor,
    });
    received.push({ sku: line.sku, requested: line.qty, consumed: line.qty, onHand: part.onHand });
  }

  po.status = 'Received';
  await po.save();
  for (const wh of touchedWarehouses) await refreshWarehouseTotals(wh);

  logger.info('Purchase order received', { po: id, lines: received.length });
  return { po: po.toObject(), received };
}

/** Parts at or below their reorder point — what procurement acts on. */
export async function reorderList(): Promise<PartDoc[]> {
  const parts = await Part.find().lean<PartDoc[]>();
  return parts.filter((p) => p.onHand <= p.reorderPoint);
}

/**
 * Draft a purchase order per supplier for everything below its reorder point.
 *
 * Drafts, never sent: the quantities are a starting point derived from the
 * reorder gap, and committing money is a decision a person makes. Existing
 * drafts are left alone so running this twice does not produce two of them.
 */
export async function draftReorders(): Promise<{ drafted: number; skipped: number }> {
  const low = await reorderList();
  const bySupplier = new Map<string, PartDoc[]>();
  for (const part of low) {
    if (!part.supplierId) continue;
    bySupplier.set(part.supplierId, [...(bySupplier.get(part.supplierId) ?? []), part]);
  }

  let drafted = 0;
  let skipped = 0;

  for (const [supplierId, parts] of bySupplier) {
    const existing = await PurchaseOrder.findOne({ supplierId, status: 'Draft' }).lean();
    if (existing) {
      skipped++;
      continue;
    }

    const supplier = await Supplier.findById(supplierId).lean();
    if (!supplier) continue;

    const lines = parts.map((p) => ({
      sku: p.sku,
      name: p.name,
      // Back to the reorder point plus a cycle's worth, never less than one.
      qty: Math.max(1, p.reorderPoint * 2 - p.onHand),
      unitCost: p.unitCost,
    }));

    await PurchaseOrder.create({
      _id: await nextId('purchaseOrder', 'PO'),
      supplierId,
      supplierName: supplier.name,
      status: 'Draft',
      expectedAt: new Date(Date.now() + (supplier.leadTimeDays ?? 7) * 86_400_000),
      total: lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0),
      lines,
      createdAt: new Date(),
    });
    drafted++;
  }

  return { drafted, skipped };
}
