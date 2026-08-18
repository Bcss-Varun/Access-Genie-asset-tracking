import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  Inspection,
  InspectionFacets,
  InspectionFailure,
  InspectionQuestionType,
  InspectionStats,
  InspectionStatus,
  InspectionTemplate,
  InspectionType,
  WorkOrderPriority,
} from '@access-genie/shared';
import { apiDelete, apiGet, apiList, apiPatch, apiPost } from '@/api/client';

/**
 * Inspections & Checklists — the live read.
 *
 * Two resources, one module: `/inspection-templates` is the reusable library
 * and `/inspections` the records executed from it. They share a cache key root
 * so a write to either re-reads both — scheduling an inspection changes a
 * template's usage count, and completing one changes the summary cards.
 *
 * Nothing here grades an answer. A response is posted as the raw value the
 * inspector gave and comes back with the server's verdict on it; a compliance
 * record whose outcome the browser decided is not a compliance record.
 */

export const INSPECTION_KEY = ['inspections'] as const;

// ── Filters ──────────────────────────────────────────────────────────────────

export interface InspectionFilters {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  status?: InspectionStatus[];
  type?: InspectionType[];
  templateId?: string;
  assetId?: string;
  assignedTo?: string;
  /** Scope-node id — matches every asset beneath it. */
  facility?: string;
  overdue?: boolean;
  unassigned?: boolean;
  from?: string;
  to?: string;
}

export const EMPTY_INSPECTION_FILTERS: InspectionFilters = {};

export function activeInspectionFilterCount(filters: InspectionFilters): number {
  return (
    (filters.q ? 1 : 0) +
    (filters.status?.length ? 1 : 0) +
    (filters.type?.length ? 1 : 0) +
    (filters.templateId ? 1 : 0) +
    (filters.assetId ? 1 : 0) +
    (filters.assignedTo ? 1 : 0) +
    (filters.facility ? 1 : 0) +
    (filters.overdue ? 1 : 0) +
    (filters.unassigned ? 1 : 0) +
    (filters.from || filters.to ? 1 : 0)
  );
}

/** One serialiser for the list, the stats and the cache key, so they cannot disagree. */
function toQuery(filters: InspectionFilters): URLSearchParams {
  const query = new URLSearchParams();
  const csv = (key: string, values?: string[]) => {
    if (values && values.length > 0) query.set(key, values.join(','));
  };

  csv('status', filters.status);
  csv('type', filters.type);

  if (filters.q?.trim()) query.set('q', filters.q.trim());
  if (filters.templateId) query.set('templateId', filters.templateId);
  if (filters.assetId) query.set('assetId', filters.assetId);
  if (filters.assignedTo) query.set('assignedTo', filters.assignedTo);
  if (filters.facility) query.set('facility', filters.facility);
  if (filters.overdue) query.set('overdue', 'true');
  if (filters.unassigned) query.set('unassigned', 'true');
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  if (filters.sort) query.set('sort', filters.sort);
  if (filters.page) query.set('page', String(filters.page));
  if (filters.limit) query.set('limit', String(filters.limit));

  return query;
}

// ── Write bodies ─────────────────────────────────────────────────────────────

export interface CheckpointInput {
  key?: string;
  label: string;
  type: InspectionQuestionType;
  required: boolean;
  helpText?: string;
  min?: number;
  max?: number;
  unit?: string;
  failWhen?: 'Fail' | 'No' | 'Yes';
}

export interface TemplateBody {
  name: string;
  description?: string;
  type: InspectionType;
  category?: string;
  icon?: string;
  checkpoints: CheckpointInput[];
  scope: { assetIds: string[]; assetCategories: string[]; facilityIds: string[] };
  estimatedMinutes?: number;
  active?: boolean;
}

