import { useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { AssetCategory, DashboardPeriod, DashboardSummary, ScopeNode } from '@access-genie/shared';
import { apiGet } from '@/api/client';
import { getActiveScope } from '@/api/dataset';
import { useScope } from '@/components/providers/ScopeProvider';

/**
 * The dashboard's own read.
 *
 * Separate from `/dataset` on purpose. The dataset is a reference payload —
 * capped lists of rows, fetched once and hydrated into module bindings — and it
 * is the wrong shape for headline figures: a count taken from a capped slice is
 * wrong the moment the estate outgrows the cap, and nothing in it can answer
 * "compared with last month". This endpoint aggregates in MongoDB and answers
 * both, for one scope, one period and one cut of the estate.
 *
 * Every filter is in the query key, so changing any of them refetches rather
 * than showing the previous cut's numbers under the new cut's heading.
 */
export const DASHBOARD_KEY = ['dashboard'] as const;

export interface DashboardFilters {
  period: DashboardPeriod;
  /** A custom range. Both must be set to take effect; then they win over `period`. */
  from?: string;
  to?: string;
  department?: string;
  category?: AssetCategory;
}

export const dashboardApi = {
  summary: (filters: DashboardFilters, scopeId: string | null) => {
    const query = new URLSearchParams({ period: filters.period });
    if (scopeId) query.set('scope', scopeId);
    if (filters.from && filters.to) {
      query.set('from', filters.from);
      query.set('to', filters.to);
    }
    if (filters.department) query.set('department', filters.department);
    if (filters.category) query.set('category', filters.category);
    return apiGet<DashboardSummary>(`/dashboard/summary?${query}`);
  },
  scopeTree: () => apiGet<ScopeNode | null>('/scope/tree'),
};

/**
 * The cache key for one cut of the dashboard.
 *
 * Shared by the hook and the prefetch below rather than written out twice: a
 * prefetch whose key differs from the hook's by one element is a request that
 * costs a round trip and warms nothing.
 */
export function dashboardQueryKey(filters: DashboardFilters, scopeId: string | null) {
  return [
    ...DASHBOARD_KEY,
    scopeId,
    filters.period,
    filters.from ?? null,
    filters.to ?? null,
    filters.department ?? null,
    filters.category ?? null,
  ] as const;
}

/** The cut the dashboard opens on, before anybody has touched a filter. */
export const DEFAULT_DASHBOARD_FILTERS: DashboardFilters = { period: '30d' };

/**
 * Start the dashboard's own read *alongside* the reference dataset.
 *
 * Without this the two are strictly sequential, and not because either depends
 * on the other: `RequireDataset` holds the route subtree until `/dataset`
 * resolves, so `<DashboardPage>` — and therefore its `useQuery` — does not exist
 * to fire until then. On a cold connection that put a ~3s aggregation *after* a
 * ~4s payload for no reason at all.
 *
 * Fired from the gate with the scope read from storage, which is the same value
 * `<ScopeProvider>` seeds itself from, so the key this warms is the key the hook
 * then asks for.
 */
export function prefetchDashboardSummary(client: QueryClient): void {
  const scopeId = getActiveScope();
  void client.prefetchQuery({
    queryKey: dashboardQueryKey(DEFAULT_DASHBOARD_FILTERS, scopeId),
    queryFn: () => dashboardApi.summary(DEFAULT_DASHBOARD_FILTERS, scopeId),
    staleTime: 60_000,
  });
}

export function useDashboardSummary(filters: DashboardFilters): UseQueryResult<DashboardSummary> {
  // Read from the provider rather than the module binding in `api/dataset`, so
  // a scope change re-renders this hook and changes the key. "Everything" is
  // the absence of a filter, which is why the root resolves to null instead of
  // sending the group's own id.
  const { scopeId, tree } = useScope();
  const effectiveScope = scopeId === tree.id ? null : scopeId;

  return useQuery({
    queryKey: dashboardQueryKey(filters, effectiveScope),
    queryFn: () => dashboardApi.summary(filters, effectiveScope),
    // A dashboard that is a minute stale is fine; one that refetches on every
    // window focus is a flicker. The header shows how old the figures are and
    // offers a manual refresh, which is the honest interim until the estate
    // actually streams (there is no WebSocket in the build yet).
    staleTime: 60_000,
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });
}
