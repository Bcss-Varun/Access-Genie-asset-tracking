import { useId, useState } from 'react';
import { TONE_HEX, type ChartTone } from './Sparkline';
import { cn } from '@/lib/utils';

/**
 * A line over bars, with a hover readout — the dashboard's one large chart.
 *
 * It replaces the fixed six-month utilization chart that used to sit on the
 * executive dashboard. That one always drew six months whatever the screen
 * asked for; this one draws exactly the buckets the server returned for the
 * selected period, so changing the range changes the chart rather than the
 * caption above it.
 *
 * The line is a reference level (fleet utilization, which is materialised per
 * asset and has no per-bucket history) and the bars are the measured series.
 * They are drawn differently on purpose: a solid line implies "this is the
 * level", moving bars imply "this is what happened".
 */
export function TrendArea({
  points,
  lineLabel,
  barLabel,
  formatBar = (n: number) => `${n}`,
  tone = 'amber',
  className,
}: {
  points: { label: string; line: number; bar: number }[];
  lineLabel: string;
  barLabel: string;
  formatBar?: (n: number) => string;
  tone?: ChartTone;
  className?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const gradientId = useId();

  if (points.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">No activity in this period.</p>;
  }

  const W = 720;
  const H = 260;
  const PAD = { top: 16, right: 40, bottom: 28, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / points.length;

  const barMax = Math.max(1, ...points.map((p) => p.bar));
  const barColor = TONE_HEX[tone];

  const lineY = (v: number) => PAD.top + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH;
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(PAD.left + band * (i + 0.5)).toFixed(1)} ${lineY(p.line).toFixed(1)}`)
    .join(' ');

  const active = hovered === null ? null : points[hovered];

  return (
    <div className={cn('relative w-full', className)}>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-0.5 w-4 rounded bg-primary-500" />
          {lineLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2.5 w-3 rounded-sm" style={{ backgroundColor: barColor }} />
          {barLabel}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${lineLabel} against ${barLabel}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={lineY(tick)} y2={lineY(tick)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={PAD.left - 8} y={lineY(tick) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
              {tick}
            </text>
          </g>
        ))}

        {points.map((p, i) => {
          const h = (p.bar / barMax) * plotH * 0.75;
          const x = PAD.left + band * i + band * 0.25;
          return (
            <rect
              key={p.label}
              x={x}
              y={PAD.top + plotH - h}
              width={band * 0.5}
              height={Math.max(h, p.bar > 0 ? 2 : 0)}
              rx={2}
              fill={barColor}
              opacity={hovered === null || hovered === i ? 0.55 : 0.25}
            />
          );
        })}

        <path d={`${linePath} L ${PAD.left + plotW} ${PAD.top + plotH} L ${PAD.left} ${PAD.top + plotH} Z`} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <g key={p.label}>
            <circle cx={PAD.left + band * (i + 0.5)} cy={lineY(p.line)} r={hovered === i ? 4 : 2.5} fill="#6366f1" />
            {/* One transparent column per bucket carries the hover — far more
                forgiving than expecting a pointer to land on a 2px line. */}
            <rect
              x={PAD.left + band * i}
              y={PAD.top}
              width={band}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          </g>
        ))}

        {points.map((p, i) =>
          // Every label on a 12-bucket axis overlaps; every other one reads.
          i % Math.ceil(points.length / 6) === 0 ? (
            <text
              key={p.label}
              x={PAD.left + band * (i + 0.5)}
              y={H - 8}
              textAnchor="middle"
              className="fill-slate-400 text-[10px]"
            >
              {p.label}
            </text>
          ) : null,
        )}
      </svg>

      {active && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-sm">
          <div className="font-semibold text-slate-700">{active.label}</div>
          <div className="mt-0.5 text-slate-500">
            {lineLabel} <span className="font-semibold text-slate-800">{Math.round(active.line)}%</span>
          </div>
          <div className="text-slate-500">
            {barLabel} <span className="font-semibold text-slate-800">{formatBar(active.bar)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