export interface AnswerInput {
  key: string;
  value?: string | number | boolean | null;
  note?: string;
  finding?: string;
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export const inspectionsApi = {
  // Templates
  templates: (params: { q?: string; type?: string; active?: string; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.type) query.set('type', params.type);
    if (params.active) query.set('active', params.active);
    query.set('limit', String(params.limit ?? 100));
    return apiList<InspectionTemplate>(`/inspection-templates?${query}`);
  },
  template: (id: string) => apiGet<InspectionTemplate>(`/inspection-templates/${id}`),
  /** The assets a template's scope resolves to — the schedule picker's options. */
  templateAssets: (id: string) =>
    apiGet<{ id: string; name: string; category: string; location: string }[]>(`/inspection-templates/${id}/assets`),
  createTemplate: (body: TemplateBody) => apiPost<InspectionTemplate>('/inspection-templates', body),
  updateTemplate: (id: string, body: Partial<TemplateBody>) => apiPatch<InspectionTemplate>(`/inspection-templates/${id}`, body),
  /** Answers `{ deleted, deactivated }` — a template with history is retired, not removed. */
  removeTemplate: (id: string) => apiDelete<{ deleted: boolean; deactivated: boolean }>(`/inspection-templates/${id}`),

  // Records
  list: (filters: InspectionFilters = {}) => apiList<Inspection>(`/inspections?${toQuery(filters)}`),
  stats: (filters: InspectionFilters = {}) => apiGet<InspectionStats>(`/inspections/stats?${toQuery(filters)}`),
  facets: () => apiGet<InspectionFacets>('/inspections/facets'),
  get: (id: string) => apiGet<Inspection>(`/inspections/${id}`),
  failures: (id: string) => apiGet<InspectionFailure[]>(`/inspections/${id}/failures`),

  schedule: (body: { templateId: string; assetId: string; scheduledFor: string; assignedTo?: string; title?: string; type?: InspectionType; notes?: string }) =>
    apiPost<Inspection>('/inspections', body),
  scheduleBulk: (body: { templateId: string; assetIds: string[]; scheduledFor: string; assignedTo?: string; type?: InspectionType }) =>
    apiPost<{ created: Inspection[]; failed: { assetId: string; reason: string }[] }>('/inspections/bulk', body),
  update: (id: string, body: { title?: string; scheduledFor?: string; assignedTo?: string; notes?: string; type?: InspectionType }) =>
    apiPatch<Inspection>(`/inspections/${id}`, body),
  remove: (id: string) => apiDelete(`/inspections/${id}`),

  // Execution — each has a server-side rule PATCH does not enforce.
  assign: (id: string, assignedTo: string) => apiPost<Inspection>(`/inspections/${id}/assign`, { assignedTo }),
  start: (id: string) => apiPost<Inspection>(`/inspections/${id}/start`),
  respond: (id: string, responses: AnswerInput[]) => apiPost<Inspection>(`/inspections/${id}/responses`, { responses }),
  complete: (id: string, body: { notes?: string; performedBy?: string } = {}) =>
    apiPost<Inspection>(`/inspections/${id}/complete`, body),

  // Corrective work
  raiseCorrective: (id: string, key: string, body: { priority?: WorkOrderPriority; dueInDays?: number; assignedTo?: string } = {}) =>
    apiPost<{ inspection: Inspection; workOrderId: string }>(`/inspections/${id}/corrective/${key}`, body),
  raiseAllCorrective: (id: string, body: { priority?: WorkOrderPriority; dueInDays?: number; assignedTo?: string } = {}) =>
    apiPost<{ inspection: Inspection; workOrderIds: string[] }>(`/inspections/${id}/corrective`, body),
};

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useInspectionList(filters: InspectionFilters, enabled = true) {
  const query = toQuery(filters).toString();
  return useQuery({
    // The serialised query *is* the identity of the view, so no filter can
    // change without the cache key changing with it.
    queryKey: [...INSPECTION_KEY, 'list', query],
    queryFn: () => inspectionsApi.list(filters),
    enabled,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useInspectionStats(filters: InspectionFilters): UseQueryResult<InspectionStats> {
  const query = toQuery(filters).toString();
  return useQuery({
    queryKey: [...INSPECTION_KEY, 'stats', query],
    queryFn: () => inspectionsApi.stats(filters),
    placeholderData: (previous) => previous,
  });
}

export function useInspectionFacets(): UseQueryResult<InspectionFacets> {
  return useQuery({
    queryKey: [...INSPECTION_KEY, 'facets'],
    queryFn: () => inspectionsApi.facets(),
    // Options move only when records, templates or the roster do — refetching
    // them per keystroke would be a request for a list that has not changed.
    staleTime: 120_000,
  });
}

export function useInspection(id: string | undefined): UseQueryResult<Inspection> {
  return useQuery({
    queryKey: [...INSPECTION_KEY, 'one', id],
    queryFn: () => inspectionsApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useInspectionFailures(id: string | undefined, enabled = true): UseQueryResult<InspectionFailure[]> {
  return useQuery({
    queryKey: [...INSPECTION_KEY, 'failures', id],
    queryFn: () => inspectionsApi.failures(id as string),
    enabled: Boolean(id) && enabled,
  });
}

export function useInspectionTemplates(params: { q?: string; type?: string; active?: string } = {}, enabled = true) {
  return useQuery({
    queryKey: [...INSPECTION_KEY, 'templates', JSON.stringify(params)],
    queryFn: () => inspectionsApi.templates(params),
    enabled,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useInspectionTemplate(id: string | undefined): UseQueryResult<InspectionTemplate> {
  return useQuery({
    queryKey: [...INSPECTION_KEY, 'template', id],
    queryFn: () => inspectionsApi.template(id as string),
    enabled: Boolean(id),
  });
}

export function useTemplateAssets(id: string | undefined) {
  return useQuery({
    queryKey: [...INSPECTION_KEY, 'template-assets', id],
    queryFn: () => inspectionsApi.templateAssets(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Re-read every inspection query after a write.
 *
 * One call, because a single action moves several numbers at once: completing
 * an inspection changes the record, the summary cards, the facet counts and the
 * template's usage. A screen that refreshes three of those four is the one
 * people stop trusting.
 */
export function useRefreshInspections() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: INSPECTION_KEY });
}
