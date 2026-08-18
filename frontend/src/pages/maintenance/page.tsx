import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import type { WorkOrder, WorkOrderStatus } from '@access-genie/shared';
import {
  EMPTY_WORK_ORDER_FILTERS,
  activeWorkOrderFilterCount,
  maintenanceApi,
  useRefreshWorkOrders,
  useWorkOrderBoard,
  useWorkOrderFacets,
  useWorkOrderList,
  useWorkOrderStats,
  type WorkOrderFilters,
} from '@/api/work-orders';
import { ApiRequestError } from '@/api/client';
import { useMutate } from '@/api/mutate';
import { ErrorState, MetricCard, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { WorkOrderBoardView } from '@/components/maintenance/work-orders/WorkOrderBoard';
import { WorkOrderFilterBar } from '@/components/maintenance/work-orders/WorkOrderFilters';
import { WorkOrderListView } from '@/components/maintenance/work-orders/WorkOrderList';
import { cn } from '@/lib/utils';

/**
 * Automated Work Orders — the maintenance queue, board and list.
 *
 * One filter object, two renderings. Both views send that object to the same
 * endpoint, so they cannot disagree: switching between them re-queries rather
 * than re-slicing, and a record either matches the filters or it does not.
 *
 * This replaces a screen that read `lib/dataset` — a capped payload fetched
 * once at login — and did its filtering, sorting and "creation" in local state.
 * That version looked like it worked: cards moved, counts changed, a toast said
 * the order was created. None of it survived a refresh, and the board and the
 * list were two independent copies of the same stale array.
 *
 * Writes go through `useMutate`, which re-reads on success, plus a work-order
 * invalidation — a status change moves a card between columns, changes the row,
 * changes the header counts and changes the facet counts, and a screen that
 * refreshes three of those four is the one people stop trusting.
 */

type View = 'board' | 'list';

const DEFAULT_SORT = 'dueDate';

export default function MaintenancePage() {
  const [view, setView] = useState<View>('board');
  const [filters, setFilters] = useState<WorkOrderFilters>(EMPTY_WORK_ORDER_FILTERS);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { run } = useMutate();
  const refreshWorkOrders = useRefreshWorkOrders();

  // Both views take the same filters. Only the list adds paging and sorting —
  // a board is bounded by its per-column cap, not by a page number.
  const listFilters: WorkOrderFilters = { ...filters, page, limit: 25, sort };

  const board = useWorkOrderBoard(filters, view === 'board');
  const list = useWorkOrderList(listFilters, view === 'list');
  const stats = useWorkOrderStats(filters);
  const facets = useWorkOrderFacets();

  const activeCount = activeWorkOrderFilterCount(filters);

  // One instant for every relative date on screen, so two rows a second apart
  // never read as different ages because one of them re-rendered.
  const now = Date.now();

  const update = useCallback((next: Partial<WorkOrderFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
    // Any filter change invalidates the page number: staying on page 3 of a
    // result set that now has one page shows an empty table and looks broken.
    setPage(1);
  }, []);

  const clear = useCallback(() => {
    setFilters(EMPTY_WORK_ORDER_FILTERS);
    setPage(1);
  }, []);

  /**
   * Advance a work order from the board or the list.
   *
   * Not optimistic. A status change is validated server-side against the
   * transition map and can be refused, and moving a card to a column it is then
   * bounced out of is worse than a moment's wait. The card is disabled while
   * the request is in flight so it cannot be double-fired.
   */
  const advance = useCallback(
    async (workOrder: WorkOrder, status: WorkOrderStatus) => {
      setBusyId(workOrder.id);
      await run(maintenanceApi.changeStatus(workOrder.id, status), {
        success: `${workOrder.id} moved to ${status}`,
        successDetail: workOrder.title,
        describe: 'change that status',
        // Board and list re-read before the shared dataset does, so the card
        // lands in its new column immediately rather than after a full
        // `/dataset` round trip.
        refresh: refreshWorkOrders,
      });
      setBusyId(null);
    },
    [run, refreshWorkOrders],
  );

  const activeQuery = view === 'board' ? board : list;
  const error = activeQuery.error;

  const metrics = [
    { label: 'Open', value: stats.data?.open ?? 0, tone: 'primary' as const, icon: '📋', sub: `${stats.data?.estimatedHoursOpen ?? 0}h estimated` },
    {
      label: 'Overdue',
      value: stats.data?.overdue ?? 0,
      tone: (stats.data?.overdue ?? 0) > 0 ? ('red' as const) : ('slate' as const),
      icon: '⏰',
      sub: (stats.data?.overdue ?? 0) > 0 ? 'Past due date' : 'On schedule',
    },
    { label: 'Unassigned', value: stats.data?.unassigned ?? 0, tone: 'amber' as const, icon: '👤', sub: 'Awaiting a technician' },
    { label: 'Completed', value: stats.data?.completed ?? 0, tone: 'emerald' as const, icon: '✅', sub: 'In this cut' },
  ];

  return (
    <div className="flex h-full flex-col space-y-5">
      <PageHeader
        title="Automated Work Orders"
        subtitle="Manual, preventive and inspection-failure work across every facility."
        actions={
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-sm font-medium">
              {(['board', 'list'] as View[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  aria-pressed={view === option}
                  className={cn(
                    'rounded-md px-3 py-1.5 capitalize transition-colors',
                    view === option ? 'bg-primary-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <Link to="/maintenance/new">
              <Button>+ Create Work Order</Button>
            </Link>
          </div>
        }
      />

      {/* Counts describe the filtered cut, not the whole estate — they come
          from the same query the views below do. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} sub={metric.sub} tone={metric.tone} icon={metric.icon} />
        ))}
      </div>

      <WorkOrderFilterBar
        filters={filters}
        facets={facets.data}
        onChange={update}
        onClear={clear}
        activeCount={activeCount}
      />

      {error ? (
        <div className="glass-panel">
          <ErrorState
            title="Could not load work orders"
            description={error instanceof ApiRequestError ? error.message : 'The request failed.'}
            requestId={error instanceof ApiRequestError ? error.requestId : undefined}
            onRetry={() => void activeQuery.refetch()}
          />
        </div>
      ) : view === 'board' ? (
        <WorkOrderBoardView
          board={board.data}
          loading={board.isLoading}
          busyId={busyId}
          onAdvance={(workOrder, status) => void advance(workOrder, status)}
          now={now}
        />
      ) : (
        <WorkOrderListView
          items={list.data?.items ?? []}
          meta={list.data?.meta}
          loading={list.isLoading}
          sort={sort}
          busyId={busyId}
          onSort={(next) => {
            setSort(next);
            setPage(1);
          }}
          onPage={setPage}
          onAdvance={(workOrder, status) => void advance(workOrder, status)}
          now={now}
          filtersActive={activeCount > 0}
        />
      )}
    </div>
  );
}
