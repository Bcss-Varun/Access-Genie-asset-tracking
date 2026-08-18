import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  AssetCategory,
  MaintenanceDashboard,
  MaintenanceKind,
  MaintenancePeriod,
  MaintenanceStatus,
  WorkOrderPriority,
} from '@access-genie/shared';
import { apiGet } from '@/api/client';

/**
 * The Maintenance Dashboard's single read.
 *
 * One request answers the whole screen — KPIs, trend, facility table, type
 * mix, attention lists and the activity feed — because every one of those is a
 * different cut of the same three collections and splitting them into six
 * endpoints would let the sections disagree with each other mid-refresh.
 *
 * There is no client-side aggregation anywhere downstream of this hook. If a
 * number is on the screen it came out of MongoDB; if the estate has no records
 * the number is 0 and the section renders its empty state.
 */

export const MAINTENANCE_DASHBOARD_KEY = ['maintenance-dashboard'] as const;

export interface MaintenanceDashboardFilters {
  period: MaintenancePeriod;
  /** Only read when `period` is `custom`; both are required then. */
  from?: string;
  to?: string;
  organization?: string;
  facility?: string;
  location?: string;
  types: MaintenanceKind[];
  priorities: WorkOrderPriority[];
  statuses: MaintenanceStatus[];
  categories: AssetCategory[];
  assetId?: string;
  overdue?: boolean;
}

export const EMPTY_MAINTENANCE_FILTERS: MaintenanceDashboardFilters = {
  period: '30d',
  types: [],
  priorities: [],
  statuses: [],
  categories: [],
};

/** How many filters are narrowing the view — drives the "Clear" affordance. */
export function activeFilterCount(filters: MaintenanceDashboardFilters): number {
  return (
    (filters.organization ? 1 : 0) +
    (filters.facility ? 1 : 0) +
    (filters.location ? 1 : 0) +
    (filters.assetId ? 1 : 0) +
    (filters.overdue ? 1 : 0) +
    (filters.types.length > 0 ? 1 : 0) +
    (filters.priorities.length > 0 ? 1 : 0) +
    (filters.statuses.length > 0 ? 1 : 0) +
    (filters.categories.length > 0 ? 1 : 0)
  );
}

function toQuery(filters: MaintenanceDashboardFilters): URLSearchParams {
  /*
   * A half-filled custom range falls back to the default preset.
   *
   * `period=custom` with no dates is a 400 from the server — correctly, since
   * there is no range to aggregate over. But that is the state the screen is in
   * for as long as it takes somebody to open the date picker, and erroring the
   * whole dashboard while they reach for the second field is the wrong answer
   * to "I am still typing". The picker says which dates are missing; the
   * figures keep showing the last complete range until both arrive.
   */
  const custom = filters.period === 'custom' && Boolean(filters.from) && Boolean(filters.to);
  const query = new URLSearchParams({ period: filters.period === 'custom' && !custom ? '30d' : filters.period });

  if (custom) {
    query.set('from', filters.from as string);
    query.set('to', filters.to as string);
  }

  if (filters.organization) query.set('organization', filters.organization);
  if (filters.facility) query.set('facility', filters.facility);
  if (filters.location) query.set('location', filters.location);
  if (filters.assetId) query.set('assetId', filters.assetId);
  if (filters.overdue) query.set('overdue', 'true');
  if (filters.types.length > 0) query.set('type', filters.types.join(','));
  if (filters.priorities.length > 0) query.set('priority', filters.priorities.join(','));
  if (filters.statuses.length > 0) query.set('status', filters.statuses.join(','));
  if (filters.categories.length > 0) query.set('category', filters.categories.join(','));

  return query;
}

export const maintenanceDashboardApi = {
  read: (filters: MaintenanceDashboardFilters) =>
    apiGet<MaintenanceDashboard>(`/maintenance-dashboard?${toQuery(filters)}`),
};

export function useMaintenanceDashboard(filters: MaintenanceDashboardFilters): UseQueryResult<MaintenanceDashboard> {
  const query = toQuery(filters);

  return useQuery({
    // The serialised query *is* the identity of this view, so no filter can
    // change without the cache key changing with it — which is what stops the
    // previous cut's numbers sitting under the new cut's heading.
    queryKey: [...MAINTENANCE_DASHBOARD_KEY, query.toString()],
    queryFn: () => maintenanceDashboardApi.read(filters),
    // A minute of staleness is fine on a management view; the header shows how
    // old the figures are and offers a manual refresh. Keeping the previous
    // payload while the next one lands is what makes changing a filter feel
    // like a filter rather than a page load.
    staleTime: 60_000,
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });
}
