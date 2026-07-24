import { useState } from 'react';
import type { UtilizationDowntimePoint } from '@access-genie/shared';
import { cn } from '@/lib/format';

/**
 * Utilization and downtime as **small multiples sharing one x-axis** — not a
 * dual-axis combo. Percent and hours have unrelated scales; drawing them
 * against two y-axes invents crossings that mean nothing. Stacked panels keep
 * the month-to-month comparison while each measure keeps an honest baseline.
 */
const W = 640;
const H = 236;
const PAD_L = 36;
const PAD_R = 14;

const LINE_TOP = 14;
const LINE_BOTTOM = 118;
const BAR_TOP = 152;
const BAR_BOTTOM = 208;

const LINE_COLOR = '#4f46e5'; // primary-600
const BAR_COLOR = '#6366f1'; // primary-500

export function UtilizationChart({ points }: { points: UtilizationDowntimePoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (points.length === 0) {
    return <p className="text-sm text-slate-400 py-12 text-center">No trend data yet.</p>;
  }

  const plotW = W - PAD_L - PAD_R;
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;
  const x = (i: number) => PAD_L + (points.length > 1 ? i * step : plotW / 2);

  // Utilization is a percentage — always scale it 0–100 so the same shape means
  // the same thing on every render, rather than re-scaling to the local max.
  const lineY = (value: number) => LINE_BOTTOM - (Math.max(0, Math.min(100, value)) / 100) * (LINE_BOTTOM - LINE_TOP);

  const maxDowntime = Math.max(1, ...points.map((p) => p.downtime));
  const barH = (value: number) => (value / maxDowntime) * (BAR_BOTTOM - BAR_TOP);
  const barWidth = Math.min(24, step * 0.5 || 24);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${lineY(p.utilization)}`).join(' ');
  const last = points[points.length - 1];
  const active = hovered !== null ? points[hovered] : undefined;

  return (
    <div className="relative mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Utilization percentage and downtime hours by month">
        {/* ── Panel A: utilization ──────────────────────────────────────── */}
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line x1={PAD_L} x2={W - PAD_R} y1={lineY(tick)} y2={lineY(tick)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={PAD_L - 8} y={lineY(tick) + 3.5} textAnchor="end" className="fill-slate-400 text-[9px]">
              {tick}%
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke={LINE_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {points.map((point, i) => (
          <circle
            key={point.label}
            cx={x(i)}
            cy={lineY(point.utilization)}
            r={hovered === i ? 5 : 4}
            fill={LINE_COLOR}
            stroke="#ffffff"
            strokeWidth={2}
          />
        ))}

        {/* Label the endpoint only — a number on every point goes unread. */}
        {last && (
          <text x={x(points.length - 1)} y={lineY(last.utilization) - 12} textAnchor="end" className="fill-slate-600 text-[10px] font-semibold">
            {last.utilization}% utilized
          </text>
        )}

        {/* ── Panel B: downtime hours ───────────────────────────────────── */}
        <line x1={PAD_L} x2={W - PAD_R} y1={BAR_BOTTOM} y2={BAR_BOTTOM} stroke="#e5e7eb" strokeWidth={1} />
        <text x={PAD_L - 8} y={BAR_TOP + 4} textAnchor="end" className="fill-slate-400 text-[9px]">
          {Math.round(maxDowntime)}h
        </text>

        {points.map((point, i) => {
          const height = barH(point.downtime);
          return (
            <g key={point.label}>
              <rect
                x={x(i) - barWidth / 2}
                y={BAR_BOTTOM - height}
                width={barWidth}
                height={Math.max(height, point.downtime > 0 ? 2 : 0)}
                rx={4}
                fill={BAR_COLOR}
                opacity={hovered === null || hovered === i ? 1 : 0.45}
              />
              {/* Values are labelled directly — the relief the contrast check asks for. */}
              {point.downtime > 0 && (
                <text x={x(i)} y={BAR_BOTTOM - height - 5} textAnchor="middle" className="fill-slate-500 text-[9px] font-medium">
                  {point.downtime}
                </text>
              )}
            </g>
          );
        })}

        {/* ── Shared x-axis ─────────────────────────────────────────────── */}
        {points.map((point, i) => (
          <text
            key={point.label}
            x={x(i)}
            y={H - 6}
            textAnchor="middle"
            className={cn('text-[10px]', hovered === i ? 'fill-slate-700 font-semibold' : 'fill-slate-400')}
          >
            {point.label}
          </text>
        ))}

        {/* Hit targets span both panels so one hover reads the whole month. */}
        {points.map((point, i) => (
          <rect
            key={point.label}
            x={x(i) - (step || plotW) / 2}
            y={0}
            width={step || plotW}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}

        {hovered !== null && (
          <line x1={x(hovered)} x2={x(hovered)} y1={LINE_TOP} y2={BAR_BOTTOM} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
        )}
      </svg>

      {active && (
        <div className="absolute top-0 right-0 glass-panel px-3 py-2 text-xs pointer-events-none">
          <p className="font-semibold text-slate-700">{active.label}</p>
          <p className="text-slate-500 mt-0.5">Utilization {active.utilization}%</p>
          <p className="text-slate-500">Downtime {active.downtime}h</p>
        </div>
      )}

      <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-1">
        <span>Fleet utilization (%)</span>
        <span>Maintenance downtime (hours)</span>
      </div>
    </div>
  );
}
