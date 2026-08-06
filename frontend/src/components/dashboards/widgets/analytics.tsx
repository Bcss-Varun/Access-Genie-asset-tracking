import { Link } from 'react-router-dom';
import { Gauge } from '@/components/charts/Gauge';
import { MultiLine } from '@/components/charts/MultiLine';
import { StackedBars } from '@/components/charts/StackedBars';
import { HBars } from '@/components/dashboards/DashboardKit';
import { WidgetEmpty, WidgetFrame } from '@/components/dashboards/WidgetFrame';
import { formatDate, formatMoney } from '@/lib/utils';
import type { WidgetProps } from './types';

/** Where the estate physically sits — the ten busiest locations. */
export function AssetsByLocation({ summary }: WidgetProps) {
  const rows = summary.charts.topLocations ?? [];

  return (
    <WidgetFrame
      title="Assets by location"
      subtitle={rows.length > 9 ? 'top 10' : undefined}
      icon="📍"
      href="/tracking"
      linkLabel="Live tracking"
    >
      {rows.length === 0 ? (
        <WidgetEmpty>Nothing located in this scope.</WidgetEmpty>
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <HBars data={rows} barClassName="bg-primary-400" />
        </div>
      )}
    </WidgetFrame>
  );
}

/**
 * What is about to need a decision.
 *
 * Every row is backed by a field that exists. The design this follows also
 * listed *calibration due* and *insurance expiring*; neither is modelled
 * anywhere in this system, and a count invented for them would be read and
 * acted on as though it were real.
 */
export function LifecycleOverview({ summary }: WidgetProps) {
  const rows = summary.charts.lifecycle ?? [];

  const ICONS: Record<string, string> = {
    eol: '⚠️',
    depreciated: '💸',
    warranty: '🛡️',
    amc: '📄',
    lease: '🔁',
  };

  const HREFS: Record<string, string> = {
    eol: '/lifecycle',
    depreciated: '/financials',
    warranty: '/lifecycle',
    amc: '/lifecycle',
    lease: '/lifecycle',
  };

  return (
    <WidgetFrame title="Asset lifecycle" subtitle="what needs a decision" icon="♻️" href="/lifecycle" linkLabel="Lifecycle">
      {rows.length === 0 ? (
        <WidgetEmpty>Nothing approaching a threshold.</WidgetEmpty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.key}>
              <Link
                to={HREFS[row.key] ?? '/lifecycle'}
                className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-slate-50"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden>{ICONS[row.key] ?? '•'}</span>
                  <span className="truncate text-sm text-slate-600">{row.label}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{row.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

const WORK_TYPES = [
  { key: 'preventive', label: 'Preventive', color: '#10b981' },
  { key: 'corrective', label: 'Corrective', color: '#ef4444' },
  { key: 'predictive', label: 'Predictive', color: '#6366f1' },
  { key: 'inspection', label: 'Inspection', color: '#94a3b8' },
];

/**
 * Six months of maintenance: what kind of work, and what it cost.
 *
 * Cost lands in the month the work *finished*, which is when it was spent —
 * parts consumed plus labour at the organisation's configured rate. The header
 * repeats the reliability figures so this reads as one panel rather than as a
 * chart needing four tiles elsewhere to explain it.
 */
export function MaintenanceAnalytics({ summary }: WidgetProps) {
  const months = summary.charts.maintenanceByMonth ?? [];
  const hasWork = months.some((m) => m.preventive + m.corrective + m.predictive + m.inspection > 0);

  const stats = [
    { label: 'Open', metric: summary.kpis.openWorkOrders, tone: 'text-health-critical' },
    { label: 'Closed', metric: summary.kpis.completedWorkOrders, tone: 'text-emerald-600' },
    { label: 'MTTR', metric: summary.kpis.mttrHours, tone: 'text-slate-800' },
    { label: 'MTBF', metric: summary.kpis.mtbfDays, tone: 'text-slate-800' },
    { label: 'Cost', metric: summary.kpis.maintenanceCost, tone: 'text-slate-800' },
  ].filter((s) => s.metric !== undefined);

  const unitOf = (unit: string | undefined, value: number) =>
    unit === 'inr' ? formatMoney(value) : unit === 'hours' ? `${value} h` : unit === 'count' ? `${value}` : `${value}`;

  return (
    <WidgetFrame
      title="Maintenance analytics"
      subtitle="last 6 months"
      icon="🔧"
      href="/maintenance"
      linkLabel="Work orders"
    >
      {stats.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{stat.label}</div>
              <div className={`text-lg font-semibold tabular-nums ${stat.tone}`}>
                {stat.metric?.value === null
                  ? '—'
                  : unitOf(stat.metric?.unit, stat.metric?.value ?? 0)}
              </div>
              {stat.label === 'MTBF' && stat.metric?.value !== null && (
                <div className="text-[10px] text-slate-400">days between failures</div>
              )}
            </div>
          ))}
        </div>
      )}

      {!hasWork ? (
        <WidgetEmpty>No maintenance raised in the last six months.</WidgetEmpty>
      ) : (
        <StackedBars
          labels={months.map((m) => m.label)}
          series={WORK_TYPES}
          rows={months.map((m) => ({
            preventive: m.preventive,
            corrective: m.corrective,
            predictive: m.predictive,
            inspection: m.inspection,
          }))}
          line={{ label: 'Cost', color: '#f59e0b', points: months.map((m) => m.cost) }}
          formatLine={formatMoney}
        />
      )}
    </WidgetFrame>
  );
}

