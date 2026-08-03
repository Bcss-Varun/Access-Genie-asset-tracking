import type {
  AlertRule,
  AuditRecord,
  CustodyAction,
  CustodyRecord,
  Notification,
  Part,
  Warehouse,
} from '@access-genie/shared';
import { apiDelete, apiGet, apiList, apiPatch, apiPost } from '@/api/client';

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

/**
 * A custody move is one call, not two: the server appends the chain entry,
 * reassigns the asset and writes the timeline row together, so the log and the
 * asset's profile can never disagree about who is holding it.
 */
export const custodyApi = {
  record: (body: { assetId: string; holder: string; action: CustodyAction; note?: string }) =>
    apiPost<CustodyRecord>('/custody', body),
};

export const alertRulesApi = {
  list: () => apiGet<AlertRule[]>('/alert-rules'),
  create: (body: { name: string; condition: string; severity: string; channels?: string[]; enabled?: boolean }) =>
    apiPost<AlertRule>('/alert-rules', body),
  update: (id: string, body: Record<string, unknown>) => apiPatch<AlertRule>(`/alert-rules/${id}`, body),
  toggle: (id: string, enabled: boolean) => apiPost<AlertRule>(`/alert-rules/${id}/toggle`, { enabled }),
  remove: (id: string) => apiDelete(`/alert-rules/${id}`),
};
