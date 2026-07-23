'use client';

import { useMemo, useState } from 'react';
import { mockForecasts } from '@/lib/mock-data';
import { useToast } from '@/components/providers/ToastProvider';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import type { ForecastSeries } from '@/types/asset';

// ─────────────────────────────────────────────────────────────────────────────
// Static config (module scope → stable identity across renders, deterministic)
// ─────────────────────────────────────────────────────────────────────────────

/** Planning scenarios — scale the forecast line by a factor (visual only). */
const SCENARIOS = [
  { id: 'base', label: 'Base', factor: 1, hint: 'Model central estimate' },
  { id: 'optimistic', label: 'Optimistic', factor: 1.08, hint: '+8% upside case' },
  { id: 'conservative', label: 'Conservative', factor: 0.92, hint: '−8% downside case' },
] as const;
type ScenarioId = (typeof SCENARIOS)[number]['id'];

// Chart geometry (SVG user units — rendered responsively via viewBox).
const W = 820;
const H = 380;
const PAD = { top: 22, right: 26, bottom: 46, left: 56 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

// Palette (project design tokens, resolved to hex for SVG).
const C = {
  band: 'rgba(14,165,233,0.15)', // primary-500 @ 15%
  bandStroke: 'rgba(14,165,233,0.35)',
  actual: '#0f172a', // slate-900
  forecast: '#4f46e5', // primary-600
  grid: '#e2e8f0', // slate-200
  axis: '#94a3b8', // slate-400
  axisText: '#64748b', // slate-500
  guide: '#cbd5e1', // slate-300
};

// ─────────────────────────────────────────────────────────────────────────────

export default function ForecastingPage() {
  const { toast } = useToast();

  const [seriesId, setSeriesId] = useState<string>(mockForecasts[0].id);
  const [scenario, setScenario] = useState<ScenarioId>('base');
  const [hover, setHover] = useState<number | null>(null);

  const series: ForecastSeries =
    mockForecasts.find((s) => s.id === seriesId) ?? mockForecasts[0];
  const factor = SCENARIOS.find((s) => s.id === scenario)?.factor ?? 1;

  // ── Derive plottable geometry for the selected series + scenario ─────────────
  const chart = useMemo(() => {
    const pts = series.points;
    const n = pts.length;

    // Index where recorded history ends (last point carrying an `actual`).
    const lastActualIdx = pts.reduce(
      (acc, p, i) => (p.actual != null ? i : acc),
      0,
    );

    // Scenario-scaled forecast line (visual only).
    const fc = pts.map((p) => p.forecast * factor);

    // Y domain across band + actuals + scaled forecast, padded 6%.
    const vals: number[] = [];
    pts.forEach((p, i) => {
      vals.push(p.lower, p.upper, fc[i]);
      if (p.actual != null) vals.push(p.actual);
    });
    const rawMin = Math.min(...vals);
    const rawMax = Math.max(...vals);
    const pad = (rawMax - rawMin) * 0.06 || 1;
    const yMin = rawMin - pad;
    const yMax = rawMax + pad;

    const xAt = (i: number) => PAD.left + (n === 1 ? 0 : (i / (n - 1)) * PLOT_W);
    const yAt = (v: number) =>
      PAD.top + (1 - (v - yMin) / (yMax - yMin)) * PLOT_H;

    // Confidence band: forward along upper, back along lower.
    const bandPath =
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.upper).toFixed(1)}`).join(' ') +
      ' ' +
      [...pts].reverse().map((p, ri) => {
        const i = n - 1 - ri;
        return `L${xAt(i).toFixed(1)},${yAt(p.lower).toFixed(1)}`;
      }).join(' ') +
      ' Z';

    // Solid actual-history line (up to where actuals end).
    const actualPath = pts
      .slice(0, lastActualIdx + 1)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.actual ?? fc[i]).toFixed(1)}`)
      .join(' ');

    // Dashed forecast line (continues from the last actual through the horizon).
    const forecastPath = pts
      .slice(lastActualIdx)
      .map((p, k) => {
        const i = lastActualIdx + k;
        return `${k === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(fc[i]).toFixed(1)}`;
      })
      .join(' ');

    // Horizontal gridlines / y ticks (5 divisions).
    const yTicks = Array.from({ length: 5 }, (_, k) => {
      const v = yMin + (k / 4) * (yMax - yMin);
      return { v, y: yAt(v) };
    });

    return { pts, n, fc, lastActualIdx, xAt, yAt, bandPath, actualPath, forecastPath, yTicks };
  }, [series, factor]);

  // ── KPI tiles ────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const { pts, fc, lastActualIdx } = chart;
    const nextIdx = Math.min(lastActualIdx + 1, pts.length - 1);
    const nextForecast = fc[nextIdx];

    // Projected total over the remaining forecast horizon.
    const projectedTotal = fc
      .slice(lastActualIdx + 1)
      .reduce((a, b) => a + b, 0);

    // Confidence ≈ how tight the band is relative to the forecast value.
    const horizon = pts.slice(lastActualIdx + 1);
    const confidence =
      horizon.length === 0
        ? 100
        : Math.round(
            (horizon.reduce((acc, p, k) => {
              const val = fc[lastActualIdx + 1 + k] || 1;
              return acc + (1 - (p.upper - p.lower) / (2 * val));
            }, 0) /
              horizon.length) *
              100,
          );

    // Trend: last forecast vs first recorded actual.
    const firstActual = pts.find((p) => p.actual != null)?.actual ?? (fc[0] || 1);
    const lastForecast = fc[fc.length - 1];
    const trendPct = Math.round(((lastForecast - firstActual) / firstActual) * 100);

    return { nextForecast, projectedTotal, confidence, trendPct, nextLabel: pts[nextIdx].label };
  }, [chart]);

  const fmt = (v: number) => Math.round(v).toLocaleString();

  // ── Actions ────────────────────────────────────────────────────────────────
  function pickSeries(s: ForecastSeries) {
    setSeriesId(s.id);
    setHover(null);
  }
  function pickScenario(id: ScenarioId, label: string, hint: string) {
    setScenario(id);
    toast({ title: `${label} scenario applied`, description: `${series.name} — ${hint}.`, tone: 'info' });
  }

  const active = chart.pts[hover ?? -1];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Forecasting & Capacity Planning"
        subtitle="Model-driven projections with confidence bands to plan spares, capex and end-of-life capacity."
        breadcrumb={[{ label: 'AI Intelligence', href: '/ai-insights' }, { label: 'Forecasting' }]}
      />

      {/* Series picker */}
      <div className="flex flex-wrap items-center gap-2">
        {mockForecasts.map((s) => {
          const on = s.id === series.id;
          return (
            <button
              key={s.id}
              onClick={() => pickSeries(s)}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                on
                  ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-primary-300 hover:text-primary-700',
              )}
              aria-pressed={on}
            >
              {s.name}
            </button>
          );
        })}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={`Next Period (${kpis.nextLabel})`}
          value={<span>{fmt(kpis.nextForecast)} <span className="text-base font-medium text-slate-400">{series.unit}</span></span>}
          sub="Central forecast estimate"
          tone="primary"
          accent
        />
        <KpiCard
          label="Projected Total"
          value={<span>{fmt(kpis.projectedTotal)} <span className="text-base font-medium text-slate-400">{series.unit}</span></span>}
          sub="Sum over forecast horizon"
        />
        <KpiCard
          label="Model Confidence"
          value={`${kpis.confidence}%`}
          sub="Inverse of band width"
          tone={kpis.confidence >= 80 ? 'emerald' : 'amber'}
        />
        <KpiCard
          label="Trend"
          value={`${kpis.trendPct >= 0 ? '+' : ''}${kpis.trendPct}%`}
          sub="Horizon vs. earliest actual"
          tone={kpis.trendPct >= 0 ? 'emerald' : 'red'}
        />
      </div>

      {/* Chart panel */}
      <div className="glass-panel rounded-xl p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-heading font-semibold text-slate-900">{series.name}</h2>
            <Badge tone="slate">{series.unit}</Badge>
          </div>

          {/* Scenario toggle group */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {SCENARIOS.map((sc) => {
              const on = sc.id === scenario;
              return (
                <button
                  key={sc.id}
                  onClick={() => pickScenario(sc.id, sc.label, sc.hint)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                    on ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                  )}
                  aria-pressed={on}
                >
                  {sc.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-2">
            <svg width="26" height="8" aria-hidden><line x1="0" y1="4" x2="26" y2="4" stroke={C.actual} strokeWidth="2.5" /></svg>
            Actual history
          </span>
          <span className="inline-flex items-center gap-2">
            <svg width="26" height="8" aria-hidden><line x1="0" y1="4" x2="26" y2="4" stroke={C.forecast} strokeWidth="2.5" strokeDasharray="6 4" /></svg>
            Forecast
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-6 rounded-sm" style={{ background: C.band, border: `1px solid ${C.bandStroke}` }} />
            Confidence band
          </span>
        </div>

        {/* Responsive SVG chart */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto select-none"
          role="img"
          aria-label={`${series.name} forecast chart`}
          onMouseLeave={() => setHover(null)}
        >
          {/* Gridlines + y-axis ticks/labels */}
          {chart.yTicks.map((t, i) => (
            <g key={i}>
              <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} stroke={C.grid} strokeWidth={1} />
              <text x={PAD.left - 10} y={t.y + 4} textAnchor="end" fontSize={12} fill={C.axisText}>
                {Math.round(t.v).toLocaleString()}
              </text>
            </g>
          ))}

          {/* Axes */}
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke={C.axis} strokeWidth={1} />
          <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke={C.axis} strokeWidth={1} />
          <text
            transform={`translate(16, ${PAD.top + PLOT_H / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={12}
            fontWeight={600}
            fill={C.axisText}
          >
            {series.unit}
          </text>

          {/* x-axis month labels + divider marking history / forecast */}
          {chart.pts.map((p, i) => (
            <text key={p.label} x={chart.xAt(i)} y={H - PAD.bottom + 20} textAnchor="middle" fontSize={12} fill={C.axisText}>
              {p.label}
            </text>
          ))}
          {(() => {
            const dx = chart.xAt(chart.lastActualIdx);
            return (
              <g>
                <line x1={dx} y1={PAD.top} x2={dx} y2={H - PAD.bottom} stroke={C.guide} strokeWidth={1} strokeDasharray="3 4" />
                <text x={dx + 6} y={PAD.top + 12} fontSize={10} fontWeight={600} fill={C.axisText}>
                  forecast →
                </text>
              </g>
            );
          })()}

          {/* Confidence band */}
          <path d={chart.bandPath} fill={C.band} stroke={C.bandStroke} strokeWidth={1} />

          {/* Forecast (dashed) + Actual (solid) lines */}
          <path d={chart.forecastPath} fill="none" stroke={C.forecast} strokeWidth={2.5} strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={chart.actualPath} fill="none" stroke={C.actual} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

          {/* Point markers */}
          {chart.pts.map((p, i) => (
            <g key={`m${i}`}>
              {p.actual != null && (
                <circle cx={chart.xAt(i)} cy={chart.yAt(p.actual)} r={3} fill={C.actual} />
              )}
              {i >= chart.lastActualIdx && (
                <circle cx={chart.xAt(i)} cy={chart.yAt(chart.fc[i])} r={3} fill="#fff" stroke={C.forecast} strokeWidth={1.5} />
              )}
            </g>
          ))}

          {/* Hover guide + emphasized markers */}
          {hover != null && active && (
            <g pointerEvents="none">
              <line x1={chart.xAt(hover)} y1={PAD.top} x2={chart.xAt(hover)} y2={H - PAD.bottom} stroke={C.forecast} strokeWidth={1} strokeDasharray="4 3" />
              {active.actual != null && <circle cx={chart.xAt(hover)} cy={chart.yAt(active.actual)} r={5} fill={C.actual} />}
              <circle cx={chart.xAt(hover)} cy={chart.yAt(chart.fc[hover])} r={5} fill="#fff" stroke={C.forecast} strokeWidth={2} />
            </g>
          )}

          {/* Invisible hit targets per month */}
          {chart.pts.map((p, i) => {
            const bw = PLOT_W / chart.n;
            return (
              <rect
                key={`h${i}`}
                x={chart.xAt(i) - bw / 2}
                y={PAD.top}
                width={bw}
                height={PLOT_H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            );
          })}

          {/* SVG tooltip (scales with the chart) */}
          {hover != null && active && (() => {
            const boxW = 168;
            const lines: string[] = [];
            if (active.actual != null) lines.push(`Actual: ${Math.round(active.actual).toLocaleString()} ${series.unit}`);
            lines.push(`Forecast: ${Math.round(chart.fc[hover]).toLocaleString()} ${series.unit}`);
            lines.push(`Band: ${active.lower.toLocaleString()} – ${active.upper.toLocaleString()}`);
            const boxH = 26 + lines.length * 16;
            const bx = Math.min(Math.max(chart.xAt(hover) - boxW / 2, PAD.left), W - PAD.right - boxW);
            return (
              <g pointerEvents="none">
                <rect x={bx} y={PAD.top + 4} width={boxW} height={boxH} rx={8} fill="#0f172a" opacity={0.94} />
                <text x={bx + 12} y={PAD.top + 24} fontSize={13} fontWeight={700} fill="#fff">{active.label}</text>
                {lines.map((ln, k) => (
                  <text key={k} x={bx + 12} y={PAD.top + 44 + k * 16} fontSize={12} fill="#cbd5e1">{ln}</text>
                ))}
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Data table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-heading font-semibold text-slate-800">Series detail — {series.name}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-5 py-2.5 font-semibold">Month</th>
                <th className="px-5 py-2.5 font-semibold text-right">Actual</th>
                <th className="px-5 py-2.5 font-semibold text-right">Forecast</th>
                <th className="px-5 py-2.5 font-semibold text-right">Confidence Band</th>
              </tr>
            </thead>
            <tbody>
              {chart.pts.map((p, i) => (
                <tr
                  key={p.label}
                  className={cn('border-b border-slate-50 last:border-0', hover === i && 'bg-primary-50/60')}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <td className="px-5 py-2.5 font-medium text-slate-700">{p.label}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-600">
                    {p.actual != null ? Math.round(p.actual).toLocaleString() : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-primary-700">
                    {Math.round(chart.fc[i]).toLocaleString()}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-500">
                    {p.lower.toLocaleString()} – {p.upper.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
