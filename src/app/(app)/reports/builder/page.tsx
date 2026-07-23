'use client';

import { useMemo, useState } from 'react';
import { mockAssets } from '@/lib/mock-data';
import type { Asset } from '@/types/asset';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, formatMoney } from '@/lib/utils';

// ── Field definitions ─────────────────────────────────────────────────────────
type DimName = 'Category' | 'Facility' | 'Status' | 'Custodian';
type MeaName = 'Count' | 'Book Value' | 'Utilization' | 'Health';

const DIMENSIONS: Record<DimName, (a: Asset) => string> = {
  Category: (a) => a.category,
  Facility: (a) => a.location.name,
  Status: (a) => a.status,
  Custodian: (a) => a.custodian,
};

const MEASURES: Record<MeaName, { agg: (g: Asset[]) => number; fmt: (n: number) => string }> = {
  Count: { agg: (g) => g.length, fmt: (n) => `${n}` },
  'Book Value': { agg: (g) => g.reduce((s, a) => s + (a.bookValue ?? 0), 0), fmt: formatMoney },
  Utilization: { agg: (g) => (g.length ? Math.round(g.reduce((s, a) => s + (a.utilization ?? 0), 0) / g.length) : 0), fmt: (n) => `${n}%` },
  Health: { agg: (g) => (g.length ? Math.round(g.reduce((s, a) => s + a.healthScore, 0) / g.length) : 0), fmt: (n) => `${n}` },
};

const DIM_NAMES = Object.keys(DIMENSIONS) as DimName[];
const MEA_NAMES = Object.keys(MEASURES) as MeaName[];
const BAR = '#6366f1';

