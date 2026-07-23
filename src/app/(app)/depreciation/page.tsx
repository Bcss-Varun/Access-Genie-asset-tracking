'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Depreciation — straight-line schedules & aggregate book-value projection.
// Hand-rolled SVG line chart. Deterministic (derived from purchase/book).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { mockAssets } from '@/lib/mock-data';
import { PageHeader, Badge, KpiCard } from '@/components/ui/primitives';
import { formatMoney, DEMO_NOW } from '@/lib/utils';
import type { Asset } from '@/types/asset';

const CURRENT_YEAR = new Date(DEMO_NOW).getUTCFullYear();

// Derive a straight-line useful life (years) from the method string, else default.
function usefulLife(method: string | undefined): number {
  const m = method?.match(/(\d+)\s*yr/);
  if (m) return Number(m[1]);
  if (method?.toLowerCase().includes('declining')) return 6;
  if (method?.toLowerCase().includes('units')) return 8;
  return 10;
}

interface Sched {
  asset: Asset;
  purchase: number;
  book: number;
  annual: number;       // straight-line annual depreciation
  remainingYears: number;
  nearingFull: boolean;
}

export default function DepreciationPage() {
  const [hovered, setHovered] = useState<number | null>(null);

  const schedules = useMemo<Sched[]>(() => {
    return mockAssets.map((a) => {
      const purchase = a.purchasePrice;
      const book = a.bookValue ?? 0;
      const life = usefulLife(a.depreciationMethod);
      const annual = purchase / life;
      const remainingYears = annual > 0 ? Math.max(0, book / annual) : 0;
      const nearingFull = book <= purchase * 0.2 || remainingYears <= 1;
      return { asset: a, purchase, book, annual, remainingYears, nearingFull };
    });
  }, []);

  const bookTotal = schedules.reduce((s, x) => s + x.book, 0);
  const annualTotal = schedules.reduce((s, x) => s + x.annual, 0);
  const nearingCount = schedules.filter((x) => x.nearingFull).length;

  // Aggregate 10-year projection: for each year t, Σ max(0, book - annual*t).
  const HORIZON = 10;
  const projection = useMemo(() => {
    const pts: { year: number; value: number }[] = [];
    for (let t = 0; t <= HORIZON; t++) {
      const value = schedules.reduce((s, x) => s + Math.max(0, x.book - x.annual * t), 0);
      pts.push({ year: CURRENT_YEAR + t, value });
    }
    return pts;
  }, [schedules]);

  // Chart geometry.
  const W = 760, H = 320, M = { top: 24, right: 24, bottom: 40, left: 56 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const y1 = M.top + plotH;
  const vMax = Math.max(...projection.map((p) => p.value), 1);
  const vTop = Math.ceil(vMax / 100_000) * 100_000;
  const xFor = (i: number) => M.left + (plotW * i) / (projection.length - 1);
  const yFor = (v: number) => y1 - (v / vTop) * plotH;
  const lineD = projection.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p.value).toFixed(1)}`).join(' ');
  const areaD = `${lineD} L ${xFor(projection.length - 1).toFixed(1)} ${y1} L ${xFor(0).toFixed(1)} ${y1} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * vTop);
  const active = hovered === null ? null : projection[hovered];

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Depreciation Schedules"
        subtitle="Straight-line schedules and a 10-year aggregate book-value projection."
        breadcrumb={[{ label: 'Analytics', href: '/dashboards' }, { label: 'Depreciation' }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Current Book Value" value={formatMoney(bookTotal)} sub="Across all schedules" tone="primary" accent />
        <KpiCard label="Annual Depreciation" value={formatMoney(annualTotal)} sub="Straight-line, per year" tone="slate" />
        <KpiCard label="Fully Depreciated In" value={`${Math.ceil(bookTotal / (annualTotal || 1))}y`} sub="At current run-rate" tone="slate" />
        <KpiCard label="Nearing Full" value={nearingCount} sub="≤20% book or ≤1yr life" tone="red" />
      </div>

      {/* Projection chart */}
      <div className="glass-panel rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-800">Aggregate Book Value Projection</h2>
          <span className="text-xs text-slate-400">{CURRENT_YEAR}–{CURRENT_YEAR + HORIZON} · straight-line</span>
        </div>
        <div className="relative w-full">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Aggregate book value declining over ten years">
            <defs>
              <linearGradient id="depArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.26" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
              </linearGradient>
            </defs>
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={M.left + plotW} y1={yFor(t)} y2={yFor(t)} className="stroke-slate-200" strokeWidth={1} strokeOpacity={0.6} />
                <text x={M.left - 10} y={yFor(t)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400" fontSize={11}>{formatMoney(t)}</text>
              </g>
            ))}
            <path d={areaD} fill="url(#depArea)" />
            <path d={lineD} fill="none" stroke="#4f46e5" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {hovered !== null && (
              <line x1={xFor(hovered)} x2={xFor(hovered)} y1={M.top} y2={y1} stroke="#4f46e5" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.5} />
            )}
            {projection.map((p, i) => (
              <circle key={p.year} cx={xFor(i)} cy={yFor(p.value)} r={hovered === i ? 6 : 3.5} fill="#4f46e5" stroke="#fff" strokeWidth={hovered === i ? 2.5 : 2} className="transition-all duration-150" />
            ))}
            {projection.map((p, i) => (
              <text key={`x-${p.year}`} x={xFor(i)} y={y1 + 22} textAnchor="middle" className={hovered === i ? 'fill-slate-700' : 'fill-slate-400'} fontSize={11} fontWeight={hovered === i ? 600 : 400}>{p.year}</text>
            ))}
            {projection.map((p, i) => (
              <rect key={`hit-${p.year}`} x={xFor(i) - plotW / (projection.length - 1) / 2} y={M.top} width={plotW / (projection.length - 1)} height={plotH} fill="transparent" onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
            ))}
          </svg>
          {active && (
            <div className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur" style={{ left: `${(xFor(hovered!) / W) * 100}%`, top: `${(yFor(active.value) / H) * 100}%`, transform: 'translate(-50%, -125%)', minWidth: 120 }}>
              <div className="mb-1 font-semibold text-slate-700">{active.year}</div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Book value</span>
                <span className="font-semibold text-slate-900">{formatMoney(active.value)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Schedule table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Asset Depreciation Schedule</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">Asset</th>
                <th className="px-5 py-2.5">Method</th>
                <th className="px-5 py-2.5 text-right">Book Value</th>
                <th className="px-5 py-2.5 text-right">Annual Dep.</th>
                <th className="px-5 py-2.5 text-right">Remaining Life</th>
                <th className="px-5 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.asset.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/assets/${s.asset.id}`} className="font-medium text-slate-900 hover:text-primary-600">{s.asset.name}</Link>
                    <div className="text-xs text-slate-400">{s.asset.id}</div>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{s.asset.depreciationMethod ?? '—'}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-slate-900">{formatMoney(s.book)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">{formatMoney(Math.round(s.annual))}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">{s.remainingYears.toFixed(1)}y</td>
                  <td className="px-5 py-3">
                    {s.nearingFull
                      ? <Badge tone="amber">Nearing full</Badge>
                      : <Badge tone="emerald">On schedule</Badge>}
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
