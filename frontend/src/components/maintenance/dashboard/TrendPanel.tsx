import type { MaintenanceDashboardRange, MaintenanceTrendPoint } from '@access-genie/shared';
import { MultiLine } from '@/components/charts/MultiLine';
import { TONE_HEX } from '@/components/charts/Sparkline';
import { PanelEmpty, PanelSkeleton, SectionCard, SectionLink } from './shell';
import { formatDate } from './format';

/**
 * Maintenance activity over the selected range.
 *
 * Three series, and they answer one question between them: is the estate
 * keeping up. `Raised` against `Completed` is the backlog moving; `Due` is what
 * was scheduled to land, which is what separates "quiet month" from "quiet
 * month because nothing was scheduled".
 *
 * The bucket width is the server's choice, not this component's — daily up to a
 * month, weekly to six, monthly beyond — so the chart draws exactly the buckets
 * it was given rather than always drawing twelve of something.
 */
export function TrendPanel({
  trend,
  range,
  loading,
  filtersActive,
}: {
  trend: MaintenanceTrendPoint[];
  range: MaintenanceDashboardRange | undefined;
  loading: boolean;
  /** Whether anything is narrowing the view — decides which advice the empty state gives. */
  filtersActive: boolean;
}) {
  const granularity = range ? { day: 'daily', week: 'weekly', month: 'monthly' }[range.granularity] : '';
  const hint = range ? `${trend.length} ${granularity} buckets · ${formatDate(range.from)} – ${formatDate(range.to)}` : undefined;

  const totals = trend.reduce(
    (sum, point) => ({
      raised: sum.raised + point.raised,
      completed: sum.completed + point.completed,
      due: sum.due + point.due,
    }),
    { raised: 0, completed: 0, due: 0 },
  );

  const body = () => {
    if (loading && trend.length === 0) return <PanelSkeleton rows={5} />;
    if (trend.length === 0) return <PanelEmpty icon="📈" message="No range to chart" hint="Pick a date range above." />;

    // A chart of nothing is a flat line at zero pretending to be a measurement.
    if (totals.raised + totals.completed + totals.due === 0) {
      return (
        <PanelEmpty
          icon="📈"
          message="No maintenance activity in this range"
          hint={
            filtersActive
              ? 'Nothing was raised, completed or due in this cut. Widen the date range or clear a filter.'
              : 'Nothing has been raised yet. Work orders, PM schedules and inspections all appear here once they exist.'
          }
        />
      );
    }

    return (
      <>
        <MultiLine
          labels={trend.map((p) => p.label)}
          series={[
            { label: 'Raised', color: TONE_HEX.primary, points: trend.map((p) => p.raised), fill: true },
            { label: 'Completed', color: TONE_HEX.emerald, points: trend.map((p) => p.completed) },
            { label: 'Due', color: TONE_HEX.amber, points: trend.map((p) => p.due) },
          ]}
          // Counts, so no decimals on the axis — `1.5 work orders` is not a
          // thing, and a fractional gridline label makes people distrust the
          // number above it.
          format={(n) => String(Math.round(n))}
        />

        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3">
          {[
            { label: 'Raised', value: totals.raised, color: TONE_HEX.primary },
            { label: 'Completed', value: totals.completed, color: TONE_HEX.emerald },
            { label: 'Fell due', value: totals.due, color: TONE_HEX.amber },
          ].map((total) => (
            <div key={total.label}>
              <dt className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: total.color }} />
                {total.label}
              </dt>
              <dd className="mt-0.5 font-heading text-lg font-bold tabular-nums text-slate-900">{total.value}</dd>
            </div>
          ))}
        </dl>
      </>
    );
  };

  return (
    <SectionCard title="Maintenance Trend" hint={hint} action={<SectionLink to="/maintenance">Work orders</SectionLink>}>
      {body()}
    </SectionCard>
  );
}
