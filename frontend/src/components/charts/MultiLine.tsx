import { useId, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Two or three series against a shared axis — the value trend.
 *
 * The y-axis starts at zero and is scaled to the largest series, because these
 * lines are money: a truncated axis makes a 4% depreciation look like a cliff,
 * and this is a chart people quote in meetings.
 */
export interface LineSeries {
  label: string;
  color: string;
  points: number[];
  /** Draw a soft fill under this series. One at most, or it turns to mud. */
  fill?: boolean;
}

export function MultiLine({
  labels,
  series,
  format,
  className,
}: {
  labels: string[];
  series: LineSeries[];
  format: (n: number) => string;
  className?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const gradientId = useId();

  if (labels.length === 0 || series.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">Nothing recorded for this period.</p>;
  }

  const W = 760;
  const H = 300;
  const PAD = { top: 16, right: 16, bottom: 30, left: 62 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const max = Math.max(1, ...series.flatMap((s) => s.points));
  // A round ceiling so the gridline labels are readable numbers.
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const ceiling = Math.ceil(max / magnitude) * magnitude;

  const x = (i: number) => PAD.left + (labels.length === 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / ceiling) * plotH;

  const pathFor = (points: number[]) =>
    points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * ceiling);
  const step = Math.max(1, Math.ceil(labels.length / 7));

  return (
    <div className={cn('relative w-full', className)}>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-2">
            <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={series.map((s) => s.label).join(' against ')}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={series[0]?.color ?? '#6366f1'} stopOpacity={0.16} />
            <stop offset="100%" stopColor={series[0]?.color ?? '#6366f1'} stopOpacity={0} />
          </linearGradient>
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
              {format(tick)}
            </text>
          </g>
        ))}

        {series.map((s) =>
          s.fill ? (
            <path
              key={`${s.label}-fill`}
              d={`${pathFor(s.points)} L ${x(labels.length - 1)} ${PAD.top + plotH} L ${x(0)} ${PAD.top + plotH} Z`}
              fill={`url(#${gradientId})`}
            />
          ) : null,
        )}

        {series.map((s) => (
          <path
            key={s.label}
            d={pathFor(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {labels.map((label, i) => (
          <g key={`${label}-${i}`}>
            {hovered === i &&
              series.map((s) => (
                <circle key={s.label} cx={x(i)} cy={y(s.points[i] ?? 0)} r={3.5} fill={s.color} />
              ))}
            {/* A full-height column per point carries the hover. */}
            <rect
              x={x(i) - plotW / Math.max(1, labels.length * 2)}
              y={PAD.top}
              width={plotW / Math.max(1, labels.length)}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
            {i % step === 0 && (
              <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">
                {label}
              </text>
            )}
          </g>
        ))}
      </svg>

      {hovered !== null && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-sm">
          <div className="font-semibold text-slate-700">{labels[hovered]}</div>
          {series.map((s) => (
            <div key={s.label} className="mt-0.5 flex items-center gap-2 text-slate-500">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label}
              <span className="ml-auto font-semibold tabular-nums text-slate-800">{format(s.points[hovered] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
