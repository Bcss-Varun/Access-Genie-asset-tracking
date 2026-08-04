import type { AbcClass, Part, PoStatus, PurchaseOrder, Supplier, Warehouse } from '@access-genie/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';

/**
 * Inventory and procurement writes.
 *
 * Stock is money, so two rules live on the server and are not duplicated here:
 * `onHand` can only move through an adjustment that records *why*, and
 * receiving a purchase order is the only thing that raises stock from a
 * delivery. Both come back as the updated record.
 */

export const warehousesApi = {
  create: (body: { name: string; location: string }) => apiPost<Warehouse>('/inventory/warehouses', body),
  update: (id: string, body: Partial<{ name: string; location: string }>) =>
    apiPatch<Warehouse>(`/inventory/warehouses/${id}`, body),
  remove: (id: string) => apiDelete(`/inventory/warehouses/${id}`),
};

export const suppliersApi = {
  create: (body: {
    name: string;
    category: string;
    contact: string;
    leadTimeDays?: number;
    rating?: number;
    onTimePct?: number;
  }) => apiPost<Supplier>('/inventory/suppliers', body),

  update: (id: string, body: Record<string, unknown>) => apiPatch<Supplier>(`/inventory/suppliers/${id}`, body),
  remove: (id: string) => apiDelete(`/inventory/suppliers/${id}`),
};

export const partsApi = {
  create: (body: {
    sku: string;
    name: string;
    category: string;
    onHand?: number;
    reorderPoint?: number;
    unitCost: number;
    warehouseId: string;
    bin?: string;
    abcClass?: AbcClass;
    supplierId?: string;
    leadTimeDays?: number;
  }) => apiPost<Part>('/inventory/parts', body),

  /** `sku` and `onHand` are deliberately absent — see `adjust`. */
  update: (id: string, body: Record<string, unknown>) => apiPatch<Part>(`/inventory/parts/${id}`, body),
  remove: (id: string) => apiDelete(`/inventory/parts/${id}`),

  /**
   * The only way stock moves by hand.
   *
   * A reason is required because an unexplained stock change is indistinguishable
   * from a mistake when someone comes back to it in three months.
   */
  adjust: (id: string, delta: number, reason: string) =>
    apiPost<Part>(`/inventory/parts/${id}/adjust`, { delta, reason }),
};

export const procurementApi = {
  /** Every part at or below its reorder point. */
  reorderList: () => apiGet<Part[]>('/inventory/reorder'),

  /**
   * Draft one purchase order per supplier for everything below its reorder
   * point. Existing drafts are skipped, so running it twice does not produce
   * two orders for the same supplier — the response says how many were skipped.
   */
  draftReorders: () => apiPost<{ drafted: number; skipped: number }>('/inventory/reorder/draft'),

  create: (body: {
    supplierId: string;
    expectedAt: string;
    status?: PoStatus;
    lines: { sku: string; name: string; qty: number; unitCost: number }[];
  }) => apiPost<PurchaseOrder>('/inventory/purchase-orders', body),

  update: (id: string, body: Record<string, unknown>) => apiPatch<PurchaseOrder>(`/inventory/purchase-orders/${id}`, body),

  /**
   * Receive a delivery: raises stock for every line and closes the order.
   *
   * Idempotent — receiving twice does not double the shelf, because the server
   * refuses an order that is already `Received`.
   */
  receive: (id: string) => apiPost<PurchaseOrder>(`/inventory/purchase-orders/${id}/receive`),
};
