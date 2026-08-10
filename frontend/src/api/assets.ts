import type {
  ActivityEvent,
  AIInsight,
  Asset,
  AssetCategory,
  AssetStatus,
  CustodyRecord,
  LifecycleTransition,
  WorkOrder,
} from '@access-genie/shared';
import { apiDelete, apiGet, apiList, apiPatch, apiPost } from '@/api/client';

export interface AssetFilters {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  status?: string;
  category?: string;
  health?: string;
  criticality?: string;
  trackingTech?: string;
}

export interface AssetStats {
  total: number;
  portfolioValue: number;
  avgHealth: number;
  avgUtilization: number;
  byStatus: { status: AssetStatus; count: number }[];
  byCategory: { category: AssetCategory; count: number; value: number }[];
}

/** The asset-360 payload: the record plus every timeline attached to it. */
export interface AssetProfile {
  asset: Asset;
  workOrders: WorkOrder[];
  activity: ActivityEvent[];
  insights: AIInsight[];
  custody: CustodyRecord[];
  lifecycleHistory: LifecycleTransition[];
}

export const assetsApi = {
  list: (filters: AssetFilters = {}) => apiList<Asset>('/assets', filters as Record<string, unknown>),
  stats: () => apiGet<AssetStats>('/assets/stats'),
  get: (id: string) => apiGet<Asset>(`/assets/${id}`),
  profile: (id: string) => apiGet<AssetProfile>(`/assets/${id}/profile`),
  create: (input: Record<string, unknown>) => apiPost<Asset>('/assets', input),
  update: (id: string, input: Record<string, unknown>) => apiPatch<Asset>(`/assets/${id}`, input),

  /**
   * Apply one change to a selection.
   *
   * Reports partial success rather than failing the batch: one deleted asset
   * should not undo the other thirty-nine.
   */
  bulkUpdate: (ids: string[], patch: Record<string, unknown>) =>
    apiPost<{ updated: string[]; failed: { id: string; reason: string }[] }>('/assets/bulk', { ids, patch }),
  remove: (id: string) => apiDelete(`/assets/${id}`),
};
