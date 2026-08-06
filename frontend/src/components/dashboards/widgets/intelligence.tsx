import { Link } from 'react-router-dom';
import type { KpiId } from '@access-genie/shared';
import { HBars, insightEmoji } from '@/components/dashboards/DashboardKit';
import { KPI_META } from '@/lib/dashboard/registry';
import { WidgetEmpty, WidgetFrame } from '@/components/dashboards/WidgetFrame';
import { TrendArea } from '@/components/charts/TrendArea';
import { formatValue } from '@/components/dashboards/KpiTile';
import { insightsApi } from '@/api/insights';
import { useMutate } from '@/api/mutate';
import { allInsights } from '@/lib/dataset';
import { cn, formatMoney } from '@/lib/utils';
import type { WidgetProps } from './types';

const RISK_COLORS = ['#10b981', '#f59e0b', '#f97316', '#ef4444'];

/** How risk is spread across the estate — four bands, not one average. */
export function RiskDistribution({ summary }: WidgetProps) {
  const rows = (summary.charts.riskDistribution ?? []).map((b, i) => ({
    label: b.label,
    value: b.value,
    color: RISK_COLORS[i] ?? '#94a3b8',
  }));
  const atRisk = summary.kpis.assetsAtRisk?.value ?? 0;

  return (
    <WidgetFrame title="Risk distribution" icon="🎯" href="/ai/predictive" linkLabel="Predictive">
      {rows.every((r) => r.value === 0) ? (
        <WidgetEmpty>No scored assets in this scope.</WidgetEmpty>
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <HBars data={rows} />
          <p className="mt-5 text-xs text-slate-400">{atRisk} above the risk-60 action threshold.</p>
        </div>
      )}
    </WidgetFrame>
  );
}

/** Fleet utilization against logged maintenance downtime, over the selected period. */
export function UtilizationTrend({ summary }: WidgetProps) {
  const points = (summary.charts.utilizationDowntime ?? []).map((p) => ({
    label: p.label,
    line: p.utilization,
    bar: p.downtime,
  }));

  return (
    <WidgetFrame
      title="Utilization vs downtime"
      subtitle="fleet average against logged labour"
      icon="📈"
      href="/ai/utilization"
      linkLabel="Utilization"
    >
      <TrendArea
        points={points}
        lineLabel="Utilization"
        barLabel="Downtime"
        formatBar={(n) => `${n} h`}
        tone="amber"
      />
    </WidgetFrame>
  );
}

/**
 * The ranked insight feed, with the two actions that matter on each row.
 *
 * Act and dismiss go through `useMutate`, so they persist and every other
 * screen re-reads — the same path the AI Insights screen uses. A dashboard that
 * only ever links away is a report; this one closes the loop.
 */
