import { useId, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A ring with a legend — distribution by category, live status, anything where
 * the question is "what is the mix".
 *
 * Drawn with stroked arcs on one circle rather than filled wedge paths: a
 * stroke's length is `stroke-dasharray`, so each slice is two numbers and there
 * is no arc-flag trigonometry to get wrong at the 180° boundary.
 *
 * The hole carries the total, because the number everyone reads first is how
 * many there are altogether.
 */
export interface DonutSlice {
  label: string;
  value: number;
  color: string;
  /** Shown after the count in the legend — a share, a value, whatever fits. */
  caption?: string;
}

export function Donut({
  slices,
  total,
  totalLabel,
  className,
}: {
  slices: DonutSlice[];
  /** Defaults to the sum of the slices; override when the ring shows a subset. */
  total?: number;
  totalLabel: string;
  className?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const titleId = useId();

  const sum = slices.reduce((s, x) => s + x.value, 0);
  const shown = total ?? sum;

  if (sum === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Nothing to show for this scope.</p>;
  }

  // Circumference of r=60 — every slice is a fraction of this.
  const R = 60;
  const C = 2 * Math.PI * R;

  let offset = 0;
  const arcs = slices.map((slice) => {
    const length = (slice.value / sum) * C;
    const arc = { ...slice, length, offset, share: Math.round((slice.value / sum) * 100) };
    offset += length;
    return arc;
  });

  return (
    <div className={cn('flex w-full min-w-0 flex-col items-center gap-4 sm:flex-row sm:items-center', className)}>
      <svg viewBox="0 0 160 160" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-labelledby={titleId}>
        <title id={titleId}>{totalLabel}</title>
        <circle cx="80" cy="80" r={R} fill="none" className="stroke-current text-slate-100" strokeWidth="22" />
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            cx="80"
            cy="80"
            r={R}
            fill="none"
            stroke={arc.color}
            strokeWidth={hovered === arc.label ? 26 : 22}
            strokeDasharray={`${arc.length} ${C - arc.length}`}
            strokeDashoffset={-arc.offset}
            opacity={hovered === null || hovered === arc.label ? 1 : 0.35}
            className="transition-all"
            onMouseEnter={() => setHovered(arc.label)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        <g className="rotate-90" style={{ transformOrigin: '80px 80px' }}>
          <text x="80" y="76" textAnchor="middle" className="fill-current text-slate-900 text-[20px] font-bold">
            {shown.toLocaleString('en-IN')}
          </text>
          <text x="80" y="94" textAnchor="middle" className="fill-current text-slate-400 text-[9px]">
            {totalLabel}
          </text>
        </g>
      </svg>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {arcs.map((arc) => (
          <li
            key={arc.label}
            className={cn(
              'flex items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors',
              hovered === arc.label && 'bg-slate-50',
            )}
            onMouseEnter={() => setHovered(arc.label)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: arc.color }} />
            <span className="min-w-0 flex-1 truncate text-slate-600">{arc.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-800">{arc.share}%</span>
            {/* The caption is the first thing to go when the card is narrow —
                the share is the number the legend exists for. */}
            <span className="hidden shrink-0 text-right text-xs tabular-nums text-slate-400 sm:inline">
              {arc.caption ?? arc.value.toLocaleString('en-IN')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
