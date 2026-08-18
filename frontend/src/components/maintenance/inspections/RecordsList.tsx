import { Link } from 'react-router-dom';
import type { ApiMeta, Inspection } from '@access-genie/shared';
import { EmptyState, TableSkeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { STATUS_PILL, TYPE_EMOJI, completion, dueInfo, formatDateShort } from './tokens';

/**
 * Inspection Records — one row per execution.
 *
 * Sorting and paging are the server's. Sorting a fetched page in the browser
 * reorders *that page* and calls it sorted, which is wrong the moment there is
 * more than one — and wrong in a way nobody notices, because the result looks
 * sorted.
 */

interface Column {
  key: string;
  label: string;
  sort?: string;
}

const COLUMNS: Column[] = [
  { key: 'title', label: 'Inspection', sort: 'title' },
  { key: 'asset', label: 'Asset & Facility' },
  { key: 'status', label: 'Status', sort: 'status' },
  { key: 'progress', label: 'Checklist' },
  { key: 'assignedTo', label: 'Assigned' },
  { key: 'scheduled', label: 'Scheduled', sort: 'scheduledFor' },
];

export function RecordsList({
  items,
  meta,
  loading,
  sort,
  onSort,
  onPage,
  now,
  filtersActive,
  onSchedule,
}: {
  items: Inspection[];
  meta: ApiMeta | undefined;
  loading: boolean;
  sort: string;
  onSort: (sort: string) => void;
  onPage: (page: number) => void;
  now: number;
  filtersActive: boolean;
  onSchedule: () => void;
}) {
  if (loading && items.length === 0) return <TableSkeleton rows={8} columns={6} />;

  if (items.length === 0) {
    return (
      <div className="glass-panel">
        <EmptyState
          variant={filtersActive ? 'no-results' : 'empty'}
          icon="🔎"
          title={filtersActive ? 'No inspections match these filters' : 'No inspections yet'}
          description={
            filtersActive
              ? 'Clear a filter to widen the search.'
              : 'Build a template first, then schedule it against the assets it applies to.'
          }
          action={
            filtersActive ? undefined : (
              <button
                type="button"
                onClick={onSchedule}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
              >
                Schedule an inspection
              </button>
            )
          }
        />
      </div>
    );
  }

  const currentField = sort.replace(/^-/, '');
  const currentDesc = sort.startsWith('-');
  const toggle = (field: string) => onSort(currentField === field && !currentDesc ? `-${field}` : field);

  return (
    <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  onClick={column.sort ? () => toggle(column.sort as string) : undefined}
                  aria-sort={column.sort && currentField === column.sort ? (currentDesc ? 'descending' : 'ascending') : undefined}
                  className={cn('whitespace-nowrap px-5 py-3.5', column.sort && 'cursor-pointer select-none hover:text-slate-700')}
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
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {items.map((inspection) => {
              const due = dueInfo(inspection, now);
              const progress = completion(inspection);

              return (
                <tr key={inspection.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link to={`/inspections/${inspection.id}`} className="font-medium text-slate-900 hover:text-primary-700">
                      {inspection.title}
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-400">{inspection.id}</span>
                      <span className="text-[11px] text-slate-400">
                        {TYPE_EMOJI[inspection.type]} {inspection.templateName}
                      </span>
                    </div>
                  </td>

                  <td className="px-5 py-3">
                    <Link to={`/assets/${inspection.assetId}`} className="text-xs text-slate-600 hover:text-primary-600">
                      {inspection.assetName}
                    </Link>
                    <div className="text-[11px] text-slate-400">{inspection.placement?.facilityName ?? '—'}</div>
                  </td>

                  <td className="px-5 py-3">
                    <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', STATUS_PILL[inspection.status])}>
                      {inspection.status}
                    </span>
                    {inspection.summary.failed > 0 && (
                      <div className="mt-1 text-[11px] font-medium text-health-critical">
                        {inspection.summary.failed} failed
                      </div>
                    )}
                  </td>

                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            inspection.summary.failed > 0 ? 'bg-health-critical' : 'bg-primary-500',
                          )}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="whitespace-nowrap text-[11px] tabular-nums text-slate-500">
                        {inspection.summary.total - inspection.summary.pending}/{inspection.summary.total}
                      </span>
                    </div>
                  </td>

                  <td className="px-5 py-3">
                    <span className={inspection.assignedTo === 'Unassigned' ? 'text-xs text-slate-400' : 'text-xs text-slate-600'}>
                      {inspection.assignedTo}
                    </span>
                    {inspection.performedBy && inspection.performedBy !== inspection.assignedTo && (
                      <div className="text-[11px] text-slate-400">by {inspection.performedBy}</div>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-5 py-3">
                    <div className={due.overdue ? 'font-medium text-health-critical' : 'text-slate-600'}>
                      {formatDateShort(inspection.scheduledFor)}
                    </div>
                    <div className={cn('text-[11px]', due.overdue ? 'text-health-critical' : 'text-slate-400')}>{due.text}</div>
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
            Page {meta.page} of {meta.totalPages} · {meta.total} inspection{meta.total === 1 ? '' : 's'}
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