// ── Simple hand-rolled bar chart ──────────────────────────────────────────────
function BarChart({ data, fmt }: { data: { label: string; value: number }[]; fmt: (n: number) => string }) {
  const W = 720, H = 300, P = { t: 20, r: 16, b: 54, l: 48 };
  const plotW = W - P.l - P.r, plotH = H - P.t - P.b;
  const max = Math.max(1, ...data.map((d) => d.value));
  const band = plotW / Math.max(1, data.length);
  const bw = band * 0.6;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Aggregated bar chart">
      {ticks.map((t) => {
        const y = P.t + plotH - (t / max) * plotH;
        return (
          <g key={t}>
            <line x1={P.l} x2={P.l + plotW} y1={y} y2={y} className="stroke-slate-200" strokeWidth={1} />
            <text x={P.l - 8} y={y} textAnchor="end" dominantBaseline="middle" className="fill-slate-400" fontSize={10}>{fmt(t)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const h = (d.value / max) * plotH;
        const x = P.l + band * i + (band - bw) / 2;
        const y = P.t + plotH - h;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={bw} height={Math.max(0, h)} rx={5} fill={BAR} />
            <text x={x + bw / 2} y={y - 6} textAnchor="middle" className="fill-slate-600" fontSize={10} fontWeight={600}>{fmt(d.value)}</text>
            <text x={x + bw / 2} y={P.t + plotH + 16} textAnchor="middle" className="fill-slate-500" fontSize={10}>
              {d.label.length > 12 ? `${d.label.slice(0, 11)}…` : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Zone widget ───────────────────────────────────────────────────────────────
function DropZone({ label, items, onRemove, hint }: { label: string; items: string[]; onRemove: (v: string) => void; hint: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">{label}</div>
      <div className={cn('min-h-[52px] rounded-lg border-2 border-dashed p-2 flex flex-wrap gap-2 content-start', items.length ? 'border-slate-200 bg-slate-50/60' : 'border-slate-200')}>
        {items.length === 0 ? (
          <span className="text-xs text-slate-400 self-center px-1">{hint}</span>
        ) : (
          items.map((it) => (
            <span key={it} className="inline-flex items-center gap-1.5 rounded-md bg-primary-50 border border-primary-100 px-2 py-1 text-xs font-medium text-primary-700">
              {it}
              <button onClick={() => onRemove(it)} className="text-primary-400 hover:text-primary-700" aria-label={`Remove ${it}`}>✕</button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export default function ReportBuilderPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<DimName[]>(['Category']);
  const [cols, setCols] = useState<DimName[]>([]);
  const [measures, setMeasures] = useState<MeaName[]>(['Count']);
  const [chart, setChart] = useState<'Bar' | 'Table'>('Table');
  const [facilityFilter, setFacilityFilter] = useState<Set<string>>(new Set());

  const facilities = useMemo(() => Array.from(new Set(mockAssets.map((a) => a.location.name))), []);

  const addDim = (d: DimName, zone: 'rows' | 'cols') => {
    const set = zone === 'rows' ? setRows : setCols;
    set((prev) => (prev.includes(d) ? prev : [...prev, d]));
    // avoid the same dimension living in both zones
    if (zone === 'rows') setCols((prev) => prev.filter((x) => x !== d));
    else setRows((prev) => prev.filter((x) => x !== d));
  };
  const addMeasure = (m: MeaName) => setMeasures((prev) => (prev.includes(m) ? prev : [...prev, m]));

  const data = useMemo(
    () => (facilityFilter.size ? mockAssets.filter((a) => facilityFilter.has(a.location.name)) : mockAssets),
    [facilityFilter],
  );

  const rowDim = rows[0];
  const colDim = cols[0];
  const activeMeasures = useMemo<MeaName[]>(() => (measures.length ? measures : ['Count']), [measures]);

  const pivot = useMemo(() => {
    if (!rowDim) return null;
    const rowFn = DIMENSIONS[rowDim];
    const rowKeys = Array.from(new Set(data.map(rowFn))).sort();
    const colFn = colDim ? DIMENSIONS[colDim] : null;
    const colKeys = colFn ? Array.from(new Set(data.map(colFn))).sort() : [null];
    const primary = MEASURES[activeMeasures[0]];
    const cell = (rk: string, ck: string | null) =>
      data.filter((a) => rowFn(a) === rk && (ck === null || colFn!(a) === ck));
    return { rowKeys, colKeys, cell, primary };
  }, [data, rowDim, colDim, activeMeasures]);

  const chartData = useMemo(() => {
    if (!pivot) return [];
    const rowFn = DIMENSIONS[rowDim];
    const primary = MEASURES[activeMeasures[0]];
    return pivot.rowKeys.map((rk) => ({ label: rk, value: primary.agg(data.filter((a) => rowFn(a) === rk)) }));
  }, [pivot, data, rowDim, activeMeasures]);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Report Builder"
        subtitle="Drag fields into Rows, Columns and Measures to compose a report."
        breadcrumb={[{ label: 'Analytics', href: '/reports' }, { label: 'Report Builder' }]}
        actions={
          <Button onClick={() => toast({ title: 'Report saved', description: `Saved as “Untitled — ${rowDim ?? 'blank'} by ${activeMeasures[0]}”.`, tone: 'success' })}>
            Save report
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_240px] gap-6 flex-1 min-h-0">
        {/* Left — field shelf + zones */}
        <div className="glass-panel rounded-xl p-4 space-y-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Dimensions</div>
            <div className="space-y-1.5">
              {DIM_NAMES.map((d) => (
                <div key={d} className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-1.5">
                  <span className="text-sm font-medium text-slate-700">{d}</span>
                  <span className="flex gap-1">
                    <button onClick={() => addDim(d, 'rows')} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-primary-50 hover:text-primary-700">Row</button>
                    <button onClick={() => addDim(d, 'cols')} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-primary-50 hover:text-primary-700">Col</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Measures</div>
            <div className="flex flex-wrap gap-1.5">
              {MEA_NAMES.map((m) => (
                <button key={m} onClick={() => addMeasure(m)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-primary-50 hover:text-primary-700 hover:border-primary-200">
                  ＋ {m}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <DropZone label="Rows" items={rows} hint="Add a dimension" onRemove={(v) => setRows((p) => p.filter((x) => x !== v))} />
            <DropZone label="Columns" items={cols} hint="Optional" onRemove={(v) => setCols((p) => p.filter((x) => x !== v))} />
            <DropZone label="Measures" items={measures} hint="Add a measure" onRemove={(v) => setMeasures((p) => p.filter((x) => x !== v))} />
          </div>
        </div>

        {/* Center — live preview */}
        <div className="glass-panel rounded-xl p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">Live Preview</h2>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
              {(['Table', 'Bar'] as const).map((v) => (
                <button key={v} onClick={() => setChart(v)} className={cn('px-3 py-1 text-xs font-medium rounded-md transition-colors', chart === v ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {!pivot ? (
            <div className="flex-1 flex items-center justify-center text-center text-sm text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
              Add at least one Row dimension to build a preview.
            </div>
          ) : chart === 'Bar' ? (
            <div className="flex-1"><BarChart data={chartData} fmt={pivot.primary.fmt} /></div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{rowDim}</th>
                    {pivot.colKeys.map((ck, i) => (
                      <th key={i} className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        {ck ?? activeMeasures[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pivot.rowKeys.map((rk) => (
                    <tr key={rk} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-medium text-slate-900">{rk}</td>
                      {pivot.colKeys.map((ck, i) => (
                        <td key={i} className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {pivot.primary.fmt(pivot.primary.agg(pivot.cell(rk, ck)))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {colDim && (
                <p className="mt-2 text-xs text-slate-400">Pivoted by <b>{colDim}</b> · measure <b>{activeMeasures[0]}</b></p>
              )}
            </div>
          )}
        </div>

        {/* Right — chart type + filters */}
        <div className="glass-panel rounded-xl p-4 space-y-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Visualization</div>
            <div className="grid grid-cols-2 gap-2">
              {(['Table', 'Bar'] as const).map((v) => (
                <button key={v} onClick={() => setChart(v)} className={cn('rounded-lg border px-2 py-2 text-xs font-medium', chart === v ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                  {v === 'Table' ? '▦ Table' : '▮ Bar'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Filters — Facility</div>
            <div className="space-y-1.5">
              {facilities.map((f) => {
                const on = facilityFilter.has(f);
                return (
                  <label key={f} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setFacilityFilter((prev) => {
                          const next = new Set(prev);
                          if (next.has(f)) next.delete(f); else next.add(f);
                          return next;
                        })
                      }
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="truncate">{f}</span>
                  </label>
                );
              })}
            </div>
            {facilityFilter.size > 0 && (
              <button onClick={() => setFacilityFilter(new Set())} className="mt-2 text-xs font-medium text-primary-600 hover:text-primary-700">Clear filters</button>
            )}
          </div>
          <div className="pt-3 border-t border-slate-100">
            <Badge tone="slate">{data.length} of {mockAssets.length} assets</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
