import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  ActivityEvent,
  AIInsight,
  Alert,
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
  alerts: Alert[];
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

export const ASSET_PROFILE_KEY = ['asset-profile'] as const;

/**
 * One asset's own history, read from `GET /assets/:id/profile`.
 *
 * Asset 360 used to filter the org-wide `/dataset` slices instead. Those are
 * capped across the whole estate — activity and lifecycle at 200 rows, alerts
 * at 300 — so on any real estate the Timeline, History, Audit and custody tabs
 * of an asset that had not changed lately were simply empty. The profile is
 * queried per asset and uncapped in that sense.
 *
 * Every write refreshes every query (api/dataset.ts `refreshAfterWrite`), so a
 * custody change or a stage change made on this page re-reads it too.
 */
export function useAssetProfile(id: string): UseQueryResult<AssetProfile> {
  return useQuery({
    queryKey: [...ASSET_PROFILE_KEY, id],
    queryFn: () => assetsApi.profile(id),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}
