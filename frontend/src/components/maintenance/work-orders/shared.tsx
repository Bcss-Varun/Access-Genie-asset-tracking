import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { isActiveWorkOrderSource, type WorkOrder, type WorkOrderSource } from '@access-genie/shared';
import { cn } from '@/lib/utils';
import { sourceEmoji, sourceLabel } from './tokens';

/** The shared pieces of chrome the board cards and list rows both render. */

export function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium',
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The origin badge.
 *
 * A parked source renders muted and labelled "legacy" rather than being hidden.
 * Records raised by predictive automation still exist, and a board that shows
 * them with no origin at all is less honest than one that says where they came
 * from and that the product no longer raises them.
 */
export function SourceBadge({ source }: { source: WorkOrderSource | undefined }) {
  const active = isActiveWorkOrderSource(source ?? 'Manual');

  return (
    <Pill
      className={
        active
          ? 'border-slate-200 bg-slate-50 text-slate-600'
          : 'border-dashed border-slate-200 bg-transparent text-slate-400'
      }
    >
      <span aria-hidden>{sourceEmoji(source)}</span>
      {sourceLabel(source)}
      {!active && <span className="text-[9px] uppercase tracking-wide">legacy</span>}
    </Pill>
  );
}

/** Asset and facility, the two things that say *where* a job is. */
export function AssetLine({ workOrder, className }: { workOrder: WorkOrder; className?: string }) {
  return (
    <div className={cn('min-w-0 text-xs text-slate-500', className)}>
      <Link
        to={`/assets/${workOrder.assetId}`}
        onClick={(e) => e.stopPropagation()}
        className="truncate hover:text-primary-600"
      >
        {workOrder.assetName}
      </Link>
      {workOrder.placement && (
        <>
          <span className="mx-1 text-slate-300">·</span>
          <span className="truncate">{workOrder.placement.facilityName}</span>
        </>
      )}
    </div>
  );
}
