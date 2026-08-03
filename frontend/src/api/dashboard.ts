import type { DashboardSummary, ScopeNode } from '@access-genie/shared';
import { apiGet } from '@/api/client';

export const dashboardApi = {
  summary: () => apiGet<DashboardSummary>('/dashboard/summary'),
  scopeTree: () => apiGet<ScopeNode | null>('/scope/tree'),
};
