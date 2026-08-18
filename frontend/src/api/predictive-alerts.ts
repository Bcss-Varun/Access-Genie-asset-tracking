import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  PredictiveAlert,
  PredictiveAlertDetail,
  PredictiveAlertFacets,
  PredictiveAlertSource,
  PredictiveAlertStats,
  PredictiveAlertStatus,
  PredictiveAlertType,
  PredictiveSeverity,
  WorkOrderPriority,
} from '@access-genie/shared';
import { apiDelete, apiGet, apiList, apiPost } from '@/api/client';

/**
 * Predictive Alerts — the live read.
 *
 * Every number this module shows comes from `/predictive-alerts`. There is no
 * local tally and no fallback list: an empty board means the database holds no
 * alerts, which is the truth until a predictive engine starts writing them.
 *
 * The list, the summary cards and the cache key are all built from one
 * serialiser, so the cards cannot describe a different cut from the table under
 * them — the failure mode that makes a dashboard stop being read.
 */

export const PREDICTIVE_KEY = ['predictive-alerts'] as const;

// ── Filters ──────────────────────────────────────────────────────────────────

export interface PredictiveFilters {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  severity?: PredictiveSeverity[];
  type?: PredictiveAlertType[];
  status?: PredictiveAlertStatus[];
  source?: PredictiveAlertSource[];
  assetId?: string;
  /** Scope-node id — matches every asset beneath it. */
  facility?: string;
  from?: string;
  to?: string;
  minConfidence?: number;
  /** Open and Acknowledged only, whatever else is set. */
  open?: boolean;
}

export const EMPTY_PREDICTIVE_FILTERS: PredictiveFilters = {};

export function activePredictiveFilterCount(filters: PredictiveFilters): number {
  return (
    (filters.q ? 1 : 0) +
    (filters.severity?.length ? 1 : 0) +
    (filters.type?.length ? 1 : 0) +
    (filters.status?.length ? 1 : 0) +
    (filters.source?.length ? 1 : 0) +
    (filters.assetId ? 1 : 0) +
    (filters.facility ? 1 : 0) +
    (filters.from || filters.to ? 1 : 0) +
    (filters.minConfidence !== undefined ? 1 : 0) +
    (filters.open ? 1 : 0)
  );
}

/** One serialiser for the list, the stats and the cache key, so they cannot disagree. */
function toQuery(filters: PredictiveFilters): URLSearchParams {
  const query = new URLSearchParams();
  const csv = (key: string, values?: string[]) => {
    if (values && values.length > 0) query.set(key, values.join(','));
  };

  csv('severity', filters.severity);
  csv('type', filters.type);
  csv('status', filters.status);
  csv('source', filters.source);

  if (filters.q?.trim()) query.set('q', filters.q.trim());
  if (filters.assetId) query.set('assetId', filters.assetId);
  if (filters.facility) query.set('facility', filters.facility);
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  if (filters.minConfidence !== undefined) query.set('minConfidence', String(filters.minConfidence));
  if (filters.open) query.set('open', 'true');
  if (filters.sort) query.set('sort', filters.sort);
  if (filters.page) query.set('page', String(filters.page));
  if (filters.limit) query.set('limit', String(filters.limit));

  return query;
}

// ── Write bodies ─────────────────────────────────────────────────────────────

export interface SignalInput {
  label: string;
  value: string;
  baseline?: string;
  detail?: string;
  weight?: number;
}

/**
 * The ingestion body.
 *
 * Identical for a person raising an alert and for a predictive engine posting
 * one — `source` and `detector` are what tell them apart, and the API refuses
 * the combinations that would misattribute either.
 */
export interface RaiseAlertBody {
  title: string;
  severity: PredictiveSeverity;
  type: PredictiveAlertType;
  assetId: string;
  confidence: number;
  detectedAt?: string;
  predictedFailureAt?: string;
  reason: string;
  signals: SignalInput[];
  recommendation: {
    action: string;
    priority: WorkOrderPriority;
    dueInDays: number;
    estimatedHours: number;
    requiredSkill?: string;
  };
  source?: PredictiveAlertSource;
  detector?: { name: string; version?: string; modelId?: string };
}

