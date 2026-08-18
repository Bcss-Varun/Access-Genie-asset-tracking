import type { MaintenanceKind, MaintenanceTypeSlice } from '@access-genie/shared';
import { Donut } from '@/components/charts/Donut';
import { TONE_HEX } from '@/components/charts/Sparkline';
import { cn } from '@/lib/utils';
import { PanelEmpty, PanelSkeleton, SectionCard } from './shell';

/**
 * What the maintenance load is actually made of.
 *
 * Only kinds with records are drawn — the server drops the empty ones — so an
 * estate that has never run an inspection shows three wedges, not four with one
 * of width zero. That is the difference between "we do no inspections" being
 * visible and being hidden behind a legend entry.
 *
 * Each kind is also a button: pressing it filters the whole screen to that
 * kind, which is the chart-segment drill-down.
 */

const KIND_COLOR: Record<MaintenanceKind, string> = {
  Corrective: TONE_HEX.amber,
  Preventive: TONE_HEX.emerald,
  Predictive: TONE_HEX.primary,
  Inspection: TONE_HEX.slate,
};

const SOURCE_LABEL: Record<string, string> = {
  'work-order': 'work orders',
  'pm-schedule': 'PM schedules',
  inspection: 'inspections',
};

export function TypeMix({
  slices,
  activeKinds,
  onSelect,
  loading,
}: {
  slices: MaintenanceTypeSlice[];
  activeKinds: MaintenanceKind[];
  onSelect: (kind: MaintenanceKind) => void;
  loading: boolean;
}) {
  const body = () => {
    if (loading && slices.length === 0) return <PanelSkeleton rows={4} />;
    if (slices.length === 0) {
      return (
        <PanelEmpty
          icon="🍩"
          message="No maintenance records in scope"
          hint="Corrective, preventive, predictive and inspection work all appear here once records exist."
        />
      );
    }

    return (
      <>
        <Donut
          slices={slices.map((slice) => ({
            label: slice.kind,
            value: slice.total,
            color: KIND_COLOR[slice.kind],
            caption: `${slice.open} open`,
          }))}
          totalLabel="records"
          // Stacked, not side by side: this panel sits in a third of the row,
          // and the ring plus a legend beside it leaves the legend narrow
          // enough to truncate "Preventive" to "Pre…".
          className="!flex-col !items-center"
        />

        <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
          {slices.map((slice) => {
            const active = activeKinds.includes(slice.kind);
            return (
              <li key={slice.kind}>
                <button
                  type="button"
                  onClick={() => onSelect(slice.kind)}
                  aria-pressed={active}
                  className={cn(
                    'flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                    active ? 'bg-primary-50 ring-1 ring-primary-100' : 'hover:bg-slate-50',
                  )}
                >
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: KIND_COLOR[slice.kind] }} />
                  <span className="shrink-0 font-medium text-slate-700">{slice.kind}</span>
                  {/* Where the count came from — a Preventive wedge fed by both
                      work orders and schedules should say so, not leave the
                      reader to guess which collection it is looking at. */}
                  <span className="min-w-0 flex-1 truncate text-slate-400">
                    {slice.sources.map((s) => `${s.count} ${SOURCE_LABEL[s.source] ?? s.source}`).join(' · ')}
                  </span>
                  {slice.overdue > 0 && (
                    <span className="shrink-0 font-semibold tabular-nums text-health-critical">{slice.overdue} overdue</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </>
    );
  };

  return (
    <SectionCard title="Maintenance Type" hint="Distribution across the records in scope">
      {body()}
    </SectionCard>
  );
}
