import type { MaintenanceKpi, MaintenanceKpiId } from '@access-genie/shared';
import type { Tone } from '@/lib/tone';
import { cn } from '@/lib/utils';

/**
 * The seven headline figures.
 *
 * Each tile is a button, and pressing it applies that KPI's filter to the whole
 * screen rather than navigating away. That is the drill-down that is actually
 * true here: `/maintenance` and `/pm` do not read filters from the URL, so a
 * link to `/maintenance?priority=Critical` would land on an unfiltered board
 * and quietly lie about having drilled in. Narrowing in place is honest, and
 * every row of the tables below still links to its own real record.
 *
 * `basis` is printed on the tile. Backlog ("open", "overdue") is true as of
 * now and does not move with the date range; activity ("completed") does. A
 * dashboard that hides that distinction gets its range selector reported as
 * broken every time a stock figure sensibly holds still.
 */

const TONES: Record<MaintenanceKpiId, { tone: Tone; icon: string }> = {
  open: { tone: 'primary', icon: '📋' },
  overdue: { tone: 'red', icon: '⏰' },
  critical: { tone: 'red', icon: '🚨' },
  'in-progress': { tone: 'amber', icon: '🛠️' },
  completed: { tone: 'emerald', icon: '✅' },
  'preventive-due': { tone: 'amber', icon: '🔁' },
  'failed-corrective': { tone: 'red', icon: '⚠️' },
};

const RAIL: Record<Tone, string> = {
  slate: 'bg-slate-300',
  primary: 'bg-primary-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-health-critical',
};

const VALUE: Record<Tone, string> = {
  slate: 'text-slate-900',
  primary: 'text-slate-900',
  emerald: 'text-slate-900',
  amber: 'text-slate-900',
  red: 'text-health-critical',
};

export function KpiStrip({
  kpis,
  activeId,
  onSelect,
  loading,
}: {
  kpis: MaintenanceKpi[];
  activeId: MaintenanceKpiId | null;
  onSelect: (id: MaintenanceKpiId) => void;
  loading: boolean;
}) {
  if (loading && kpis.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="glass-panel h-[104px] animate-pulse p-4" aria-hidden />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {kpis.map((kpi) => {
        const { tone, icon } = TONES[kpi.id];
        const active = activeId === kpi.id;
        // A zero backlog is good news, not an alarm — a red rail on "0 overdue"
        // trains people to ignore the colour.
        const effectiveTone: Tone = kpi.value === 0 && tone === 'red' ? 'slate' : tone;

        return (
          <button
            key={kpi.id}
            type="button"
            onClick={() => onSelect(kpi.id)}
            aria-pressed={active}
            title={kpi.note ?? `Filter the dashboard by ${kpi.label}`}
            className={cn(
              'glass-panel relative overflow-hidden p-4 pl-5 text-left transition-shadow',
              'hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
              active && 'border-primary-300 ring-1 ring-primary-200',
            )}
          >
            <span className={cn('absolute inset-y-0 left-0 w-1', RAIL[effectiveTone])} />

            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-slate-500">
                {kpi.label}
              </span>
              <span className="shrink-0 text-sm leading-none opacity-60" aria-hidden>
                {icon}
              </span>
            </div>

            <div className={cn('mt-1 font-heading text-3xl font-bold leading-none tabular-nums', VALUE[effectiveTone])}>
              {kpi.value.toLocaleString('en-IN')}
            </div>

            <div className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-slate-400">
              <span className={cn('h-1 w-1 rounded-full', kpi.basis === 'now' ? 'bg-slate-400' : 'bg-primary-400')} />
              {kpi.basis === 'now' ? 'as of now' : 'in date range'}
              {kpi.note && (
                <span className="text-amber-500" role="img" aria-label="partial">
                  ⓘ
                </span>
              )}
            </div>

            {/* What the total is made of. The reason a number never has to be
                taken on trust, and the reason nobody has to run a query to
                find out which source the count came from. */}
            <dl className="mt-2 space-y-0.5 border-t border-slate-100 pt-2">
              {kpi.breakdown.map((part) => (
                <div key={part.label} className="flex items-baseline justify-between gap-2 text-[11px]">
                  <dt className="min-w-0 truncate text-slate-400">{part.label}</dt>
                  <dd className="shrink-0 font-semibold tabular-nums text-slate-600">{part.value}</dd>
                </div>
              ))}
            </dl>
          </button>
        );
      })}
    </div>
  );
}