export interface RaiseWorkOrderBody {
  title?: string;
  priority?: WorkOrderPriority;
  assignedTo?: string;
  dueInDays?: number;
  estimatedHours?: number;
  scheduledDate?: string;
  notes?: string;
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export const predictiveAlertsApi = {
  list: (filters: PredictiveFilters = {}) => apiList<PredictiveAlert>(`/predictive-alerts?${toQuery(filters)}`),
  stats: (filters: PredictiveFilters = {}) => apiGet<PredictiveAlertStats>(`/predictive-alerts/stats?${toQuery(filters)}`),
  facets: () => apiGet<PredictiveAlertFacets>('/predictive-alerts/facets'),
  get: (id: string) => apiGet<PredictiveAlert>(`/predictive-alerts/${id}`),
  /** Alert + asset + linked work orders + the asset's other alerts, in one call. */
  detail: (id: string) => apiGet<PredictiveAlertDetail>(`/predictive-alerts/${id}/detail`),

  raise: (body: RaiseAlertBody) => apiPost<PredictiveAlert>('/predictive-alerts', body),

  acknowledge: (id: string, note?: string) => apiPost<PredictiveAlert>(`/predictive-alerts/${id}/acknowledge`, { note }),
  dismiss: (id: string, reason: string) => apiPost<PredictiveAlert>(`/predictive-alerts/${id}/dismiss`, { reason }),
  reopen: (id: string, note?: string) => apiPost<PredictiveAlert>(`/predictive-alerts/${id}/reopen`, { note }),
  resolve: (id: string, note?: string) => apiPost<PredictiveAlert>(`/predictive-alerts/${id}/resolve`, { note }),

  /**
   * Raises a real work order through the work-order service.
   *
   * `reused: true` means an open order already existed and was returned instead
   * of a second one being created — the screen says so rather than claiming a
   * creation that did not happen.
   */
  raiseWorkOrder: (id: string, body: RaiseWorkOrderBody = {}) =>
    apiPost<{ alert: PredictiveAlert; workOrderId: string; reused: boolean }>(`/predictive-alerts/${id}/work-order`, body),

  remove: (id: string) => apiDelete(`/predictive-alerts/${id}`),
};

// ── Hooks ────────────────────────────────────────────────────────────────────

export function usePredictiveAlerts(filters: PredictiveFilters) {
  const query = toQuery(filters).toString();
  return useQuery({
    // The serialised query *is* the identity of the view, so no filter can
    // change without the cache key changing with it.
    queryKey: [...PREDICTIVE_KEY, 'list', query],
    queryFn: () => predictiveAlertsApi.list(filters),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function usePredictiveStats(filters: PredictiveFilters): UseQueryResult<PredictiveAlertStats> {
  const query = toQuery(filters).toString();
  return useQuery({
    queryKey: [...PREDICTIVE_KEY, 'stats', query],
    queryFn: () => predictiveAlertsApi.stats(filters),
    placeholderData: (previous) => previous,
  });
}

export function usePredictiveFacets(): UseQueryResult<PredictiveAlertFacets> {
  return useQuery({
    queryKey: [...PREDICTIVE_KEY, 'facets'],
    queryFn: () => predictiveAlertsApi.facets(),
    // Options move only when alerts do; refetching them per keystroke would be
    // a request for a list that has not changed.
    staleTime: 120_000,
  });
}

export function usePredictiveAlertDetail(id: string | undefined): UseQueryResult<PredictiveAlertDetail> {
  return useQuery({
    queryKey: [...PREDICTIVE_KEY, 'detail', id],
    queryFn: () => predictiveAlertsApi.detail(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Re-read every predictive query after a write.
 *
 * One call, because a single action moves several numbers at once: raising a
 * work order changes the alert's status, the Open card, the Assets at Risk card,
 * the Work Orders Created card and the facet counts. A screen that refreshes
 * four of those five is the one people stop trusting.
 */
export function useRefreshPredictiveAlerts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: PREDICTIVE_KEY });
}