/**
 * Health, utilization and risk over time.
 *
 * These three are the only figures on the dashboard whose history had to be
 * *recorded* rather than derived — they are materialised scores, overwritten on
 * every derivation pass. So this chart fills in from the day snapshots start,
 * and says so until it has something to draw. The alternative — a line through
 * one point, or through numbers nobody measured — would be worse than an empty
 * card.
 */
export function ScoreHistory({ summary }: WidgetProps) {
  const rows = summary.charts.scoreHistory ?? [];

  return (
    <WidgetFrame title="Health & utilization trend" subtitle="daily average" icon="💚" href="/ai/health" linkLabel="Fleet health">
      {rows.length < 2 ? (
        <WidgetEmpty icon="⏳">
          {rows.length === 0
            ? 'Collecting from today — health and utilization have no history to reconstruct.'
            : `Collecting since ${formatDate(rows[0]?.at ?? '')} — one more day and this becomes a trend.`}
        </WidgetEmpty>
      ) : (
        <MultiLine
          labels={rows.map((r) => formatDate(r.at))}
          series={[
            { label: 'Health', color: '#10b981', points: rows.map((r) => r.health), fill: true },
            { label: 'Utilization', color: '#6366f1', points: rows.map((r) => r.utilization) },
            { label: 'Risk', color: '#ef4444', points: rows.map((r) => r.risk) },
          ]}
          format={(n) => `${Math.round(n)}`}
        />
      )}
    </WidgetFrame>
  );
}

const BAND_COLORS: Record<string, string> = {
  'High (>80%)': '#10b981',
  'Medium (50–80%)': '#f59e0b',
  'Low (<50%)': '#ef4444',
};

/** Fleet utilization, its spread, and the assets earning their keep least. */
export function UtilizationPanel({ summary }: WidgetProps) {
  const bands = summary.charts.utilizationBands ?? [];
  const underutilized = summary.lists.underutilized ?? [];
  const average = summary.kpis.avgUtilization?.value ?? null;
  const total = bands.reduce((s, b) => s + b.value, 0);

  return (
    <WidgetFrame title="Asset utilization" icon="⚖️" href="/ai/utilization" linkLabel="Utilization">
      {total === 0 ? (
        <WidgetEmpty>No assets in this scope.</WidgetEmpty>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          <Gauge value={average} label="Average utilization" />

          <HBars
            data={bands.map((b) => ({
              label: b.label,
              value: b.value,
              color: BAND_COLORS[b.label] ?? '#94a3b8',
              caption: `${Math.round((b.value / total) * 100)}%`,
            }))}
          />

          {underutilized.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Least used</span>
                <Link to="/ai/utilization" className="text-[11px] font-medium text-primary-600 hover:underline">
                  View all →
                </Link>
              </div>
              <ul className="space-y-1">
                {underutilized.slice(0, 3).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                    <Link to={`/assets/${a.id}`} className="min-w-0 truncate text-slate-600 hover:text-primary-600">
                      {a.name}
                    </Link>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-500">{a.utilization}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </WidgetFrame>
  );
}
