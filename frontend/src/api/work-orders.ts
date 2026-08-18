import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  ActiveWorkOrderSource,
  ActiveWorkOrderType,
  WorkOrder,
  WorkOrderBoard,
  WorkOrderFacets,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
  WorkOrderType,
} from '@access-genie/shared';
import { apiDelete, apiGet, apiList, apiPatch, apiPost } from '@/api/client';

/**
 * Work orders — the live read.
 *
 * The board and the list are two renderings of one server-side query, not two
 * client-side slices of a cached dataset. That is the whole point of the
 * rework: they take the same filter object, it goes to the same filter logic on
 * the server, and neither can show a record the other does not. The previous
 * version read `lib/dataset` — a capped reference payload fetched once — so the
 * two views could disagree with each other and both could disagree with the
 * database.
 */

export const WORK_ORDER_KEY = ['work-orders'] as const;

export interface WorkOrderFilters {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  status?: WorkOrderStatus[];
  priority?: WorkOrderPriority[];
  type?: WorkOrderType[];
  source?: WorkOrderSource[];
  assetId?: string;
  assignedTo?: string;
  /** Scope-node id — matches every asset beneath it. */
  facility?: string;
  overdue?: boolean;
  unassigned?: boolean;
  dueFrom?: string;
  dueTo?: string;
}

export const EMPTY_WORK_ORDER_FILTERS: WorkOrderFilters = {};

/** How many filters are narrowing the view — drives the "Clear" affordance. */
export function activeWorkOrderFilterCount(filters: WorkOrderFilters): number {
  return (
    (filters.q ? 1 : 0) +
    (filters.status?.length ? 1 : 0) +
    (filters.priority?.length ? 1 : 0) +
    (filters.type?.length ? 1 : 0) +
    (filters.source?.length ? 1 : 0) +
    (filters.facility ? 1 : 0) +
    (filters.assignedTo ? 1 : 0) +
    (filters.assetId ? 1 : 0) +
    (filters.overdue ? 1 : 0) +
    (filters.unassigned ? 1 : 0) +
    (filters.dueFrom || filters.dueTo ? 1 : 0)
  );
}

/**
 * Filters → query string.
 *
 * One function, used by the list, the board and the stats, so a filter cannot
 * be spelled one way for one view and another way for the next. Empty arrays
 * and blank strings are omitted rather than sent as `?status=`, which the
 * server would read as a filter naming nothing.
 */
function toQuery(filters: WorkOrderFilters): URLSearchParams {
  const query = new URLSearchParams();

  const csv = (key: string, values?: string[]) => {
    if (values && values.length > 0) query.set(key, values.join(','));
  };

  csv('status', filters.status);
  csv('priority', filters.priority);
  csv('type', filters.type);
  csv('source', filters.source);

  if (filters.q?.trim()) query.set('q', filters.q.trim());
  if (filters.assetId) query.set('assetId', filters.assetId);
  if (filters.assignedTo) query.set('assignedTo', filters.assignedTo);
  if (filters.facility) query.set('facility', filters.facility);
  if (filters.overdue) query.set('overdue', 'true');
  if (filters.unassigned) query.set('unassigned', 'true');
  if (filters.dueFrom) query.set('dueFrom', filters.dueFrom);
  if (filters.dueTo) query.set('dueTo', filters.dueTo);
  if (filters.sort) query.set('sort', filters.sort);
  if (filters.page) query.set('page', String(filters.page));
  if (filters.limit) query.set('limit', String(filters.limit));

  return query;
}

export interface WorkOrderStats {
  open: number;
  overdue: number;
  unassigned: number;
  completed: number;
  estimatedHoursOpen: number;
  byStatus: { status: WorkOrderStatus; count: number }[];
  byPriority: { priority: WorkOrderPriority; count: number }[];
  bySource: { source: WorkOrderSource; count: number }[];
}

/**
 * What may be sent to `POST /work-orders`.
 *
 * `type` and `source` are the **active** unions, not the full ones — the server
 * refuses `Predictive` and the other parked origins, so a call site that tries
 * to send one is a compile error here rather than a validation failure at
 * runtime. That is the whole reason these are narrowed on the client too.
 */
export interface CreateWorkOrderBody {
  title: string;
  assetId: string;
  type: ActiveWorkOrderType;
  priority: WorkOrderPriority;
  source: ActiveWorkOrderSource;
  assignedTo?: string;
  /** Opening status. Defaults to `New`; set it only for retroactive entry. */
  status?: WorkOrderStatus;
  scheduledDate?: string | null;
  dueDate: string;
  description?: string;
  estimatedHours?: number;
  requiredSkill?: string;
  checklist?: { label: string; done?: boolean }[];
}

