import { Link } from 'react-router-dom';
import type { ApiMeta, PredictiveAlert } from '@access-genie/shared';
import { EmptyState, TableSkeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import {
  SEVERITY_BAR,
  SEVERITY_PILL,
  STATUS_PILL,
  TYPE_EMOJI,
  confidenceBand,
  formatDateShort,
  relative,
} from './tokens';

/**
 * The alert board — one compact row per alert.
 *
 * This replaces a grid of tall cards. Cards were the wrong shape for the job:
 * triage is a comparison, and two alerts you cannot see at the same time cannot
 * be compared. A row of three short lines fits a dozen alerts on a screen; the
 * evidence that used to fill each card moved into the detail drawer, which is
 * where you read it once you have decided which alert to read.
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
  className?: string;
}

/**
 * Seven columns, and the width budget is why there are not eight.
 *
 * Every field the board has to show is here, but "recommended action" rides in
 * the alert cell rather than taking a column of its own. Given its own column it
 * pushed the table past the content area, and the two columns that fell off the
 * right were Status and — the action itself. A field is not shown by having a
 * column; it is shown by being on screen.
 */
const COLUMNS: Column[] = [
  { key: 'severity', label: 'Severity', sort: 'severity' },
  { key: 'alert', label: 'Alert, type & recommended action' },
  { key: 'asset', label: 'Asset & facility', sort: 'assetName' },
  { key: 'detected', label: 'Detected', sort: 'detectedAt' },
  { key: 'confidence', label: 'Confidence', sort: 'confidence' },
  { key: 'status', label: 'Status', sort: 'status' },
  // Pinned right: on a narrow window the table scrolls, and an action column
  // that scrolls away with it is a set of buttons nobody finds.
  { key: 'actions', label: 'Actions', className: 'sticky right-0 bg-slate-50 text-right shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.15)]' },
];

export function AlertTable({
  items,
  meta,
  loading,
  sort,
  now,
  filtersActive,
  busyId,
  onSort,
  onPage,
  onOpen,
  onAcknowledge,
  onCreateWorkOrder,
  onDismiss,
  onRaise,
}: {
  items: PredictiveAlert[];
  meta: ApiMeta | undefined;
  loading: boolean;
  sort: string;
  now: number;
  filtersActive: boolean;
  /** The alert with a request in flight — its buttons are disabled, not the table's. */
  busyId: string | null;
  onSort: (sort: string) => void;
  onPage: (page: number) => void;
  onOpen: (alert: PredictiveAlert) => void;
  onAcknowledge: (alert: PredictiveAlert) => void;
  onCreateWorkOrder: (alert: PredictiveAlert) => void;
  onDismiss: (alert: PredictiveAlert) => void;
  onRaise: () => void;
}) {
  if (loading && items.length === 0) return <TableSkeleton rows={8} columns={7} />;

  if (items.length === 0) {
    return (
      <div className="glass-panel">
        <EmptyState
          variant={filtersActive ? 'no-results' : 'empty'}
          icon={filtersActive ? '🔍' : '🛡️'}
          title={filtersActive ? 'No alerts match these filters' : 'No predictive alerts'}
          description={
            filtersActive
              ? 'Clear a filter to widen the search.'
              : // Says what is actually true rather than implying a model is
                // running and has found nothing: there is no engine connected,
                // and the board will fill when one starts writing to the API.
                'Nothing is predicting failure on this estate right now. Alerts appear here when a predictive engine posts one to the API, or when somebody raises one from a condition they have observed.'
          }
          action={
            filtersActive ? undefined : (
              <button
                type="button"
                onClick={onRaise}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
              >
                Raise an alert
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
        {/*
          Sized to fit a laptop content area rather than to be generous. Above
          it, the table scrolls and the rightmost columns sit off-screen at rest;
          below it, the browser compresses columns instead of scrolling and
          squeezes the same ones to nothing. This is the width at which all
          seven fit, and narrower windows scroll with the actions pinned.
        */}
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  onClick={column.sort ? () => toggle(column.sort as string) : undefined}
                  aria-sort={column.sort && currentField === column.sort ? (currentDesc ? 'descending' : 'ascending') : undefined}
                  className={cn(
                    'whitespace-nowrap px-4 py-3.5',
                    column.className,
                    column.sort && 'cursor-pointer select-none hover:text-slate-700',
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
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {items.map((alert) => {
              const band = confidenceBand(alert.confidence);
              const busy = busyId === alert.id;
              // Dismissed and Resolved alerts stay listed but stop shouting —
              // they are history, and history that looks like a live alert is
              // how a board becomes noise.
              const settled = alert.status === 'Dismissed' || alert.status === 'Resolved';

              return (
                <tr
                  key={alert.id}
                  onClick={() => onOpen(alert)}
                  className={cn('group cursor-pointer transition-colors hover:bg-slate-50', settled && 'opacity-60')}
                >
                  <td className="relative py-3 pl-4 pr-3">
                    <span className={cn('absolute inset-y-0 left-0 w-1', SEVERITY_BAR[alert.severity])} aria-hidden />
                    <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', SEVERITY_PILL[alert.severity])}>
                      {alert.severity}
                    </span>
                  </td>

                  <td className="max-w-[310px] px-4 py-3">
                    <div className="truncate font-medium text-slate-900" title={alert.title}>
                      {alert.title}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="font-mono">{alert.id}</span>
                      <span>
                        {TYPE_EMOJI[alert.type]} {alert.type}
                      </span>
                    </div>
                    <div
                      className="mt-1 truncate text-[11px] text-slate-500"
                      title={alert.recommendation.action}
                    >
                      <span className="font-medium text-primary-600">Action:</span> {alert.recommendation.action}
                    </div>
                  </td>

                  <td className="max-w-[200px] px-4 py-3">
                    <Link
                      to={`/assets/${alert.assetId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block truncate text-xs text-slate-600 hover:text-primary-600"
                      title={alert.assetName}
                    >
                      {alert.assetName}
                    </Link>
                    <div className="truncate text-[11px] text-slate-400">{alert.placement?.facilityName ?? '—'}</div>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="text-xs text-slate-600">{formatDateShort(alert.detectedAt)}</div>
                    <div className="text-[11px] text-slate-400">{relative(alert.detectedAt, now)}</div>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
                        <div className={cn('h-full rounded-full', band.bar)} style={{ width: `${alert.confidence}%` }} />
                      </div>
                      <span className={cn('text-xs font-semibold tabular-nums', band.text)}>{alert.confidence}%</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {/* Provenance, stated plainly: an alert nobody's model
                          produced must not read as if one had. */}
                      {alert.detector ? alert.detector.name : 'Raised manually'}
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', STATUS_PILL[alert.status])}>
                      {alert.status}
                    </span>
                    {alert.workOrderIds.length > 0 && (
                      <div className="mt-1 font-mono text-[11px] text-emerald-600">
                        {alert.workOrderIds.length === 1
                          ? alert.workOrderIds[0]
                          : `${alert.workOrderIds.length} work orders`}
                      </div>
                    )}
                  </td>

                  {/* The row opens the drawer; these must not, so each stops the
                      click before it bubbles up to the <tr>. Pinned right, with
                      an opaque background — a sticky cell over a transparent one
                      shows the scrolling row through it. */}
                  <td
                    className={cn(
                      'sticky right-0 whitespace-nowrap bg-white px-4 py-3 text-right transition-colors group-hover:bg-slate-50',
                      'shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.15)]',
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="inline-flex items-center gap-1.5">
                      {(alert.status === 'Open' || alert.status === 'Acknowledged') && (
                        <RowAction label="Create WO" primary onClick={() => onCreateWorkOrder(alert)} disabled={busy} />
                      )}
                      {alert.status === 'Open' && (
                        <RowAction
                          label="Acknowledge"
                          icon="✓"
                          onClick={() => onAcknowledge(alert)}
                          disabled={busy}
                        />
                      )}
                      {!settled && (
                        <RowAction label="Dismiss" icon="✕" onClick={() => onDismiss(alert)} disabled={busy} />
                      )}
                      <RowAction label="View details" icon="›" onClick={() => onOpen(alert)} disabled={false} />
                    </div>
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
            Page {meta.page} of {meta.totalPages} · {meta.total} alert{meta.total === 1 ? '' : 's'}
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

/**
 * One row action.
 *
 * `icon` collapses it to a square button carrying the label as its accessible
 * name and its tooltip. That is not decoration — four full-width labels pushed
 * the Status column off the row, and a status you cannot see costs more than a
 * word you have to hover for. The one action the module exists for keeps its
 * label; the rest are recognised by shape and confirmed by tooltip.
 */
function RowAction({
  label,
  onClick,
  disabled,
  primary,
  icon,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
  icon?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'rounded-lg border text-[11px] font-medium transition-colors disabled:opacity-40',
        icon ? 'flex h-6 w-6 items-center justify-center text-sm leading-none' : 'px-2.5 py-1',
        primary
          ? 'border-primary-600 bg-primary-600 text-white hover:bg-primary-700'
          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900',
      )}
    >
      {icon ?? label}
    </button>
  );
}
