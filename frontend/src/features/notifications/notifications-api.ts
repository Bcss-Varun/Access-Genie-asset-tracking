import type { AuditRecord, CustodyRecord, Notification, Part, Warehouse } from '@access-genie/shared';
import { apiGet, apiList, apiPost } from '@/lib/api-client';

export const notificationsApi = {
  list: () => apiGet<Notification[]>('/notifications'),
  markRead: (id: string) => apiPost<Notification>(`/notifications/${id}/read`),
  markAllRead: () => apiPost<{ updated: number }>('/notifications/read-all'),
};

export const complianceApi = {
  audit: (params: { page?: number; limit?: number; category?: string } = {}) =>
    apiList<AuditRecord>('/audit', params as Record<string, unknown>),
  custody: (params: { page?: number; limit?: number; assetId?: string } = {}) =>
    apiList<CustodyRecord>('/custody', params as Record<string, unknown>),
};

export const inventoryApi = {
  parts: (params: { page?: number; limit?: number; q?: string; reorder?: string } = {}) =>
    apiList<Part>('/inventory/parts', params as Record<string, unknown>),
  warehouses: () => apiGet<Warehouse[]>('/inventory/warehouses'),
};