export const maintenanceApi = {
  list: (filters: WorkOrderFilters = {}) => apiList<WorkOrder>(`/work-orders?${toQuery(filters)}`),
  board: (filters: WorkOrderFilters = {}, limitPerColumn = 50) => {
    const query = toQuery(filters);
    query.set('limitPerColumn', String(limitPerColumn));
    // Paging is meaningless on a board — the per-column cap is what bounds it.
    query.delete('page');
    query.delete('limit');
    return apiGet<WorkOrderBoard>(`/work-orders/board?${query}`);
  },
  stats: (filters: WorkOrderFilters = {}) => apiGet<WorkOrderStats>(`/work-orders/stats?${toQuery(filters)}`),
  facets: () => apiGet<WorkOrderFacets>('/work-orders/facets'),
  get: (id: string) => apiGet<WorkOrder>(`/work-orders/${id}`),

  create: (body: CreateWorkOrderBody) => apiPost<WorkOrder>('/work-orders', body),
  update: (id: string, body: Partial<CreateWorkOrderBody>) => apiPatch<WorkOrder>(`/work-orders/${id}`, body),
  remove: (id: string) => apiDelete(`/work-orders/${id}`),

  // Actions the server audits individually, rather than as a field edit. Each
  // has a rule PATCH does not enforce — a checked transition, a roster lookup.
  changeStatus: (id: string, status: WorkOrderStatus, note?: string) =>
    apiPost<WorkOrder>(`/work-orders/${id}/status`, { status, note }),
  assign: (id: string, assignedTo: string, note?: string) =>
    apiPost<WorkOrder>(`/work-orders/${id}/assign`, { assignedTo, note }),
  comment: (id: string, text: string) => apiPost<WorkOrder>(`/work-orders/${id}/comments`, { text }),
  logLabor: (id: string, hours: number, note: string) => apiPost<WorkOrder>(`/work-orders/${id}/labor`, { hours, note }),
  toggleChecklist: (id: string, index: number, done: boolean) =>
    apiPost<WorkOrder>(`/work-orders/${id}/checklist`, { index, done }),
};

// ── Hooks ────────────────────────────────────────────────────────────────────
// The serialised query *is* the identity of a view, so no filter can change
// without the cache key changing with it — which is what stops the previous
// cut's rows sitting under the new cut's heading.

export function useWorkOrderList(filters: WorkOrderFilters, enabled = true) {
  const query = toQuery(filters).toString();
  return useQuery({
    queryKey: [...WORK_ORDER_KEY, 'list', query],
    queryFn: () => maintenanceApi.list(filters),
    // Gated on the visible view so the page issues one request, not two. The
    // cache is what makes toggling back cheap: only the first switch to a view
    // pays for a fetch, and a write invalidates both regardless of which is on
    // screen — so the hidden one is never served stale when it reappears.
    enabled,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useWorkOrderBoard(filters: WorkOrderFilters, enabled = true): UseQueryResult<WorkOrderBoard> {
  const query = toQuery(filters).toString();
  return useQuery({
    queryKey: [...WORK_ORDER_KEY, 'board', query],
    queryFn: () => maintenanceApi.board(filters),
    enabled,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useWorkOrderStats(filters: WorkOrderFilters): UseQueryResult<WorkOrderStats> {
  const query = toQuery(filters).toString();
  return useQuery({
    queryKey: [...WORK_ORDER_KEY, 'stats', query],
    queryFn: () => maintenanceApi.stats(filters),
    placeholderData: (previous) => previous,
  });
}

export function useWorkOrderFacets(): UseQueryResult<WorkOrderFacets> {
  return useQuery({
    queryKey: [...WORK_ORDER_KEY, 'facets'],
    queryFn: () => maintenanceApi.facets(),
    // The option lists change only when work orders, technicians or the org
    // tree do. Refetching them on every filter change would be a request per
    // keystroke for a list that has not moved.
    staleTime: 120_000,
  });
}

export function useWorkOrder(id: string | undefined): UseQueryResult<WorkOrder> {
  return useQuery({
    queryKey: [...WORK_ORDER_KEY, 'one', id],
    queryFn: () => maintenanceApi.get(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Invalidate every work-order read after a write.
 *
 * One call, because a status change moves a card between board columns, changes
 * the list row, changes the header counts *and* changes the facet counts — and
 * a screen that refreshes three of those four is the screen people stop
 * trusting.
 */
export function useRefreshWorkOrders() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: WORK_ORDER_KEY });
}
