import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Stacked bars with an optional line over them — maintenance by month against
 * what it cost.
 *
 * Two axes, and they are labelled: the bars count work orders and the line is
 * money, so a chart that showed both against one scale would be quietly lying
 * about their relationship.
 */
export interface StackSeries {
  key: string;
  label: string;
  color: string;
}

export function StackedBars({
  labels,
  series,
  rows,
  line,
  formatLine,
  className,
}: {
  labels: string[];
  series: StackSeries[];
  /** One record per label, keyed by series key. */
  rows: Record<string, number>[];
  line?: { label: string; color: string; points: number[] };
  formatLine?: (n: number) => string;
  className?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (labels.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">Nothing recorded for this period.</p>;
  }

  const W = 720;
  const H = 260;
  const PAD = { top: 16, right: line ? 56 : 16, bottom: 28, left: 36 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / labels.length;

  const totals = rows.map((row) => series.reduce((s, x) => s + (row[x.key] ?? 0), 0));
  const barMax = Math.max(1, ...totals);
  const lineMax = Math.max(1, ...(line?.points ?? [1]));

  const barY = (v: number) => PAD.top + plotH - (v / barMax) * plotH;
  const lineY = (v: number) => PAD.top + plotH - (v / lineMax) * plotH;

  return (
    <div className={cn('relative w-full', className)}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-slate-500">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
        {line && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: line.color }} />
            {line.label}
          </span>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Maintenance by month">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={barY(barMax * f)}
              y2={barY(barMax * f)}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={barY(barMax * f) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">
              {Math.round(barMax * f)}
            </text>
          </g>
        ))}

        {labels.map((label, i) => {
          const row = rows[i] ?? {};
          let stackTop = PAD.top + plotH;
          return (
            <g key={`${label}-${i}`} opacity={hovered === null || hovered === i ? 1 : 0.45}>
              {series.map((s) => {
                const value = row[s.key] ?? 0;
                if (value <= 0) return null;
                const height = (value / barMax) * plotH;
                stackTop -= height;
                return (
                  <rect
                    key={s.key}
                    x={PAD.left + band * i + band * 0.25}
                    y={stackTop}
                    width={band * 0.5}
                    height={height}
                    fill={s.color}
                    rx={1.5}
                  />
                );
              })}
              <rect
                x={PAD.left + band * i}
                y={PAD.top}
                width={band}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
              <text x={PAD.left + band * (i + 0.5)} y={H - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">
                {label}
              </text>
            </g>
          );
        })}

        {line && (
          <>
            <path
              d={line.points
                .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(PAD.left + band * (i + 0.5)).toFixed(1)} ${lineY(v).toFixed(1)}`)
                .join(' ')}
              fill="none"
              stroke={line.color}
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {line.points.map((v, i) => (
              <circle key={i} cx={PAD.left + band * (i + 0.5)} cy={lineY(v)} r={2.5} fill={line.color} />
            ))}
            {formatLine && (
              <text x={W - PAD.right + 6} y={lineY(lineMax) + 4} className="fill-slate-400 text-[10px]">
                {formatLine(lineMax)}
              </text>
            )}
          </>
        )}
      </svg>

      {hovered !== null && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-sm">
          <div className="font-semibold text-slate-700">{labels[hovered]}</div>
          {series.map((s) => (
            <div key={s.key} className="mt-0.5 flex items-center gap-2 text-slate-500">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label}
              <span className="ml-auto font-semibold tabular-nums text-slate-800">{rows[hovered]?.[s.key] ?? 0}</span>
            </div>
          ))}
          {line && formatLine && (
            <div className="mt-1 border-t border-slate-100 pt-1 text-slate-500">
              {line.label}
              <span className="ml-2 font-semibold tabular-nums text-slate-800">
                {formatLine(line.points[hovered] ?? 0)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
