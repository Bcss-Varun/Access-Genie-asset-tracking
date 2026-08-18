import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MaintenanceKind, MaintenanceKpiId } from '@access-genie/shared';
import {
  EMPTY_MAINTENANCE_FILTERS,
  activeFilterCount,
  useMaintenanceDashboard,
  type MaintenanceDashboardFilters,
} from '@/api/maintenance-dashboard';
import { ApiRequestError } from '@/api/client';
import { ErrorState, PageHeader } from '@/components/ui/primitives';
import { ActivityFeed } from '@/components/maintenance/dashboard/ActivityFeed';
import { DashboardFilters } from '@/components/maintenance/dashboard/DashboardFilters';
import { FacilityTable } from '@/components/maintenance/dashboard/FacilityTable';
import { ItemList } from '@/components/maintenance/dashboard/ItemList';
import { KpiStrip } from '@/components/maintenance/dashboard/KpiStrip';
import { TrendPanel } from '@/components/maintenance/dashboard/TrendPanel';
import { TypeMix } from '@/components/maintenance/dashboard/TypeMix';
import { formatRelative } from '@/components/maintenance/dashboard/format';

/**
 * Maintenance Dashboard — the whole estate's maintenance position on one screen.
 *
 * This screen owns no data and computes no figures. It holds a filter set, and
 * everything it draws comes back from `GET /maintenance-dashboard`, which
 * aggregates the same `WorkOrder`, `PmSchedule` and `Inspection` records the
 * maintenance modules write. Raise a work order in Automated Work Orders and it
 * is in these numbers on the next read; there is nothing here to reconcile,
 * because there is nothing here that is stored twice.
 *
 * It also deliberately stops short of the modules it summarises. There is no
 * board, no editing, no status transitions — every row is a link into the
 * screen that already does that job properly. The dashboard's question is
 * "where do I need to look", not "let me do the work from here".
 */

/**
 * What a KPI tile drills into.
 *
 * Applying the filter in place rather than navigating: `/maintenance`, `/pm`
 * and `/inspections` do not read filters from the URL, so a link carrying
 * `?priority=Critical` would land on an unfiltered board and claim to have
 * drilled in. Narrowing the dashboard is the version of that promise this build
 * can actually keep — and the tables it narrows all link out to the real
 * records, which is where the drill-down genuinely ends.
 */
const KPI_FILTERS: Record<MaintenanceKpiId, Partial<MaintenanceDashboardFilters>> = {
  open: { statuses: ['Open', 'In Progress', 'On Hold'], overdue: false, priorities: [], types: [] },
  overdue: { overdue: true, statuses: [], priorities: [], types: [] },
  critical: { priorities: ['Critical'], statuses: ['Open', 'In Progress', 'On Hold'], overdue: false, types: [] },
  'in-progress': { statuses: ['In Progress'], overdue: false, priorities: [], types: [] },
  completed: { statuses: ['Completed'], overdue: false, priorities: [], types: [] },
  'preventive-due': { types: ['Preventive'], statuses: [], priorities: [], overdue: false },
  // Both halves of the tile: failed inspections and open corrective work.
  'failed-corrective': { types: ['Corrective', 'Inspection'], statuses: [], priorities: [], overdue: false },
};

/** Whether the current filters are exactly what a given tile would set. */
function matchesKpi(filters: MaintenanceDashboardFilters, id: MaintenanceKpiId): boolean {
  const wanted = KPI_FILTERS[id];
  const same = <T,>(a: T[] | undefined, b: T[] | undefined) =>
    (a ?? []).length === (b ?? []).length && (a ?? []).every((v, i) => v === (b ?? [])[i]);

  return (
    same(wanted.statuses, filters.statuses) &&
    same(wanted.priorities, filters.priorities) &&
    same(wanted.types, filters.types) &&
    Boolean(wanted.overdue) === Boolean(filters.overdue)
  );
}

