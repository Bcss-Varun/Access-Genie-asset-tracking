import { Link } from 'react-router-dom';
import type { MaintenanceActivityEntry, MaintenanceSource } from '@access-genie/shared';
import { PanelEmpty, PanelSkeleton, SectionCard } from './shell';
import { formatRelative } from './format';

/**
 * What changed lately, across all three maintenance collections.
 *
 * Ordered by each record's own `updatedAt`, which is the only signal every
 * collection maintains — that is what puts a PM schedule edit and an inspection
 * result in the same feed as a work-order status change, none of which share an
 * event log. Where a work-order event *was* logged, the entry carries the name
 * of the person who made the change rather than whoever the record is assigned
 * to.
 */

const DOT: Record<MaintenanceSource, string> = {
  'work-order': 'bg-primary-500',
  'pm-schedule': 'bg-emerald-500',
  inspection: 'bg-slate-400',
};

export function ActivityFeed({
  entries,
  loading,
  now,
}: {
  entries: MaintenanceActivityEntry[];
  loading: boolean;
  /** Passed in so every relative time on the screen is measured from one instant. */
  now: number;
}) {
  return (
    <SectionCard title="Recent Maintenance Activity" hint="Most recently created, updated or closed records" bodyClassName="">
      {loading && entries.length === 0 ? (
        <div className="p-5">
          <PanelSkeleton rows={5} />
        </div>
      ) : entries.length === 0 ? (
        <PanelEmpty
          icon="🗒️"
          message="Nothing has changed yet"
          hint="Raising, updating or closing a work order, PM schedule or inspection puts it here."
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                to={entry.href}
                className="flex items-start gap-3 px-5 py-2.5 transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[entry.source]}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-700">{entry.description}</p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">
                    {entry.actor} · {entry.assetName} · {entry.facilityName}
                  </p>
                </div>
                <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-400">
                  {formatRelative(entry.at, now)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
