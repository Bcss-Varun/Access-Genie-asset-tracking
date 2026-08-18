import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnalyticsSlice } from '@access-genie/shared';
import {
  EMPTY_ANALYTICS_FILTERS,
  activeAnalyticsFilterCount,
  useAnalyticsDashboard,
  type AnalyticsFilters,
} from '@/api/analytics';
import { ApiRequestError } from '@/api/client';
import { ErrorState, MetricCard, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { AnalyticsFilterBar } from '@/components/analytics/AnalyticsFilters';
import {
  BarList,
  ChartCard,
  DonutChart,
  NoData,
  SegmentedBar,
  TrendChart,
} from '@/components/analytics/charts';
import { formatByUnit, statusColor } from '@/components/analytics/tokens';
import { formatMoney, relTime } from '@/lib/utils';

/**
 * Analytics Dashboard — the whole estate on one screen.
 *
 * This screen owns no data and computes no figures. It holds a filter set;
 * everything it draws comes back from `GET /analytics/dashboard`, which
 * aggregates the collections the other modules write. Register an asset and it
 * is in these numbers on the next read; transfer one and the facility
 * distribution moves with it. There is nothing here to reconcile because there
 * is nothing here that is stored twice.
 *
 * It also stops short of the modules it summarises. There is no editing and no
 * status changes — every route out of here is a link into the screen that
 * already does that job. The dashboard's question is "where do I need to look".
 */

/** The four KPIs that lead. The rest are real but secondary — see below. */
const LEAD_KPIS = ['total-assets', 'total-value', 'under-maintenance', 'overdue-maintenance'] as const;

const KPI_ICONS: Record<string, string> = {
  'total-assets': '📦',
  'total-value': '💰',
  assigned: '🧑‍🔧',
  'under-maintenance': '🛠️',
  'due-maintenance': '📅',
  'overdue-maintenance': '⏰',
  'end-of-life': '⚠️',
  'recently-added': '✨',
  transfers: '🚚',
};

export default function AnalyticsDashboardPage() {
  const [filters, setFilters] = useState<AnalyticsFilters>(EMPTY_ANALYTICS_FILTERS);
  const query = useAnalyticsDashboard(filters);
  const data = query.data;

  const update = useCallback((next: Partial<AnalyticsFilters>) => setFilters((c) => ({ ...c, ...next })), []);
  const clear = useCallback(() => setFilters(EMPTY_ANALYTICS_FILTERS), []);

  /** Clicking a category bar filters the whole dashboard by it. */
  const toggleCategory = useCallback(
    (key: string) =>
      setFilters((c) => ({
        ...c,
        categories: c.categories.length === 1 && c.categories[0] === key ? [] : [key],
      })),
    [],
  );

  const lead = useMemo(() => (data?.kpis ?? []).filter((k) => (LEAD_KPIS as readonly string[]).includes(k.id)), [data]);
  const secondary = useMemo(
    () => (data?.kpis ?? []).filter((k) => !(LEAD_KPIS as readonly string[]).includes(k.id)),
    [data],
  );

  if (query.isError) {
    const err = query.error;
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics Dashboard" subtitle="Organisation-wide view of the asset estate." />
        <ErrorState
          title="Could not load analytics"
          description={err instanceof ApiRequestError ? err.message : 'The request failed. Please try again.'}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics Dashboard"
        subtitle="Organisation-wide view of the asset estate, aggregated live from the registry, maintenance and custody records."
        breadcrumb={[{ label: 'Analytics', href: '/analytics' }, { label: 'Dashboard' }]}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/reports">
              <Button variant="outline">Reports</Button>
            </Link>
            <Link to="/reports/builder">
              <Button>Build a report</Button>
            </Link>
          </div>
        }
      />

      <AnalyticsFilterBar
        filters={filters}
        options={data?.filterOptions}
        scopeName={data?.scope.name}
        onChange={update}
        onClear={clear}
        activeCount={activeAnalyticsFilterCount(filters)}
        right={
          data && (
            <span className="text-xs text-slate-400">
              Updated {relTime(data.generatedAt) || 'just now'}
              {query.isFetching && ' · refreshing'}
            </span>
          )
        }
      />

      {!data ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Four headline figures. The others are real too, but a strip of nine
              tiles is a wall rather than a summary — so the rest sit in a
              denser secondary row where they can still be read at a glance. */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {lead.map((kpi) => (
              <MetricCard
                key={kpi.id}
                icon={KPI_ICONS[kpi.id]}
                label={kpi.label}
                value={formatByUnit(kpi.value, kpi.unit)}
                sub={kpi.sub}
                tone={kpi.tone}
              />
            ))}
          </div>

          <div className="glass-panel grid grid-cols-2 divide-slate-100 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
            {secondary.map((kpi) => (
              <div key={kpi.id} className="px-4 py-3">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-heading text-xl font-semibold tabular-nums text-slate-900">
                    {formatByUnit(kpi.value, kpi.unit)}
                  </span>
                  {kpi.basis === 'flow' && (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">in range</span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-slate-600">{kpi.label}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-400" title={kpi.sub}>
                  {kpi.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Estate composition */}
          <div className="grid gap-5 lg:grid-cols-3">
            <ChartCard
              title="Assets by status"
              subtitle="Where the estate stands right now"
              className="lg:col-span-1"
            >
              <SegmentedBar
                segments={data.assetsByStatus.map((slice) => ({
                  key: slice.key,
                  label: slice.label,
                  value: slice.value,
                  color: statusColor(slice.key),
                }))}
              />
            </ChartCard>

            <ChartCard
              title="Assets by category"
              subtitle="Select a bar to narrow the whole dashboard"
              className="lg:col-span-1"
            >
              <BarList
                data={presentSlices(data.assetsByCategory).map((slice) => ({
                  key: slice.key,
                  label: slice.label,
                  value: slice.value,
                  caption: slice.secondary ? formatMoney(slice.secondary) : undefined,
                }))}
                onSelect={toggleCategory}
                selected={filters.categories[0] ?? null}
                emptyMessage="No assets in this selection"
              />
            </ChartCard>

            <ChartCard
              title="Asset value by category"
              subtitle="Book value, falling back to purchase price"
              className="lg:col-span-1"
            >
              <BarList
                data={data.valueByCategory.map((slice) => ({
                  key: slice.key,
                  label: slice.label,
                  value: slice.value,
                  caption: `${slice.secondary ?? 0} assets`,
                }))}
                format={formatMoney}
                emptyMessage="No value recorded against these assets"
              />
            </ChartCard>
          </div>

          {/* The estate by site. A table rather than a chart: six measures per
              facility is more than any single chart can carry honestly. */}
          <ChartCard
            title="Estate by facility"
            subtitle="Assets, value and open maintenance per site"
            action={
              data.assetsByFacility.length > 1 && (
                <span className="text-xs text-slate-400">{data.assetsByFacility.length} sites</span>
              )
            }
          >
            {data.assetsByFacility.length === 0 ? (
              <NoData message="No assets are placed in this part of the location tree" />
            ) : (
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      {['Facility', 'Assets', 'Value', 'Active', 'In maintenance', 'Open WOs', 'Overdue', 'Avg health'].map(
                        (heading, i) => (
                          <th
                            key={heading}
                            className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${
                              i === 0 ? '' : 'text-right'
                            }`}
                          >
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.assetsByFacility.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            className="font-medium text-slate-900 hover:text-primary-600"
                            onClick={() => update({ facility: row.id === 'unassigned' ? undefined : row.id })}
                            disabled={row.id === 'unassigned'}
                          >
                            {row.name}
                          </button>
                          <span className="ml-2 text-[11px] capitalize text-slate-400">{row.level}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{row.assets}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{formatMoney(row.value)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{row.active}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{row.underMaintenance}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{row.openWorkOrders}</td>
                        <td
                          className={`px-3 py-2.5 text-right tabular-nums ${
                            row.overdueWorkOrders > 0 ? 'font-semibold text-health-critical' : 'text-slate-700'
                          }`}
                        >
                          {row.overdueWorkOrders}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {row.avgHealth === null ? '—' : row.avgHealth}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>

          {/* Activity over time */}
          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="Assets added" subtitle={`Registrations · ${data.range.label.toLowerCase()}`}>
              <TrendChart
                labels={data.additions.map((p) => p.label)}
                series={[{ key: 'added', label: 'Assets added', points: data.additions.map((p) => p.value), fill: true }]}
                emptyMessage="No assets were registered in this period"
              />
            </ChartCard>

            <ChartCard
              title="Maintenance flow"
              subtitle="Work raised against work completed — is the backlog growing?"
            >
              <TrendChart
                labels={data.maintenance.trend.map((p) => p.label)}
                series={[
                  { key: 'raised', label: 'Raised', points: data.maintenance.trend.map((p) => p.value) },
                  { key: 'completed', label: 'Completed', points: data.maintenance.trend.map((p) => p.secondary ?? 0) },
                ]}
                emptyMessage="No maintenance activity in this period"
              />
            </ChartCard>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <ChartCard title="Maintenance by type" subtitle="All work orders in scope">
              <BarList
                data={data.maintenance.byType.map((slice) => ({ key: slice.key, label: slice.label, value: slice.value }))}
                emptyMessage="No work orders raised against these assets"
              />
            </ChartCard>

            <ChartCard title="Lifecycle stage" subtitle="Where assets sit in the workflow">
              <DonutChart
                data={data.assetsByLifecycle.map((slice, index) => ({
                  key: slice.key,
                  label: slice.label,
                  value: slice.value,
                  // A sequential ramp: lifecycle is an ordered progression, not
                  // a set of unrelated identities, so it gets one hue stepped by
                  // position rather than a categorical rainbow.
                  color: lifecycleShade(index, data.assetsByLifecycle.length),
                }))}
                totalLabel="Assets by lifecycle stage"
                emptyMessage="No assets in this selection"
              />
            </ChartCard>

            <ChartCard
              title="Transfer activity"
              subtitle={`Custody movements · ${data.range.label.toLowerCase()}`}
            >
              <TrendChart
                labels={data.transfers.trend.map((p) => p.label)}
                series={[{ key: 'transfers', label: 'Movements', points: data.transfers.trend.map((p) => p.value), fill: true }]}
                height={150}
                emptyMessage="No custody movements in this period"
              />
            </ChartCard>
          </div>

          {/* Recent activity */}
          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="Recently added assets" subtitle="Newest registrations in scope">
              {data.recentAssets.length === 0 ? (
                <NoData message="No assets registered yet" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.recentAssets.map((asset) => (
                    <li key={asset.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/assets/${asset.id}`}
                          className="block truncate text-sm font-medium text-slate-900 hover:text-primary-600"
                        >
                          {asset.name}
                        </Link>
                        <p className="truncate text-xs text-slate-500">
                          {asset.category} · {asset.facility} · {asset.custodian}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums text-slate-900">{formatMoney(asset.value)}</div>
                        <div className="text-[11px] text-slate-400">{relTime(asset.createdAt)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ChartCard>

            <ChartCard
              title="Recent transfers"
              subtitle="The custody chain, newest first"
              action={
                <Link to="/custody" className="text-xs font-medium text-primary-600 hover:text-primary-700">
                  Full chain →
                </Link>
              }
            >
              {data.transfers.recent.length === 0 ? (
                <NoData message="No custody movements recorded" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.transfers.recent.map((row) => (
                    <li key={row.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/assets/${row.assetId}`}
                          className="block truncate text-sm font-medium text-slate-900 hover:text-primary-600"
                        >
                          {row.assetName}
                        </Link>
                        <p className="truncate text-xs text-slate-500">
                          {row.action} to {row.holder} · by {row.by}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-400">{relTime(row.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ChartCard>
          </div>

          {/* What the schema cannot answer, stated rather than papered over. */}
          {data.dataGaps.length > 0 && (
            <details className="glass-panel px-5 py-4">
              <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                How these figures are counted ({data.dataGaps.length})
              </summary>
              <ul className="mt-3 space-y-1.5 text-xs text-slate-500">
                {data.dataGaps.map((gap) => (
                  <li key={gap} className="flex gap-2">
                    <span className="text-slate-300">•</span>
                    {gap}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** Drop the zero-valued members of an open vocabulary — a category nobody uses
 *  is noise, unlike a status nobody is in, which is a fact. */
const presentSlices = (slices: AnalyticsSlice[]) => slices.filter((s) => s.value > 0);

/** A single-hue ramp stepped by position in the lifecycle. */
function lifecycleShade(index: number, total: number): string {
  const shades = ['#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81'];
  if (total <= 1) return shades[3] as string;
  const step = Math.round((index / (total - 1)) * (shades.length - 1));
  return shades[step] as string;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid gap-5 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-xl" />
    </div>
  );
}
