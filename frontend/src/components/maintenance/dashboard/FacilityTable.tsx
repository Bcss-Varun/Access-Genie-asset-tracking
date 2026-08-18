import type { FacilityPerformanceRow } from '@access-genie/shared';
import { cn } from '@/lib/utils';
import { MiniBar, PanelEmpty, PanelSkeleton, SectionCard, SectionLink } from './shell';

/**
 * Which sites need attention, ranked.
 *
 * Sorted by the server on overdue and critical rather than on volume: the
 * biggest warehouse is always going to have the most open work, and a table
 * that ranks by that tells a Super Admin nothing they did not already know. A
 * small site with three overdue critical jobs is the row worth surfacing.
 *
 * Every facility holding assets gets a row, including the quiet ones — "this
 * site has nothing outstanding" is a finding, and a table that only lists sites
 * with problems cannot show it. Clicking a row filters the dashboard to that
 * facility.
 */
export function FacilityTable({
  rows,
  activeFacility,
  onSelect,
  loading,
}: {
  rows: FacilityPerformanceRow[];
  activeFacility: string | undefined;
  onSelect: (facilityId: string | null) => void;
  loading: boolean;
}) {
  const busiest = Math.max(1, ...rows.map((r) => r.open + r.overdue));

  const body = () => {
    if (loading && rows.length === 0) return <PanelSkeleton rows={4} />;
    if (rows.length === 0) {
      return (
        <PanelEmpty
          icon="🏭"
          message="No facilities with assets in scope"
          hint="A facility appears here once an asset records a location beneath it."
        />
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-5 py-2.5">Facility</th>
              <th className="px-3 py-2.5 text-right">Assets</th>
              <th className="px-3 py-2.5 text-right">Open</th>
              <th className="px-3 py-2.5 text-right">Overdue</th>
              <th className="px-3 py-2.5 text-right">Critical</th>
              <th className="px-3 py-2.5 text-right">In Progress</th>
              <th className="px-3 py-2.5 text-right">Completed</th>
              <th className="w-28 px-5 py-2.5">Load</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              // "Unassigned" is a bucket, not a place — it cannot be filtered
              // to, because there is no scope node behind it.
              const selectable = row.level !== 'unassigned';
              const active = activeFacility === row.facilityId;

              return (
                <tr
                  key={row.facilityId}
                  onClick={() => selectable && onSelect(active ? null : row.facilityId)}
                  className={cn(
                    'transition-colors',
                    selectable && 'cursor-pointer hover:bg-slate-50',
                    active && 'bg-primary-50/60',
                  )}
                >
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-800">{row.facilityName}</div>
                    <div className="text-[11px] capitalize text-slate-400">
                      {row.level === 'unassigned' ? 'Assets with no location in the scope tree' : row.level}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-500">{row.assets}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-800">{row.open}</td>
                  <td
                    className={cn(
                      'px-3 py-3 text-right font-semibold tabular-nums',
                      row.overdue > 0 ? 'text-health-critical' : 'text-slate-300',
                    )}
                  >
                    {row.overdue}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-3 text-right font-semibold tabular-nums',
                      row.critical > 0 ? 'text-health-critical' : 'text-slate-300',
                    )}
                  >
                    {row.critical}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-3 text-right tabular-nums',
                      row.inProgress > 0 ? 'text-amber-600' : 'text-slate-300',
                    )}
                  >
                    {row.inProgress}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-3 text-right tabular-nums',
                      row.completed > 0 ? 'text-emerald-600' : 'text-slate-300',
                    )}
                  >
                    {row.completed}
                  </td>
                  <td className="px-5 py-3">
                    <MiniBar
                      value={row.open + row.overdue}
                      max={busiest}
                      tone={row.overdue > 0 ? 'red' : row.open > 0 ? 'primary' : 'emerald'}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <SectionCard
      title="Facility Performance"
      hint="Ranked by outstanding and overdue work — select a row to narrow the dashboard"
      action={<SectionLink to="/admin/facilities">Facilities</SectionLink>}
      bodyClassName=""
    >
      {body()}
    </SectionCard>
  );
}
