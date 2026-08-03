import type { AIInsight } from '@access-genie/shared';
import { apiGet, apiList, apiPost } from '@/api/client';

export interface InsightFilters {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  type?: string;
  severity?: string;
  status?: string;
  assetId?: string;
}

export interface InsightStats {
  open: number;
  critical: number;
  opportunities: number;
  impactInr: number;
  avgConfidence: number;
  byType: { type: string; count: number }[];
}

export const insightsApi = {
  list: (filters: InsightFilters = {}) => apiList<AIInsight>('/insights', filters as Record<string, unknown>),
  stats: () => apiGet<InsightStats>('/insights/stats'),
  get: (id: string) => apiGet<AIInsight>(`/insights/${id}`),
  action: (id: string) => apiPost<AIInsight>(`/insights/${id}/action`),
  dismiss: (id: string) => apiPost<AIInsight>(`/insights/${id}/dismiss`),
};