export function AiInsights() {
  const { run } = useMutate();
  const insights = [...allInsights].sort((a, b) => (b.impactInr ?? 0) - (a.impactInr ?? 0)).slice(0, 4);

  return (
    <WidgetFrame title="AI insights" icon="✨" href="/ai-insights" linkLabel="All insights">
      {insights.length === 0 ? (
        <WidgetEmpty>No open insights for this scope.</WidgetEmpty>
      ) : (
        <ul className="space-y-2.5">
          {insights.map((ins) => (
            <li key={ins.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start gap-2.5">
                <span className="text-lg" aria-hidden>
                  {insightEmoji[ins.type]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link to="/ai-insights" className="truncate text-sm font-semibold text-slate-900 hover:text-primary-600">
                      {ins.title}
                    </Link>
                    {ins.impactInr ? (
                      <span className="shrink-0 text-xs font-semibold text-emerald-600">{formatMoney(ins.impactInr)}</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{ins.summary}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void run(insightsApi.action(ins.id), {
                          success: ins.actionLabel ?? 'Insight actioned',
                          describe: 'act on this insight',
                        })
                      }
                      className="rounded-md bg-primary-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-700"
                    >
                      {ins.actionLabel ?? 'Act'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void run(insightsApi.dismiss(ins.id), {
                          success: 'Insight dismissed',
                          describe: 'dismiss this insight',
                        })
                      }
                      className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100"
                    >
                      Dismiss
                    </button>
                    <span className="ml-auto text-[11px] text-slate-400">{ins.confidence}% confidence</span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

/**
 * "What changed" in a sentence.
 *
 * Composed from the summary's own deltas — the three largest movements, in
 * plain English. It is labelled a summary rather than dressed up as a model
 * call, because no model runs in this build: the AI collections are seeded
 * fixtures (docs/24-build-status.md §5.7). Saying so is the difference between
 * a feature and a lie.
 */
export function AiNarrative({ summary }: WidgetProps) {
  // Phrased for a sentence — "open work orders rose" reads; "openWorkOrders
  // rose" does not. Anything without a phrasing falls back to the tile's own
  // label rather than to the raw id, so a metric added later still reads as
  // English before anyone remembers to add it here.
  const PHRASING: Partial<Record<KpiId, string>> = {
    openWorkOrders: 'open work orders',
    overdueWorkOrders: 'overdue work orders',
    completedWorkOrders: 'work orders closed',
    mttrHours: 'mean time to repair',
    mtbfDays: 'mean time between failures',
    maintenanceCost: 'maintenance spend',
    openAlerts: 'open alerts',
    alertResponseMins: 'alert response time',
    movementVolume: 'asset movements',
    myClosedThisPeriod: 'work you closed',
  };

  const movements = Object.entries(summary.kpis)
    .filter(([, m]) => m?.value !== null && m?.previous !== undefined && m.previous !== m.value)
    .map(([id, m]) => {
      const change = (m.value as number) - (m.previous as number);
      const magnitude = m.previous === 0 ? Math.abs(change) * 100 : Math.abs(change / (m.previous as number)) * 100;
      const key = id as KpiId;
      return {
        id,
        label: PHRASING[key] ?? KPI_META[key]?.label.toLowerCase() ?? id,
        change,
        magnitude,
        metric: m,
      };
    })
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 3);

  const { triage } = summary;
  const pressing =
    triage.criticalAlerts > 0
      ? `${triage.criticalAlerts} critical alert${triage.criticalAlerts === 1 ? '' : 's'} still open`
      : triage.overdueWorkOrders > 0
        ? `${triage.overdueWorkOrders} work order${triage.overdueWorkOrders === 1 ? '' : 's'} past due`
        : null;

  return (
    <WidgetFrame title="What changed" subtitle="derived from this period's figures" icon="🧾">
      {movements.length === 0 && !pressing ? (
        <WidgetEmpty>Nothing moved materially in this period.</WidgetEmpty>
      ) : (
        <div className="space-y-3 text-sm leading-relaxed text-slate-600">
          {movements.length > 0 && (
            <p>
              Across <span className="font-medium text-slate-800">{summary.meta.scopeName}</span>,{' '}
              {movements.map((m, i) => (
                <span key={m.id}>
                  {i > 0 && (i === movements.length - 1 ? ' and ' : ', ')}
                  {m.label}{' '}
                  <span className={cn('font-semibold', m.change > 0 ? 'text-slate-900' : 'text-slate-900')}>
                    {m.change > 0 ? 'rose' : 'fell'} to {formatValue(m.metric.value as number, m.metric.unit)}
                  </span>{' '}
                  <span className="text-slate-400">
                    (from {formatValue(m.metric.previous as number, m.metric.unit)})
                  </span>
                </span>
              ))}
              .
            </p>
          )}
          {pressing && (
            <p className="rounded-lg bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-800">
              Still needing attention: {pressing}.
            </p>
          )}
          <p className="text-[11px] text-slate-400">
            Written from the figures on this page — no model is involved.
          </p>
        </div>
      )}
    </WidgetFrame>
  );
}
