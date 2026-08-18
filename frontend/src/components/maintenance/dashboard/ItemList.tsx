import { Link } from 'react-router-dom';
import type { MaintenanceItem, MaintenanceSource } from '@access-genie/shared';
import { Badge } from '@/components/ui/primitives';
import { priorityTone } from '@/lib/tone';
import { cn } from '@/lib/utils';
import { PanelEmpty, PanelSkeleton, SectionCard, SectionLink } from './shell';
import { describeDue, formatDateShort } from './format';

/**
 * The two attention lists — what is late, and what is next.
 *
 * One component because they are the same row: a record, the asset and facility
 * it belongs to, its priority and status, and when it is due. Only the sort and
 * the empty state differ, and both are passed in.
 *
 * Every row is a link to the record's own screen in the module that owns it, so
 * this stays a summary: the dashboard says *which* job needs looking at, and
 * the work of looking at it happens where it always did.
 */

const SOURCE_BADGE: Record<MaintenanceSource, { label: string; icon: string }> = {
  'work-order': { label: 'Work order', icon: '🔧' },
  'pm-schedule': { label: 'PM schedule', icon: '🔁' },
  inspection: { label: 'Inspection', icon: '🔎' },
};

function ItemRow({ item }: { item: MaintenanceItem }) {
  const source = SOURCE_BADGE[item.source];

  return (
    <li>
      <Link
        to={item.href}
        className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
      >
        <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>
          {source.icon}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium text-slate-800">{item.title}</span>
            <span className="shrink-0 font-mono text-[10px] text-slate-400">{item.id}</span>
          </div>

          <div className="mt-0.5 truncate text-xs text-slate-500">
            {item.assetName} · {item.facilityName}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* Only work orders carry a priority; the other two collections
                have no such field, so the badge is absent rather than showing
                an invented default. */}
            {item.priority && (
              <Badge tone={priorityTone[item.priority]} className="!px-2 !py-0 !text-[10px]">
                {item.priority}
              </Badge>
            )}
            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              {item.nativeStatus}
            </span>
            <span className="text-[10px] text-slate-400">{source.label}</span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className={cn('text-xs font-semibold', item.overdue ? 'text-health-critical' : 'text-slate-600')}>
            {describeDue(item.daysOverdue, item.overdue)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">{formatDateShort(item.dueDate)}</div>
        </div>
      </Link>
    </li>
  );
}

export function ItemList({
  title,
  hint,
  items,
  loading,
  emptyIcon,
  emptyMessage,
  emptyHint,
  linkTo,
  linkLabel,
}: {
  title: string;
  hint: string;
  items: MaintenanceItem[];
  loading: boolean;
  emptyIcon: string;
  emptyMessage: string;
  emptyHint: string;
  linkTo: string;
  linkLabel: string;
}) {
  return (
    <SectionCard title={title} hint={hint} action={<SectionLink to={linkTo}>{linkLabel}</SectionLink>} bodyClassName="">
      {loading && items.length === 0 ? (
        <div className="p-5">
          <PanelSkeleton rows={4} />
        </div>
      ) : items.length === 0 ? (
        <PanelEmpty icon={emptyIcon} message={emptyMessage} hint={emptyHint} />
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <ItemRow key={`${item.source}:${item.id}`} item={item} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