export default function MaintenanceDashboardPage() {
  const [filters, setFilters] = useState<MaintenanceDashboardFilters>(EMPTY_MAINTENANCE_FILTERS);
  const [showGaps, setShowGaps] = useState(false);
  const attentionRef = useRef<HTMLDivElement>(null);

  const query = useMaintenanceDashboard(filters);
  const data = query.data;

  const update = useCallback(
    (next: Partial<MaintenanceDashboardFilters>) => setFilters((current) => ({ ...current, ...next })),
    [],
  );

  const selectKpi = useCallback(
    (id: MaintenanceKpiId) => {
      setFilters((current) =>
        // Pressing the active tile again clears it — a filter you cannot turn
        // off is a trap, and there is no other affordance on the tile to do it.
        matchesKpi(current, id)
          ? { ...current, statuses: [], priorities: [], types: [], overdue: false }
          : { ...current, ...KPI_FILTERS[id] },
      );
      attentionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [],
  );

  const selectKind = useCallback(
    (kind: MaintenanceKind) =>
      setFilters((current) => ({
        ...current,
        types: current.types.length === 1 && current.types[0] === kind ? [] : [kind],
      })),
    [],
  );

  const selectFacility = useCallback(
    (facilityId: string | null) => setFilters((current) => ({ ...current, facility: facilityId ?? undefined, location: undefined })),
    [],
  );

  /*
   * One instant for every relative time on the screen.
   *
   * Held in state and ticked rather than read at render, for two reasons: two
   * entries a second apart never read as the same age because one of them
   * happened to re-render and the other did not, and "Updated 4m ago" in the
   * header keeps counting on a screen somebody leaves open — which is the
   * whole point of printing it.
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const activeKpi = useMemo(() => {
    if (!data) return null;
    return data.kpis.find((kpi) => matchesKpi(filters, kpi.id))?.id ?? null;
  }, [data, filters]);

  const count = activeFilterCount(filters);

  // A failed first load has nothing to show under it; a failure after one good
  // load leaves the last figures on screen with the error above them, because
  // stale numbers with a visible warning beat an empty page.
  if (query.isError && !data) {
    const error = query.error;
    return (
      <div className="space-y-6">
        <PageHeader title="Maintenance Dashboard" subtitle="Maintenance across every facility, in one view." />
        <div className="glass-panel">
          <ErrorState
            title="Could not load the maintenance dashboard"
            description={error instanceof ApiRequestError ? error.message : 'The request failed.'}
            requestId={error instanceof ApiRequestError ? error.requestId : undefined}
            onRetry={() => void query.refetch()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <PageHeader
        title="Maintenance Dashboard"
        subtitle="Work orders, preventive schedules and inspections across every facility and warehouse."
        breadcrumb={[{ label: 'Predictive Maintenance', href: '/maintenance' }, { label: 'Dashboard' }]}
        actions={
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-400 sm:inline">
              {data ? `Updated ${formatRelative(data.generatedAt, now)}` : 'Loading…'}
            </span>
            <button
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
            >
              {query.isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        }
      />

      {/* A refresh that fails after a good load must not silently show stale
          numbers as if they were current. */}
      {query.isError && data && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span>
            Could not refresh — showing figures from {formatRelative(data.generatedAt, now)}.
          </span>
          <button type="button" onClick={() => void query.refetch()} className="font-medium underline">
            Retry
          </button>
        </div>
      )}

      <DashboardFilters
        filters={filters}
        options={data?.options}
        onChange={update}
        onClear={() => setFilters({ ...EMPTY_MAINTENANCE_FILTERS, period: filters.period, from: filters.from, to: filters.to })}
        activeCount={count}
      />

      {/* 1 — Where things stand. */}
      <KpiStrip kpis={data?.kpis ?? []} activeId={activeKpi} onSelect={selectKpi} loading={query.isLoading} />

      {/* 2 — How it has been moving, and what it is made of. */}
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TrendPanel
            trend={data?.trend ?? []}
            range={data?.range}
            loading={query.isLoading}
            filtersActive={count > 0}
          />
        </div>
        <TypeMix
          slices={data?.typeBreakdown ?? []}
          activeKinds={filters.types}
          onSelect={selectKind}
          loading={query.isLoading}
        />
      </div>

      {/* 3 — Which sites need attention. */}
      <FacilityTable
        rows={data?.facilities ?? []}
        activeFacility={filters.facility}
        onSelect={selectFacility}
        loading={query.isLoading}
      />

      {/* 4 — Which jobs need attention, and what is coming. */}
      <div ref={attentionRef} className="grid gap-5 scroll-mt-4 lg:grid-cols-2">
        <ItemList
          title="Critical Attention"
          hint="Critical or already past due"
          items={data?.criticalAttention ?? []}
          loading={query.isLoading}
          emptyIcon="✅"
          emptyMessage={count > 0 ? 'Nothing critical or overdue in this cut' : 'Nothing critical or overdue'}
          emptyHint={
            count > 0
              ? 'Clear a filter to widen the search.'
              : 'Work that is Critical priority, or past its due date, appears here.'
          }
          linkTo="/maintenance"
          linkLabel="Work orders"
        />
        <ItemList
          title="Upcoming Maintenance"
          hint="Scheduled work still ahead of its due date"
          items={data?.upcoming ?? []}
          loading={query.isLoading}
          emptyIcon="📅"
          emptyMessage={count > 0 ? 'Nothing scheduled ahead in this cut' : 'Nothing scheduled ahead'}
          emptyHint={
            count > 0
              ? 'Clear a filter to see the rest of the schedule.'
              : 'Preventive schedules, planned work orders and booked inspections appear here by due date.'
          }
          linkTo="/pm"
          linkLabel="PM schedules"
        />
      </div>

      {/* 5 — What has been happening. */}
      <ActivityFeed entries={data?.recentActivity ?? []} loading={query.isLoading} now={now} />

      {/*
        The honest footnote.

        Some of what a maintenance dashboard is normally asked for has no field
        behind it in this schema — inspections carry no priority, a work order
        has no failure state. Every one of those is listed here with the field
        that is missing, rather than being filled in with a plausible number,
        because a figure nobody can trace is worse than a figure nobody has.
      */}
      {data && data.dataGaps.length > 0 && (
        <div className="glass-panel px-5 py-3">
          <button
            type="button"
            onClick={() => setShowGaps((open) => !open)}
            aria-expanded={showGaps}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="text-xs font-semibold text-slate-600">
              Data coverage — {data.dataGaps.length} metrics the current schema cannot fully answer
            </span>
            <span className={`text-slate-400 transition-transform ${showGaps ? 'rotate-180' : ''}`}>▾</span>
          </button>

          {showGaps && (
            <dl className="mt-3 space-y-2.5 border-t border-slate-100 pt-3">
              {data.dataGaps.map((gap) => (
                <div key={gap.metric}>
                  <dt className="text-xs font-semibold text-slate-700">{gap.metric}</dt>
                  <dd className="mt-0.5 text-xs leading-relaxed text-slate-500">{gap.missing}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
