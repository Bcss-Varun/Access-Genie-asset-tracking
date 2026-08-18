import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  AnalyticsDashboard,
  AnalyticsPeriod,
  ReportDefinition,
  ReportExportFormat,
  ReportResult,
  ReportSourceDef,
  SavedReport,
  ScheduleFrequency,
  ScheduledReport,
} from '@access-genie/shared';
import { apiDelete, apiGet, apiPatch, apiPost, http } from '@/api/client';
import { filenameFromDisposition, saveBlob } from '@/api/download';

/**
 * Analytics & Reporting — the client half.
 *
 * Every number this module draws arrives through one of the calls below. There
 * is no aggregation anywhere downstream of them: the screens hold filter state
 * and render what the server returned. That is what makes the facility filter a
 * real filter rather than a client-side slice of a payload that was already
 * whole — change it and a new request goes out.
 *
 * The dashboard is one request rather than eight because its sections are
 * different cuts of the same collections; splitting them would let the KPI
 * strip and the charts under it disagree mid-refresh.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export const ANALYTICS_KEY = ['analytics'] as const;

export interface AnalyticsFilters {
  period: AnalyticsPeriod;
  /** Read only when `period` is `custom`; both are required then. */
  from?: string;
  to?: string;
  /** A scope-node id — the org root, a region, a facility, a building. */
  facility?: string;
  categories: string[];
  statuses: string[];
}

export const EMPTY_ANALYTICS_FILTERS: AnalyticsFilters = {
  period: '12m',
  categories: [],
  statuses: [],
};

/** How many filters are narrowing the view — drives the "Clear" affordance. */
export function activeAnalyticsFilterCount(filters: AnalyticsFilters): number {
  return (
    (filters.facility ? 1 : 0) +
    (filters.categories.length > 0 ? 1 : 0) +
    (filters.statuses.length > 0 ? 1 : 0) +
    (filters.period === EMPTY_ANALYTICS_FILTERS.period ? 0 : 1)
  );
}

function toQuery(filters: AnalyticsFilters): URLSearchParams {
  /*
   * A half-filled custom range falls back to the default preset.
   *
   * `period=custom` without both dates is a 422 from the server — correctly,
   * since there is no range to aggregate over. But that is the state the screen
   * is in for as long as it takes somebody to reach the second date field, and
   * blanking the whole dashboard while they do is the wrong answer to "I am
   * still typing".
   */
  const custom = filters.period === 'custom' && Boolean(filters.from) && Boolean(filters.to);
  const query = new URLSearchParams({ period: filters.period === 'custom' && !custom ? '12m' : filters.period });

  if (custom) {
    query.set('from', filters.from as string);
    query.set('to', filters.to as string);
  }
  if (filters.facility) query.set('facility', filters.facility);
  if (filters.categories.length > 0) query.set('category', filters.categories.join(','));
  if (filters.statuses.length > 0) query.set('status', filters.statuses.join(','));

  return query;
}

export function useAnalyticsDashboard(filters: AnalyticsFilters): UseQueryResult<AnalyticsDashboard> {
  const query = toQuery(filters);

  return useQuery({
    // The serialised query *is* this view's identity, so no filter can change
    // without the cache key changing with it — which is what stops the previous
    // cut's numbers sitting under the new cut's heading.
    queryKey: [...ANALYTICS_KEY, 'dashboard', query.toString()],
    queryFn: () => apiGet<AnalyticsDashboard>(`/analytics/dashboard?${query}`),
    staleTime: 60_000,
    // Keeping the previous payload while the next lands is what makes changing
    // a filter feel like a filter rather than a page load.
    placeholderData: (previous) => previous,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The field catalogue.
 *
 * Fetched rather than imported from `@access-genie/shared` so the builder can
 * only ever offer fields *this* server can execute. A client that shipped ahead
 * of the API would otherwise advertise a dimension every preview then 400s on.
 */
export function useReportCatalogue(): UseQueryResult<ReportSourceDef[]> {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, 'catalogue'],
    queryFn: () => apiGet<ReportSourceDef[]>('/analytics/catalogue'),
    staleTime: Infinity, // it changes when the server is redeployed, not before
  });
}

/**
 * The live preview.
 *
 * `enabled` lets the builder hold the request while a definition is
 * incomplete — a report with no measure is not a question yet, and firing it
 * would only produce an error toast per keystroke.
 */
