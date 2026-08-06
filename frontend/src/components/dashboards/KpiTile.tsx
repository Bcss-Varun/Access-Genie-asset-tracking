import { Link } from 'react-router-dom';
import type { Metric } from '@access-genie/shared';
import { Sparkline, type ChartTone } from '@/components/charts/Sparkline';
import { cn, formatMoney } from '@/lib/utils';

/**
 * One headline figure.
 *
 * Three rules, all of them about not overstating what is known:
 *
 *   · `value === null` prints an em-dash. An estate with no PM schedules has no
 *     compliance percentage, and "0%" would report perfect failure.
 *   · The delta chip appears only when the server sent a `previous` — that is,
 *     only for metrics that measure a window and can honestly be compared with
 *     the window before it.
 *   · The sparkline appears only when the server sent a `series`. Stock figures
 *     (asset count, portfolio value) have no history in this system, and a line
 *     drawn through a single point would be decoration pretending to be data.
 */
export function KpiTile({
  label,
  metric,
  href,
  tone,
}: {
  label: string;
  metric: Metric | undefined;
  href?: string;
  tone?: ChartTone;
}) {
  if (!metric) return null;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <DeltaChip metric={metric} />
      </div>

      <div className="mt-1.5 font-heading text-2xl font-semibold leading-tight tabular-nums text-slate-900 sm:text-[26px]">
        {formatMetric(metric)}
      </div>

      {metric.caption && <div className="mt-1 text-xs text-slate-400">{metric.caption}</div>}

      {metric.series && metric.series.length > 1 && (
        <div className="mt-2.5">
          <Sparkline data={metric.series} tone={tone ?? deltaTone(metric)} />
        </div>
      )}
    </>
  );

  const className = cn(
    'glass-panel flex flex-col rounded-xl p-4 text-left transition-colors',
    href && 'hover:border-primary-300 hover:bg-primary-50/20',
  );

  return href ? (
    <Link to={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** "▲ 12%" / "▼ 3" — coloured by whether the movement is good news, not by its sign. */
export function DeltaChip({ metric }: { metric: Metric }) {
  if (metric.value === null || metric.previous === undefined) return null;

  const change = metric.value - metric.previous;
  if (change === 0) {
    return <span className="text-[11px] font-medium text-slate-400">no change</span>;
  }

  // A rise from zero has no percentage — "+∞%" is not a fact. Those show the
  // absolute movement instead.
  const asPct = metric.previous !== 0 ? Math.round((change / Math.abs(metric.previous)) * 100) : null;
  const good = change > 0 === (metric.higherIsBetter ?? true);

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
        good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-health-critical',
      )}
      title={`${formatValue(metric.previous, metric.unit)} in the previous period`}
    >
      <span aria-hidden>{change > 0 ? '▲' : '▼'}</span>
      {asPct === null ? formatValue(Math.abs(change), metric.unit) : `${Math.abs(asPct)}%`}
    </span>
  );
}

function deltaTone(metric: Metric): ChartTone {
  if (metric.value === null || metric.previous === undefined) return 'primary';
  const change = metric.value - metric.previous;
  if (change === 0) return 'slate';
  return change > 0 === (metric.higherIsBetter ?? true) ? 'emerald' : 'red';
}

export function formatMetric(metric: Metric): React.ReactNode {
  if (metric.value === null) return <span className="text-slate-300">—</span>;
  if (metric.unit === 'score') {
    return (
      <>
        {metric.value}
        <span className="text-lg text-slate-400">/100</span>
      </>
    );
  }
  return formatValue(metric.value, metric.unit);
}

export function formatValue(value: number, unit: Metric['unit']): string {
  switch (unit) {
    case 'inr':
      return formatMoney(value);
    case 'pct':
      return `${value}%`;
    case 'hours':
      return `${value} h`;
    case 'score':
      return `${value}`;
    default:
      return value.toLocaleString('en-IN');
  }
}
