'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Telemetry Explorer — hand-rolled SVG line chart over getTelemetrySeries().
// Frontend-only, deterministic (no Math.random/Date.now in render). Light theme.
// No chart library. Series identity = asset → two overlaid lines get two hues.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { mockAssets, getTelemetrySeries } from '@/lib/mock-data';
import type { TrendPoint } from '@/types/asset';
import { Button } from '@/components/ui/Button';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

// ── Config ───────────────────────────────────────────────────────────────────
type Metric = 'temperature' | 'battery' | 'vibration' | 'signal';
const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: 'temperature', label: 'Temperature', unit: '°C' },
  { key: 'battery', label: 'Battery', unit: '%' },
  { key: 'vibration', label: 'Vibration', unit: 'mm/s' },
  { key: 'signal', label: 'Signal', unit: '%' },
];
type Range = '24h' | '7d';
const RANGES: Range[] = ['24h', '7d'];
const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Series colours (entity identity). Validated CVD-safe pair on the light surface.
const SERIES_A = '#4f46e5'; // sky-600 — primary asset
const SERIES_B = '#7c3aed'; // violet-600 — compare asset

// ── Geometry ─────────────────────────────────────────────────────────────────
const W = 920;
const H = 380;
const M = { top: 24, right: 26, bottom: 40, left: 54 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const PLOT_X1 = M.left + PLOT_W;
const PLOT_Y1 = M.top + PLOT_H;

// Catmull-Rom → cubic-bézier smoothing for a pleasant curve.
function smoothLine(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const t = 1 / 6;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
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

// "Nice" rounded tick step for a raw span / target count.
function niceStep(span: number, target: number): number {
  const raw = span / Math.max(target, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  const norm = raw / mag;
  const step = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
  return step * mag;
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function TelemetryExplorerPage() {
  const { toast } = useToast();

  const telemetryAssets = useMemo(() => mockAssets.filter((a) => a.telemetry), []);

  const [assetId, setAssetId] = useState(telemetryAssets[0]?.id ?? '');
  const [metric, setMetric] = useState<Metric>('temperature');
  const [range, setRange] = useState<Range>('24h');
  const [compare, setCompare] = useState(false);
  const [compareId, setCompareId] = useState(telemetryAssets[1]?.id ?? telemetryAssets[0]?.id ?? '');
  const [hovered, setHovered] = useState<number | null>(null);

  const metricMeta = METRICS.find((m) => m.key === metric)!;
  const assetName = (id: string) => telemetryAssets.find((a) => a.id === id)?.name ?? id;

  const seriesA = useMemo(() => getTelemetrySeries(assetId, metric), [assetId, metric]);
  const seriesB = useMemo(
    () => (compare ? getTelemetrySeries(compareId, metric) : []),
    [compare, compareId, metric],
  );

  // Stat tiles (always over the *selected* series A).
  const stats = useMemo(() => {
    const vals = seriesA.map((p) => p.value);
    const sum = vals.reduce((a, b) => a + b, 0);
    return {
      current: seriesA[seriesA.length - 1]?.value ?? 0,
      min: vals.length ? Math.min(...vals) : 0,
      max: vals.length ? Math.max(...vals) : 0,
      avg: vals.length ? sum / vals.length : 0,
    };
  }, [seriesA]);

  // Shared y-domain (both lines fit) with 8% headroom.
  const { yMin, yMax, ticks } = useMemo(() => {
    const all = [...seriesA, ...seriesB].map((p) => p.value);
    let lo = all.length ? Math.min(...all) : 0;
    let hi = all.length ? Math.max(...all) : 1;
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08;
    lo -= pad; hi += pad;
    const step = niceStep(hi - lo, 5);
    const start = Math.floor(lo / step) * step;
    const end = Math.ceil(hi / step) * step;
    const t: number[] = [];
    for (let v = start; v <= end + 1e-6; v += step) t.push(Math.round(v * 100) / 100);
    return { yMin: start, yMax: end, ticks: t };
  }, [seriesA, seriesB]);

  const n = seriesA.length;
  const xAt = (i: number) => M.left + (n <= 1 ? 0 : (i / (n - 1)) * PLOT_W);
  const yAt = (v: number) =>
    M.top + PLOT_H * (1 - (v - yMin) / Math.max(yMax - yMin, 1e-6));

  const ptsA = seriesA.map((p, i) => ({ x: xAt(i), y: yAt(p.value) }));
  const ptsB = seriesB.map((p, i) => ({ x: xAt(i), y: yAt(p.value) }));

  const areaA = ptsA.length
    ? `${smoothLine(ptsA)} L ${PLOT_X1} ${PLOT_Y1} L ${M.left} ${PLOT_Y1} Z`
    : '';

  // X tick label per index, honouring the (visual-only) range toggle.
  const xLabelAt = (i: number) =>
    range === '24h'
      ? seriesA[i]?.label ?? ''
      : DAY_ABBR[Math.min(DAY_ABBR.length - 1, Math.floor((i / Math.max(n - 1, 1)) * 6))];

  // Show ~6 x ticks.
  const xTickIdx = useMemo(() => {
    const every = Math.max(1, Math.round((n - 1) / 5));
    const idx: number[] = [];
    for (let i = 0; i < n; i += every) idx.push(i);
    if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
    return idx;
  }, [n]);

  const hov = hovered != null && hovered >= 0 && hovered < n ? hovered : null;

  function exportCsv() {
    toast({
      tone: 'success',
      title: 'Export started',
      description: `${assetName(assetId)} · ${metricMeta.label} (${range}) — ${n} rows queued as CSV.`,
    });
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Telemetry Explorer"
        subtitle="Inspect per-asset sensor trends and compare devices side by side."
        breadcrumb={[{ label: 'Tracking', href: '/tracking' }, { label: 'Telemetry Explorer' }]}
        actions={
          <Button variant="outline" size="md" onClick={exportCsv}>
            ⭳ Export CSV
          </Button>
        }
      />

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-xl p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
            {/* Asset picker */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-500">Asset</span>
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="min-w-[15rem] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              >
                {telemetryAssets.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>

            {/* Metric picker */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-500">Metric</span>
              <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMetric(m.key)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      metric === m.key
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time range */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-500">Range</span>
              <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      range === r ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    {r === '24h' ? '24h' : '7d'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Compare toggle + second asset */}
          <div className="flex flex-wrap items-end gap-4">
            <button
              type="button"
              role="switch"
              aria-checked={compare}
              onClick={() => setCompare((c) => !c)}
              className="flex items-center gap-2.5"
            >
              <span
                className={cn(
                  'relative h-6 w-11 rounded-full transition-colors',
                  compare ? 'bg-primary-600' : 'bg-slate-300',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    compare ? 'translate-x-[22px]' : 'translate-x-0.5',
                  )}
                />
              </span>
              <span className="text-sm font-medium text-slate-700">Compare</span>
            </button>

            {compare && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-slate-500">Compare with</span>
                <select
                  value={compareId}
                  onChange={(e) => setCompareId(e.target.value)}
                  className="min-w-[15rem] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                >
                  {telemetryAssets.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      </div>

      {/* ── Stat tiles ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Current" value={`${fmt(stats.current)}${metricMeta.unit}`} tone="primary" accent sub="Latest reading" />
        <KpiCard label="Minimum" value={`${fmt(stats.min)}${metricMeta.unit}`} sub="Over window" />
        <KpiCard label="Maximum" value={`${fmt(stats.max)}${metricMeta.unit}`} sub="Over window" />
        <KpiCard label="Average" value={`${fmt(stats.avg)}${metricMeta.unit}`} sub="Mean of series" />
      </div>

      {/* ── Chart ────────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-xl p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              {metricMeta.label} <span className="text-slate-400 font-medium">· {metricMeta.unit}</span>
            </h2>
            <p className="text-xs text-slate-500">
              {range === '24h' ? 'Last 24 hours · hourly' : 'Last 7 days · daily rollup'}
            </p>
          </div>
          {/* Legend — always shown; carries identity for the compare case. */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES_A }} />
              {assetName(assetId)}
            </span>
            {compare && (
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES_B }} />
                {assetName(compareId)}
              </span>
            )}
          </div>
        </div>

        <div className="relative w-full">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            style={{ height: 'auto' }}
            role="img"
            aria-label={`${metricMeta.label} telemetry line chart for ${assetName(assetId)}`}
            onMouseLeave={() => setHovered(null)}
          >
            <defs>
              <linearGradient id="tel-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES_A} stopOpacity="0.22" />
                <stop offset="100%" stopColor={SERIES_A} stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Gridlines + y ticks */}
            {ticks.map((v) => {
              const y = yAt(v);
              if (y < M.top - 0.5 || y > PLOT_Y1 + 0.5) return null;
              return (
                <g key={`y-${v}`}>
                  <line x1={M.left} y1={y} x2={PLOT_X1} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                  <text x={M.left - 10} y={y + 4} textAnchor="end" className="fill-slate-400" fontSize="12">
                    {fmt(v)}
                  </text>
                </g>
              );
            })}

            {/* Axes */}
            <line x1={M.left} y1={PLOT_Y1} x2={PLOT_X1} y2={PLOT_Y1} stroke="#cbd5e1" strokeWidth="1.5" />
            <line x1={M.left} y1={M.top} x2={M.left} y2={PLOT_Y1} stroke="#cbd5e1" strokeWidth="1.5" />

            {/* X ticks + labels */}
            {xTickIdx.map((i) => (
              <g key={`x-${i}`}>
                <line x1={xAt(i)} y1={PLOT_Y1} x2={xAt(i)} y2={PLOT_Y1 + 5} stroke="#cbd5e1" strokeWidth="1" />
                <text x={xAt(i)} y={PLOT_Y1 + 20} textAnchor="middle" className="fill-slate-400" fontSize="12">
                  {xLabelAt(i)}
                </text>
              </g>
            ))}

            {/* Area fill (series A) */}
            {areaA && <path d={areaA} fill="url(#tel-area)" />}

            {/* Compare line B (under A) */}
            {compare && ptsB.length > 0 && (
              <path d={smoothLine(ptsB)} fill="none" stroke={SERIES_B} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            )}

            {/* Primary line A */}
            {ptsA.length > 0 && (
              <path d={smoothLine(ptsA)} fill="none" stroke={SERIES_A} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            )}

            {/* Dots */}
            {ptsA.map((p, i) => (
              <circle key={`da-${i}`} cx={p.x} cy={p.y} r={hov === i ? 5 : 3} fill="#fff" stroke={SERIES_A} strokeWidth="2" />
            ))}
            {compare && ptsB.map((p, i) => (
              <circle key={`db-${i}`} cx={p.x} cy={p.y} r={hov === i ? 5 : 3} fill="#fff" stroke={SERIES_B} strokeWidth="2" />
            ))}

            {/* Hover crosshair */}
            {hov != null && (
              <line x1={xAt(hov)} y1={M.top} x2={xAt(hov)} y2={PLOT_Y1} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
            )}

            {/* Hit targets */}
            {seriesA.map((_, i) => {
              const bandW = PLOT_W / Math.max(n - 1, 1);
              return (
                <rect
                  key={`hit-${i}`}
                  x={xAt(i) - bandW / 2}
                  y={M.top}
                  width={bandW}
                  height={PLOT_H}
                  fill="transparent"
                  onMouseEnter={() => setHovered(i)}
                />
              );
            })}
          </svg>

          {/* Tooltip (HTML overlay, positioned as % of viewBox → responsive) */}
          {hov != null && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
              style={{
                left: `${(xAt(hov) / W) * 100}%`,
                top: `${(Math.min(yAt(seriesA[hov].value), compare && seriesB[hov] ? yAt(seriesB[hov].value) : Infinity) / H) * 100}%`,
                marginTop: '-10px',
              }}
            >
              <div className="mb-1 font-semibold text-slate-700">{xLabelAt(hov)}</div>
              <div className="flex items-center gap-1.5 text-slate-600">
                <span className="h-2 w-2 rounded-full" style={{ background: SERIES_A }} />
                <span className="font-medium text-slate-900">{fmt(seriesA[hov].value)}{metricMeta.unit}</span>
              </div>
              {compare && seriesB[hov] && (
                <div className="mt-0.5 flex items-center gap-1.5 text-slate-600">
                  <span className="h-2 w-2 rounded-full" style={{ background: SERIES_B }} />
                  <span className="font-medium text-slate-900">{fmt(seriesB[hov].value)}{metricMeta.unit}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Raw series table ─────────────────────────────────────────────── */}
      <div className="glass-panel rounded-xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-800">Raw series</h3>
            <Badge tone="slate">{n} readings</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>⭳ Export CSV</Button>
        </div>
        <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Hour</th>
                <th className="px-4 py-2 text-right font-medium">{metricMeta.label} ({metricMeta.unit})</th>
                {compare && (
                  <th className="px-4 py-2 text-right font-medium">Compare ({metricMeta.unit})</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {seriesA.map((p: TrendPoint, i) => (
                <tr
                  key={p.label}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  className={cn('transition-colors', hov === i ? 'bg-primary-50/60' : 'hover:bg-slate-50')}
                >
                  <td className="px-4 py-2 font-mono text-slate-600">{p.label}</td>
                  <td className="px-4 py-2 text-right font-medium text-slate-900">{fmt(p.value)}</td>
                  {compare && (
                    <td className="px-4 py-2 text-right text-slate-600">
                      {seriesB[i] ? fmt(seriesB[i].value) : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
