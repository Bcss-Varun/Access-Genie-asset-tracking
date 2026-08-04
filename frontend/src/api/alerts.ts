import type { Alert, AlertRule, AlertStatus } from '@access-genie/shared';
import { apiGet, apiList, apiPost } from '@/api/client';

export interface AlertFilters {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  status?: string;
  severity?: string;
  assetId?: string;
}

export interface AlertStats {
  open: number;
  critical: number;
  warning: number;
  info: number;
  byStatus: { status: AlertStatus; count: number }[];
}

export const alertsApi = {
  list: (filters: AlertFilters = {}) => apiList<Alert>('/alerts', filters as Record<string, unknown>),
  stats: () => apiGet<AlertStats>('/alerts/stats'),
  get: (id: string) => apiGet<Alert>(`/alerts/${id}`),

  /** Raise one by hand — a person seeing something the detectors have not. */
  create: (body: {
    title: string;
    severity: 'Critical' | 'Warning' | 'Info';
    type: string;
    source: string;
    assetId?: string;
    assetName?: string;
  }) => apiPost<Alert>('/alerts', body),

  acknowledge: (id: string, note?: string) => apiPost<Alert>(`/alerts/${id}/acknowledge`, { note }),
  escalate: (id: string, note?: string) => apiPost<Alert>(`/alerts/${id}/escalate`, { note }),
  resolve: (id: string, note?: string) => apiPost<Alert>(`/alerts/${id}/resolve`, { note }),
  acknowledgeMany: (ids: string[]) => apiPost<{ acknowledged: number }>('/alerts/bulk/acknowledge', { ids }),

  /** Gives it an owner, and acknowledges it on the way through if it was still open. */
  assign: (id: string, assignee: string) => apiPost<Alert>(`/alerts/${id}/assign`, { assignee }),

  rules: () => apiGet<AlertRule[]>('/alert-rules'),
  toggleRule: (id: string, enabled: boolean) => apiPost<AlertRule>(`/alert-rules/${id}/toggle`, { enabled }),
};
