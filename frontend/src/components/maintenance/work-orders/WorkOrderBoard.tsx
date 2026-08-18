import { Link } from 'react-router-dom';
import {
  WORK_ORDER_TRANSITIONS,
  nextWorkOrderStatus,
  type WorkOrder,
  type WorkOrderBoard as BoardData,
  type WorkOrderStatus,
} from '@access-genie/shared';
import { cn } from '@/lib/utils';
import { PRIORITY_PILL, PRIORITY_RAIL, STATUS_DOT, TYPE_EMOJI, dueInfo, initials } from './tokens';
import { AssetLine, SourceBadge } from './shared';

/**
 * The board — one column per status, drawn from the server's grouping.
 *
 * Two things it does not do, both deliberate.
 *
 * It does not group client-side. The server returns the columns already split,
 * with each column's **true** total next to a capped page of rows, so a column
 * holding four hundred orders reports four hundred and ships fifty. Grouping a
 * capped list in the browser would report fifty and be wrong in the direction
 * that hides backlog.
 *
 * It does not offer moves the server will refuse. `WORK_ORDER_TRANSITIONS` is
 * the same map the API checks against — a button that fails every time it is
 * pressed is worse than no button.
 */

function BoardCard({
  workOrder,
  now,
  busy,
  onAdvance,
}: {
  workOrder: WorkOrder;
  now: number;
  busy: boolean;
  onAdvance: (workOrder: WorkOrder, status: WorkOrderStatus) => void;
}) {
  const due = dueInfo(workOrder, now);
  const next = nextWorkOrderStatus(workOrder.status);
  // Guarded against the map even though `nextWorkOrderStatus` derives from the
  // same workflow: the two are edited at different times.
  const canAdvance = next !== null && WORK_ORDER_TRANSITIONS[workOrder.status].includes(next);

  return (
    <div
      className={cn(
        'group rounded-lg border border-l-4 border-slate-200 bg-white p-3 shadow-sm transition-all',
        // Shadow and border on hover, but no lift: the advance control is a
        // 24px target, and a card that slides up as the pointer arrives moves
        // it out from under the cursor just as you go to click it.
        'hover:border-primary-500/40 hover:shadow-md',
        PRIORITY_RAIL[workOrder.priority],
        busy && 'pointer-events-none opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link to={`/maintenance/${workOrder.id}`} className="font-mono text-[10px] text-slate-400 hover:text-primary-600">
          {workOrder.id}
        </Link>
        {canAdvance && (
          <button
            type="button"
            onClick={() => onAdvance(workOrder, next)}
            title={`Move to ${next}`}
            aria-label={`Move ${workOrder.id} to ${next}`}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-primary-600 hover:text-white"
          >
            →
          </button>
        )}
      </div>

      <Link to={`/maintenance/${workOrder.id}`} className="mt-1 block">
        <h4 className="line-clamp-2 text-sm font-medium leading-snug text-slate-800 hover:text-primary-700">
          {workOrder.title}
        </h4>
      </Link>

      <AssetLine workOrder={workOrder} className="mt-1.5 truncate" />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', PRIORITY_PILL[workOrder.priority])}>
          {workOrder.priority}
        </span>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
          {TYPE_EMOJI[workOrder.type]} {workOrder.type}
        </span>
        <SourceBadge source={workOrder.source} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600">
            {initials(workOrder.assignedTo)}
          </span>
          <span className="truncate text-[11px] text-slate-500">{workOrder.assignedTo}</span>
        </div>
        <span className={cn('whitespace-nowrap text-[11px] font-medium', due.overdue ? 'text-health-critical' : 'text-slate-400')}>
          {due.text}
        </span>
      </div>
    </div>
  );
}

export function WorkOrderBoardView({
  board,
  loading,
  busyId,
  onAdvance,
  now,
}: {
  board: BoardData | undefined;
  loading: boolean;
  /** The card mid-request, so it cannot be clicked twice. */
  busyId: string | null;
  onAdvance: (workOrder: WorkOrder, status: WorkOrderStatus) => void;
  now: number;
}) {
  if (loading && !board) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-1">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-72 w-[15.5rem] shrink-0 animate-pulse rounded-xl bg-slate-100" aria-hidden />
        ))}
      </div>
    );
  }

  const columns = board?.columns ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-x-auto pb-1">
      <div className="flex h-full gap-4">
        {columns.map((column) => (
          <div
            key={column.status}
            className="flex min-w-[15.5rem] flex-1 flex-col rounded-xl border border-slate-200 bg-slate-100/40"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[column.status])} />
                <span className="text-sm font-semibold text-slate-800">{column.status}</span>
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">{column.total}</span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {column.items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-xs text-slate-400">
                  No work orders
                </p>
              ) : (
                column.items.map((workOrder) => (
                  <BoardCard
                    key={workOrder.id}
                    workOrder={workOrder}
                    now={now}
                    busy={busyId === workOrder.id}
                    onAdvance={onAdvance}
                  />
                ))
              )}

              {/* The cap made visible. A column that silently shows the first
                  fifty of four hundred is a board people quietly stop trusting. */}
              {column.total > column.items.length && (
                <p className="pt-1 text-center text-[11px] text-slate-400">
                  Showing {column.items.length} of {column.total} — narrow the filters to see the rest
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
