'use client';

// ─────────────────────────────────────────────────────────────────────────────
// DashboardCharts — hand-rolled SVG charts for the Executive Dashboard.
// No chart library; premium dark-first styling; in-component hover state only.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { utilizationDowntimeSeries, categoryBreakdown } from '@/lib/mock-data';

// Compact money formatting: $89.4M / $245.2M / $920k / $500.
function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1) Utilization (line, left axis) vs Downtime (soft bars, right axis)
// ═════════════════════════════════════════════════════════════════════════════
const UTIL_COLOR = '#6366f1'; // primary-500 (sky) — utilization line
const DOWN_COLOR = '#f59e0b'; // amber — downtime bars

// Catmull-Rom → cubic-bézier smoothing for a pleasant curve.
function smoothLine(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const t = 1 / 6;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export function UtilizationDowntimeChart() {
  const [hovered, setHovered] = useState<number | null>(null);

  const series = utilizationDowntimeSeries;

  // Chart geometry (viewBox units).
  const W = 760;
  const H = 380;
  const M = { top: 28, right: 54, bottom: 46, left: 46 };
  const plotX0 = M.left;
  const plotY0 = M.top;
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const plotY1 = plotY0 + plotH;
  const band = plotW / Math.max(series.length, 1);
  const barW = band * 0.4;

  const geo = useMemo(() => {
    const maxDown = Math.max(1, ...series.map((s) => s.downtime));
    const downMax = Math.ceil(maxDown / 40) * 40; // nice ceiling for the right axis
    const downTicks: number[] = [];
    for (let v = 0; v <= downMax; v += 40) downTicks.push(v);
    const utilTicks = [0, 25, 50, 75, 100];

    const xFor = (i: number) => plotX0 + band * (i + 0.5);
    const yUtil = (v: number) => plotY1 - (v / 100) * plotH;
    const yDown = (v: number) => plotY1 - (v / downMax) * plotH;

    const linePts = series.map((s, i) => ({ x: xFor(i), y: yUtil(s.utilization) }));
    const lineD = smoothLine(linePts);
    const areaD = `${lineD} L ${xFor(series.length - 1).toFixed(2)} ${plotY1} L ${xFor(0).toFixed(2)} ${plotY1} Z`;

    return { downMax, downTicks, utilTicks, xFor, yUtil, yDown, linePts, lineD, areaD };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);

  const active = hovered === null ? null : series[hovered];
  const tipLeft = hovered === null ? 0 : (geo.xFor(hovered) / W) * 100;
  const tipTop = hovered === null ? 0 : (geo.yUtil(active!.utilization) / H) * 100;

  return (
    <div className="w-full">
      {/* Legend */}
      <div className="flex items-center gap-5 mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2.5 w-4 rounded-full" style={{ backgroundColor: UTIL_COLOR }} />
          Utilization %
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ backgroundColor: DOWN_COLOR, opacity: 0.55 }} />
          Downtime (hrs)
        </span>
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Monthly asset utilization percentage versus downtime hours"
        >
          <defs>
            <linearGradient id="agUtilArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={UTIL_COLOR} stopOpacity="0.28" />
              <stop offset="100%" stopColor={UTIL_COLOR} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal gridlines + left (utilization) axis ticks */}
          {geo.utilTicks.map((t) => {
            const y = geo.yUtil(t);
            return (
              <g key={`gl-${t}`}>
                <line
                  x1={plotX0}
                  x2={plotX0 + plotW}
                  y1={y}
                  y2={y}
                  className="stroke-slate-200 dark:stroke-slate-700"
                  strokeWidth={1}
                  strokeOpacity={0.55}
                />
                <text
                  x={plotX0 - 10}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-slate-400"
                  fontSize={11}
                >
                  {t}
                </text>
              </g>
            );
          })}

          {/* Right (downtime) axis ticks */}
          {geo.downTicks.map((t) => {
            const y = geo.yDown(t);
            return (
              <text
                key={`dt-${t}`}
                x={plotX0 + plotW + 10}
                y={y}
                textAnchor="start"
                dominantBaseline="middle"
                className="fill-slate-400"
                fontSize={11}
              >
                {t}
              </text>
            );
          })}

          {/* Axis captions */}
          <text x={plotX0 - 10} y={plotY0 - 12} textAnchor="end" className="fill-slate-500" fontSize={10} fontWeight={600}>
            Util %
          </text>
          <text x={plotX0 + plotW + 10} y={plotY0 - 12} textAnchor="start" className="fill-slate-500" fontSize={10} fontWeight={600}>
            Hrs
          </text>

          {/* Downtime bars (soft, right axis) */}
          {series.map((s, i) => {
            const x = geo.xFor(i) - barW / 2;
            const y = geo.yDown(s.downtime);
            const h = plotY1 - y;
            const on = hovered === i;
            return (
              <rect
                key={`bar-${s.label}`}
                x={x}
                y={y}
                width={barW}
                height={Math.max(0, h)}
                rx={4}
                fill={DOWN_COLOR}
                fillOpacity={on ? 0.6 : 0.32}
                className="transition-[fill-opacity] duration-150"
              />
            );
          })}

          {/* Utilization area + line */}
          <path d={geo.areaD} fill="url(#agUtilArea)" />
          <path
            d={geo.lineD}
            fill="none"
            stroke={UTIL_COLOR}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Hover guide line */}
          {hovered !== null && (
            <line
              x1={geo.xFor(hovered)}
              x2={geo.xFor(hovered)}
              y1={plotY0}
              y2={plotY1}
              stroke={UTIL_COLOR}
              strokeWidth={1}
              strokeDasharray="3 3"
              strokeOpacity={0.5}
            />
          )}

          {/* Utilization dots */}
          {geo.linePts.map((p, i) => {
            const on = hovered === i;
            return (
              <circle
                key={`dot-${i}`}
                cx={p.x}
                cy={p.y}
                r={on ? 6 : 4}
                fill={UTIL_COLOR}
                stroke="#ffffff"
                strokeWidth={on ? 2.5 : 2}
                className="transition-all duration-150"
              />
            );
          })}

          {/* Month labels */}
          {series.map((s, i) => (
            <text
              key={`xl-${s.label}`}
              x={geo.xFor(i)}
              y={plotY1 + 22}
              textAnchor="middle"
              className={hovered === i ? 'fill-slate-700 dark:fill-slate-200' : 'fill-slate-400'}
              fontSize={12}
              fontWeight={hovered === i ? 600 : 400}
            >
              {s.label}
            </text>
          ))}

          {/* Invisible hover columns (on top) */}
          {series.map((s, i) => (
            <rect
              key={`hit-${s.label}`}
              x={plotX0 + band * i}
              y={plotY0}
              width={band}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>

        {/* Tooltip (HTML overlay, positioned as % of the responsive SVG box) */}
        {active && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
            style={{ left: `${tipLeft}%`, top: `${tipTop}%`, transform: 'translate(-50%, -125%)', minWidth: 132 }}
          >
            <div className="mb-1.5 font-semibold text-slate-700 dark:text-slate-200">{active.label}</div>
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: UTIL_COLOR }} />
                Utilization
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{active.utilization}%</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: DOWN_COLOR }} />
                Downtime
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{active.downtime} hrs</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 2) Portfolio value by category — donut
// ═════════════════════════════════════════════════════════════════════════════
// Validated categorical palette (dataviz skill: all checks pass on the navy
// surface; light passes with a yellow-contrast WARN relieved by direct legend
// labels). Ring order == category order to preserve adjacency CVD-safety.
// Harmonious categorical palette (uniform saturation, indigo-anchored, CVD-aware).
const DONUT_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#db2777', '#7c3aed'];

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180; // 0° at top, clockwise
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function donutArc(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startDeg: number,
  endDeg: number,
): string {
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  const o1 = polar(cx, cy, rOuter, startDeg);
  const o2 = polar(cx, cy, rOuter, endDeg);
  const i2 = polar(cx, cy, rInner, endDeg);
  const i1 = polar(cx, cy, rInner, startDeg);
  return [
    `M ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${o2.x.toFixed(2)} ${o2.y.toFixed(2)}`,
    `L ${i2.x.toFixed(2)} ${i2.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export function ValueByCategoryDonut() {
  const [hovered, setHovered] = useState<number | null>(null);

  const data = categoryBreakdown;
  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

  const CX = 100;
  const CY = 100;
  const R_OUTER = 92;
  const R_INNER = 60;
  const GAP = 2; // degrees of surface gap between segments

  const segments = useMemo(() => {
    const safeTotal = total > 0 ? total : 1;
    let acc = 0;
    return data.map((d, i) => {
      const frac = d.value / safeTotal;
      const start = acc * 360;
      const end = (acc + frac) * 360;
      acc += frac;
      const mid = (start + end) / 2;
      return { ...d, i, frac, start, end, mid };
    });
  }, [data, total]);

  const active = hovered === null ? null : segments[hovered];

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      {/* Donut */}
      <div className="relative shrink-0" style={{ width: 208, maxWidth: '100%' }}>
        <svg viewBox="0 0 200 200" className="w-full h-auto" role="img" aria-label="Portfolio value by asset category">
          {segments.map((seg) => {
            const on = hovered === seg.i;
            const rOuter = on ? R_OUTER + 5 : R_OUTER;
            // Keep a visible gap; guard tiny slices from vanishing.
            const halfGap = Math.min(GAP / 2, (seg.end - seg.start) / 3);
            const d = donutArc(CX, CY, rOuter, R_INNER, seg.start + halfGap, seg.end - halfGap);
            return (
              <path
                key={seg.category}
                d={d}
                fill={DONUT_COLORS[seg.i % DONUT_COLORS.length]}
                fillOpacity={hovered === null || on ? 1 : 0.4}
                className="transition-all duration-150"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(seg.i)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}

          {/* Center label */}
          {active ? (
            <>
              <text x={CX} y={CY - 8} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" fontSize={9}>
                {active.category}
              </text>
              <text x={CX} y={CY + 12} textAnchor="middle" className="fill-slate-900 dark:fill-slate-50" fontSize={22} fontWeight={700}>
                {fmtMoney(active.value)}
              </text>
              <text x={CX} y={CY + 27} textAnchor="middle" className="fill-slate-400" fontSize={9}>
                {((active.value / (total || 1)) * 100).toFixed(1)}% of portfolio
              </text>
            </>
          ) : (
            <>
              <text x={CX} y={CY - 8} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" fontSize={9}>
                Total Value
              </text>
              <text x={CX} y={CY + 13} textAnchor="middle" className="fill-primary-500" fontSize={24} fontWeight={700}>
                {fmtMoney(total)}
              </text>
              <text x={CX} y={CY + 28} textAnchor="middle" className="fill-slate-400" fontSize={9}>
                {data.length} categories
              </text>
            </>
          )}
        </svg>
      </div>

      {/* Legend */}
      <ul className="flex-1 w-full space-y-1.5">
        {segments.map((seg) => {
          const on = hovered === seg.i;
          return (
            <li
              key={seg.category}
              onMouseEnter={() => setHovered(seg.i)}
              onMouseLeave={() => setHovered(null)}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 cursor-pointer transition-colors ${
                on ? 'bg-slate-100 dark:bg-slate-800/60' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: DONUT_COLORS[seg.i % DONUT_COLORS.length] }}
                />
                <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{seg.category}</span>
              </span>
              <span className="flex items-baseline gap-2 pl-3 shrink-0">
                <span className="text-sm font-semibold font-heading text-slate-900 dark:text-slate-50">
                  {fmtMoney(seg.value)}
                </span>
                <span className="w-10 text-right text-xs tabular-nums text-slate-400">
                  {(seg.frac * 100).toFixed(1)}%
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
