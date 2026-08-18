import { Link } from 'react-router-dom';
import type { ApiMeta } from '@access-genie/shared';
import {
  WORK_ORDER_TRANSITIONS,
  nextWorkOrderStatus,
  type WorkOrder,
  type WorkOrderStatus,
} from '@access-genie/shared';
import { EmptyState, TableSkeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { PRIORITY_PILL, STATUS_PILL, TYPE_EMOJI, dueInfo, formatDateShort } from './tokens';
import { AssetLine, SourceBadge } from './shared';

/**
 * The list — the same server query as the board, in rows.
 *
 * Sorting and paging are the server's, not the browser's. Sorting a single
 * fetched page in the client reorders *that page* and calls it "sorted by
 * priority", which is wrong the moment there is more than one page — and it is
 * the kind of wrong nobody notices, because the page it produces looks sorted.
 */

interface Column {
  key: string;
  label: string;
  /** Absent when the server has no ordering for it. */
  sort?: string;
  className?: string;
}

const COLUMNS: Column[] = [
  { key: 'title', label: 'Work Order', sort: 'title' },
  { key: 'asset', label: 'Asset & Facility' },
  { key: 'status', label: 'Status', sort: 'status' },
  { key: 'priority', label: 'Priority', sort: 'priority' },
  { key: 'source', label: 'Source' },
  { key: 'assignedTo', label: 'Technician' },
  { key: 'scheduled', label: 'Scheduled', sort: 'scheduledDate' },
  { key: 'due', label: 'Due', sort: 'dueDate' },
];

export function WorkOrderListView({
  items,
  meta,
  loading,
  sort,
  busyId,
  onSort,
  onPage,
  onAdvance,
  now,
  filtersActive,
}: {
  items: WorkOrder[];
  meta: ApiMeta | undefined;
  loading: boolean;
  sort: string;
  busyId: string | null;
  onSort: (sort: string) => void;
  onPage: (page: number) => void;
  onAdvance: (workOrder: WorkOrder, status: WorkOrderStatus) => void;
  now: number;
  filtersActive: boolean;
}) {
  if (loading && items.length === 0) return <TableSkeleton rows={8} columns={6} />;

  if (items.length === 0) {
    return (
      <div className="glass-panel">
        <EmptyState
          variant={filtersActive ? 'no-results' : 'empty'}
          icon="🔧"
          title={filtersActive ? 'No work orders match these filters' : 'No work orders yet'}
          description={
            filtersActive
              ? 'Clear a filter to widen the search.'
              : 'Raise one against an asset, or let a preventive schedule or a failed inspection raise it for you.'
          }
        />
      </div>
    );
  }

  const currentField = sort.replace(/^-/, '');
  const currentDesc = sort.startsWith('-');

  const toggle = (field: string) => {
    // Same column flips direction; a new column starts ascending. Due date
    // ascending is "most urgent first", which is the order this table is for.
    onSort(currentField === field && !currentDesc ? `-${field}` : field);
  };

  return (
    <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  onClick={column.sort ? () => toggle(column.sort as string) : undefined}
                  aria-sort={
                    column.sort && currentField === column.sort ? (currentDesc ? 'descending' : 'ascending') : undefined
                  }
                  className={cn(
                    'px-5 py-3.5 whitespace-nowrap',
                    column.sort && 'cursor-pointer select-none hover:text-slate-700',
                    column.className,
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {column.label}
                    {column.sort && (
                      <span className="text-[9px] text-primary-500">
                        {currentField === column.sort ? (currentDesc ? '▼' : '▲') : ''}
                      </span>
                    )}
                  </span>
                </th>
              ))}
              <th className="px-5 py-3.5 text-right">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {items.map((workOrder) => {
              const due = dueInfo(workOrder, now);
              const next = nextWorkOrderStatus(workOrder.status);
              const canAdvance = next !== null && WORK_ORDER_TRANSITIONS[workOrder.status].includes(next);

              return (
                <tr
                  key={workOrder.id}
                  className={cn('transition-colors hover:bg-slate-50', busyId === workOrder.id && 'opacity-60')}
                >
                  <td className="px-5 py-3">
                    <Link to={`/maintenance/${workOrder.id}`} className="font-medium text-slate-900 hover:text-primary-700">
                      {workOrder.title}
                    </Link>
                    <div className="font-mono text-[11px] text-slate-400">{workOrder.id}</div>
                  </td>

                  <td className="px-5 py-3">
                    <AssetLine workOrder={workOrder} />
                  </td>

                  <td className="px-5 py-3">
                    <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', STATUS_PILL[workOrder.status])}>
                      {workOrder.status}
                    </span>
                  </td>

                  <td className="px-5 py-3">
                    <span
                      className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', PRIORITY_PILL[workOrder.priority])}
                    >
                      {workOrder.priority}
                    </span>
                  </td>

                  <td className="px-5 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <SourceBadge source={workOrder.source} />
                      <span className="text-[11px] text-slate-400">
                        {TYPE_EMOJI[workOrder.type]} {workOrder.type}
                      </span>
                    </div>
                  </td>

                  <td className="px-5 py-3">
                    <span className={workOrder.assignedTo === 'Unassigned' ? 'text-slate-400' : 'text-slate-600'}>
                      {workOrder.assignedTo}
                    </span>
                  </td>

                  <td className="px-5 py-3 whitespace-nowrap text-slate-500">{formatDateShort(workOrder.scheduledDate)}</td>

                  <td className="px-5 py-3 whitespace-nowrap">
                    <div className={due.overdue ? 'font-medium text-health-critical' : 'text-slate-600'}>
                      {formatDateShort(workOrder.dueDate)}
                    </div>
                    <div className={cn('text-[11px]', due.overdue ? 'text-health-critical' : 'text-slate-400')}>{due.text}</div>
                  </td>

                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {canAdvance ? (
                      <button
                        type="button"
                        onClick={() => onAdvance(workOrder, next)}
                        disabled={busyId === workOrder.id}
                        className="text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
                      >
                        {next} →
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">{workOrder.status === 'Completed' ? 'Done ✓' : '—'}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span>
            Page {meta.page} of {meta.totalPages} · {meta.total} work order{meta.total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPage(meta.page - 1)}
              disabled={!meta.hasPrev}
              className="rounded-lg border border-slate-200 px-3 py-1 font-medium hover:border-slate-300 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => onPage(meta.page + 1)}
              disabled={!meta.hasNext}
              className="rounded-lg border border-slate-200 px-3 py-1 font-medium hover:border-slate-300 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
