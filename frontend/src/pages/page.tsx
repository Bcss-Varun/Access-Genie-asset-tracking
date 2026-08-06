import { useState } from 'react';
import { useDashboardSummary, type DashboardFilters } from '@/api/dashboard';
import { usePreferences } from '@/api/preferences';
import { useSession } from '@/components/providers/SessionProvider';
import { useScope } from '@/components/providers/ScopeProvider';
import { CustomizePanel } from '@/components/dashboards/CustomizePanel';
import { FilterBar } from '@/components/dashboards/FilterBar';
import { KpiTile } from '@/components/dashboards/KpiTile';
import { TriageStrip } from '@/components/dashboards/TriageStrip';
import { WidgetBoundary } from '@/components/dashboards/WidgetFrame';
import { defaultLayoutFor, resolveDashboard } from '@/lib/dashboard/resolve';
import { cn, nowMs, relTime } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// The dashboard. One of them.
//
// There used to be a capability overview at `/` and a gallery at `/dashboards`
// fanning out to eight role dashboards — three clicks and two dead pages
// between signing in and a number. Then they were stacked into one long page,
// which was worse in a different way: eight KPI rows deep before the reader
// learned that three alerts were critical, and a Technician scrolling through
// Financial and Inventory bands full of zeros they hold no grant to read.
//
// This is the third answer and the one the page is built around: what needs
// attention, then the figures that carry a comparison, then a composition
// chosen by the role and adjustable by the person.
// ─────────────────────────────────────────────────────────────────────────────

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/**
 * How old the figures are.
 *
 * `relTime` renders the first minute as "0s ago", which on a control that
 * refreshes every sixty seconds reads like a stuck clock rather than fresh data.
 */
function freshness(generatedAt: string): string {
  return nowMs() - Date.parse(generatedAt) < 60_000 ? 'just now' : relTime(generatedAt);
}

export default function DashboardPage() {
  const { session } = useSession();
  const { scope, isSwitching } = useScope();
  const { data: preferences } = usePreferences();

  const [filters, setFilters] = useState<DashboardFilters>({ period: '30d' });
  const [customizing, setCustomizing] = useState(false);

  const { data: summary, isLoading, isFetching, refetch, error } = useDashboardSummary(filters);

  const saved = preferences?.dashboard ?? null;
  const layout = saved ?? defaultLayoutFor(session.role.id);
  const { kpis, main, rail } = resolveDashboard({
    roleId: session.role.id,
    modules: session.modules,
    saved,
    summary,
  });

  const firstName = session.user.name.split(' ')[0];

  return (
    <div className="space-y-5 pb-6">
      {/* Header — who, where, when, and the two controls that change all three */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-slate-500">
            <span className="font-medium text-slate-700">{scope.name}</span> · viewing as {session.role.name}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-60"
            title="Re-read the figures now"
          >
            <span className={cn(isFetching && 'animate-spin')} aria-hidden>
              ⟳
            </span>
            {/* The honest version of "real-time": say how old it is and offer to
                fetch again. There is no stream behind this yet. */}
            {summary ? freshness(summary.meta.generatedAt) : 'loading…'}
          </button>

          <button
            type="button"
            onClick={() => setCustomizing(true)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-primary-300 hover:text-primary-700"
          >
            Customize
          </button>
        </div>
      </div>

      <FilterBar filters={filters} onChange={setFilters} departments={summary?.meta.departments ?? []} />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-health-critical">
          The dashboard figures could not be loaded. {(error as Error).message}
        </div>
      )}

      {summary && <TriageStrip triage={summary.triage} />}

      {/* Headline figures */}
      {kpis.length > 0 && (
        <div
          // Four across, so eight tiles form two full rows rather than a row of
          // five and a ragged three.
          className={cn(
            'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
            (isLoading || isSwitching) && 'opacity-60',
          )}
        >
          {kpis.map((kpi) => (
            <KpiTile key={kpi.id} label={kpi.label} metric={summary?.kpis[kpi.id]} href={kpi.href} />
          ))}
        </div>
      )}

      {isLoading && !summary && <LoadingGrid />}

      {/* The composed dashboard: wide column, then the rail */}
      {summary && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="grid auto-rows-min grid-cols-1 gap-5 md:grid-cols-2 xl:col-span-2">
            {main.map(({ id, Component, wide }) => (
              <div key={id} className={cn(wide && 'md:col-span-2')}>
                <WidgetBoundary title={id}>
                  <Component summary={summary} />
                </WidgetBoundary>
              </div>
            ))}
            {main.length === 0 && (
              <p className="glass-panel rounded-xl p-6 text-center text-sm text-slate-400 md:col-span-2">
                No widgets in the main column — add some from Customize.
              </p>
            )}
          </div>

          <div className="grid auto-rows-min grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-1">
            {rail.map(({ id, Component }) => (
              <WidgetBoundary key={id} title={id}>
                <Component summary={summary} />
              </WidgetBoundary>
            ))}
          </div>
        </div>
      )}

      <CustomizePanel
        open={customizing}
        onClose={() => setCustomizing(false)}
        layout={layout}
        roleId={session.role.id}
        modules={session.modules}
        summary={summary}
      />
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className={cn('glass-panel h-56 animate-pulse rounded-xl bg-slate-100/60', i < 2 && 'xl:col-span-2')}
        />
      ))}
    </div>
  );
}
