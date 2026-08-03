import type { WorkOrder, WorkOrderPriority, WorkOrderStatus } from '@access-genie/shared';
import { apiDelete, apiGet, apiList, apiPatch, apiPost } from '@/api/client';

export interface WorkOrderFilters {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  status?: string;
  priority?: string;
  type?: string;
  assetId?: string;
  assignedTo?: string;
  overdue?: boolean;
}

export interface WorkOrderStats {
  open: number;
  overdue: number;
  aiGenerated: number;
  completed: number;
  estimatedHoursOpen: number;
  byStatus: { status: WorkOrderStatus; count: number }[];
  byPriority: { priority: WorkOrderPriority; count: number }[];
}

export const maintenanceApi = {
  list: (filters: WorkOrderFilters = {}) => apiList<WorkOrder>('/work-orders', filters as Record<string, unknown>),
  stats: () => apiGet<WorkOrderStats>('/work-orders/stats'),
  get: (id: string) => apiGet<WorkOrder>(`/work-orders/${id}`),
  create: (input: Record<string, unknown>) => apiPost<WorkOrder>('/work-orders', input),
  update: (id: string, input: Record<string, unknown>) => apiPatch<WorkOrder>(`/work-orders/${id}`, input),
  remove: (id: string) => apiDelete(`/work-orders/${id}`),

  // Actions the server audits individually, rather than as a field edit.
  changeStatus: (id: string, status: WorkOrderStatus, note?: string) =>
    apiPost<WorkOrder>(`/work-orders/${id}/status`, { status, note }),
  comment: (id: string, text: string) => apiPost<WorkOrder>(`/work-orders/${id}/comments`, { text }),
  logLabor: (id: string, hours: number, note: string) => apiPost<WorkOrder>(`/work-orders/${id}/labor`, { hours, note }),
  toggleChecklist: (id: string, index: number, done: boolean) =>
    apiPost<WorkOrder>(`/work-orders/${id}/checklist`, { index, done }),
};