export function useReportPreview(
  definition: ReportDefinition | null,
  facility: string | undefined,
  enabled = true,
): UseQueryResult<ReportResult> {
  return useQuery({
    queryKey: [...ANALYTICS_KEY, 'preview', JSON.stringify(definition), facility ?? ''],
    queryFn: () => apiPost<ReportResult>('/analytics/preview', { definition, facility }),
    enabled: enabled && definition !== null && definition.measures.length > 0,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
    // A rejected definition is a fact about the definition, not a flaky
    // network — retrying it three times only delays the message.
    retry: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────────────────────────────────────

export const REPORTS_KEY = [...ANALYTICS_KEY, 'reports'] as const;

export function useReports(): UseQueryResult<SavedReport[]> {
  return useQuery({
    queryKey: REPORTS_KEY,
    queryFn: () => apiGet<SavedReport[]>('/analytics/reports'),
    staleTime: 30_000,
  });
}

export function useReport(id: string | undefined): UseQueryResult<SavedReport> {
  return useQuery({
    queryKey: [...REPORTS_KEY, id],
    queryFn: () => apiGet<SavedReport>(`/analytics/reports/${id}`),
    enabled: Boolean(id),
  });
}

export interface ReportPayload {
  name: string;
  description?: string;
  category?: string;
  persona?: string;
  definition: ReportDefinition;
}

export const reportsApi = {
  create: (body: ReportPayload) => apiPost<SavedReport>('/analytics/reports', body),
  update: (id: string, body: Partial<ReportPayload>) => apiPatch<SavedReport>(`/analytics/reports/${id}`, body),
  duplicate: (id: string) => apiPost<SavedReport>(`/analytics/reports/${id}/duplicate`, {}),
  remove: (id: string) => apiDelete<{ id: string; schedulesRemoved: number }>(`/analytics/reports/${id}`),
  run: (id: string, facility?: string) =>
    apiPost<{ report: SavedReport; result: ReportResult }>(`/analytics/reports/${id}/run`, { facility }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ask the server for a file and hand it to the browser.
 *
 * Done as a blob rather than by pointing the browser at the URL, because the
 * export endpoints need the bearer token only the axios client carries — a
 * plain `<a href>` would arrive unauthenticated. And the file is built server
 * side rather than from what is on screen, so it contains every row of the
 * report rather than the page the table happened to be showing.
 */
export const exportApi = {
  saved: async (id: string, format: ReportExportFormat, facility?: string): Promise<void> => {
    const res = await http.get(`/analytics/reports/${id}/export`, {
      params: { format, ...(facility ? { facility } : {}) },
      responseType: 'blob',
    });
    saveBlob(res.data as Blob, filenameFromDisposition(res.headers['content-disposition'], `${id}.${format}`));
  },

  /** The builder's export — the same engine, before anything has been saved. */
  preview: async (
    definition: ReportDefinition,
    format: ReportExportFormat,
    title: string,
    facility?: string,
  ): Promise<void> => {
    const res = await http.post(
      '/analytics/preview/export',
      { definition, format, title, facility },
      { responseType: 'blob' },
    );
    saveBlob(res.data as Blob, filenameFromDisposition(res.headers['content-disposition'], `report.${format}`));
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Schedules
// ─────────────────────────────────────────────────────────────────────────────

export const SCHEDULES_KEY = [...ANALYTICS_KEY, 'schedules'] as const;

export function useSchedules(): UseQueryResult<ScheduledReport[]> {
  return useQuery({
    queryKey: SCHEDULES_KEY,
    queryFn: () => apiGet<ScheduledReport[]>('/analytics/schedules'),
    staleTime: 30_000,
  });
}

export interface SchedulePayload {
  reportId: string;
  frequency: ScheduleFrequency;
  format: ReportExportFormat;
  recipients: string[];
  startDate: string;
  endDate?: string;
  enabled?: boolean;
}

export const schedulesApi = {
  create: (body: SchedulePayload) => apiPost<ScheduledReport>('/analytics/schedules', body),
  update: (id: string, body: Partial<Omit<SchedulePayload, 'reportId'>>) =>
    apiPatch<ScheduledReport>(`/analytics/schedules/${id}`, body),
  remove: (id: string) => apiDelete<{ id: string }>(`/analytics/schedules/${id}`),
};

/**
 * Re-read this module's queries after a write.
 *
 * Passed to `useMutate`'s `refresh` so a saved report appears in the list
 * immediately, rather than after the whole `/dataset` payload comes back.
 */
export function useRefreshAnalytics() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ANALYTICS_KEY });
}
