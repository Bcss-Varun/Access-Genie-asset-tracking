import { useMemo, useState } from 'react';
import { allAssets } from '@/lib/dataset';
import type { Asset } from '@access-genie/shared';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, formatMoney } from '@/lib/utils';
import { downloadCsv } from '@/api/configuration';

type DimName = 'Category' | 'Status' | 'Facility';
type MeaName = 'Count' | 'Book Value' | 'Avg Health' | 'Avg Utilization';

const DIMENSIONS: Record<DimName, (a: Asset) => string> = {
  Category: (a) => a.category,
  Status: (a) => a.status,
  Facility: (a) => a.location.name,
};

const MEASURES: Record<MeaName, { agg: (g: Asset[]) => number; fmt: (n: number) => string }> = {
  Count: { agg: (g) => g.length, fmt: (n) => `${n}` },
  'Book Value': { agg: (g) => g.reduce((s, a) => s + (a.bookValue ?? 0), 0), fmt: formatMoney },
  'Avg Health': { agg: (g) => (g.length ? Math.round(g.reduce((s, a) => s + a.healthScore, 0) / g.length) : 0), fmt: (n) => `${n}` },
  'Avg Utilization': { agg: (g) => (g.length ? Math.round(g.reduce((s, a) => s + (a.utilization ?? 0), 0) / g.length) : 0), fmt: (n) => `${n}%` },
};

const DIM_NAMES = Object.keys(DIMENSIONS) as DimName[];
const MEA_NAMES = Object.keys(MEASURES) as MeaName[];
const BAR = '#6366f1';

function BarChart({ data, fmt }: { data: { label: string; value: number }[]; fmt: (n: number) => string }) {
  const W = 760, H = 340, P = { t: 22, r: 16, b: 60, l: 56 };
  const plotW = W - P.l - P.r, plotH = H - P.t - P.b;
  const max = Math.max(1, ...data.map((d) => d.value));
  const band = plotW / Math.max(1, data.length);
  const bw = band * 0.62;
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
            <rect x={x} y={y} width={bw} height={Math.max(0, h)} rx={5} fill={BAR} className="transition-all" />
            <text x={x + bw / 2} y={y - 6} textAnchor="middle" className="fill-slate-600" fontSize={11} fontWeight={600}>{fmt(d.value)}</text>
            <text x={x + bw / 2} y={P.t + plotH + 18} textAnchor="middle" className="fill-slate-500" fontSize={10}>
              {d.label.length > 13 ? `${d.label.slice(0, 12)}…` : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function BiExplorerPage() {
  const { toast } = useToast();
  const [dim, setDim] = useState<DimName>('Category');
  const [measure, setMeasure] = useState<MeaName>('Count');
  const [view, setView] = useState<'Chart' | 'Table'>('Chart');

  const rows = useMemo(() => {
    const fn = DIMENSIONS[dim];
    const m = MEASURES[measure];
    const keys = Array.from(new Set(allAssets.map(fn))).sort();
    return keys.map((k) => {
      const group = allAssets.filter((a) => fn(a) === k);
      return { label: k, value: m.agg(group), count: group.length };
    });
  }, [dim, measure]);

  const fmt = MEASURES[measure].fmt;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="BI Explorer"
        subtitle="Ad-hoc pivots over the live asset graph — pick a dimension and measure."
        breadcrumb={[{ label: 'Analytics', href: '/reports' }, { label: 'BI Explorer' }]}
        actions={
          <Button
            variant="outline"
            onClick={() => {
              // The pivot on screen, as its own file — the rows only exist here.
              const n = downloadCsv(
                `${dim}-by-${measure}-${new Date().toISOString().slice(0, 10)}.csv`,
                rows.map((r) => ({ [dim]: r.label, Assets: r.count, [measure]: r.value })),
              );
              toast({
                title: n > 0 ? `${n} row${n === 1 ? '' : 's'} exported` : 'Nothing to export',
                description: n > 0 ? `${measure} by ${dim}, downloaded as CSV.` : 'This pivot has no rows.',
                tone: n > 0 ? 'success' : 'info',
              });
            }}
          >
            Export CSV
          </Button>
        }
      />

      {/* Controls */}
      <div className="glass-panel rounded-xl p-4 flex flex-wrap items-end gap-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Dimension</div>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
            {DIM_NAMES.map((d) => (
              <button key={d} onClick={() => setDim(d)} className={cn('px-3 py-1.5 text-sm font-medium rounded-md transition-colors', dim === d ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>
                {d}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Measure</div>
          <div className="inline-flex flex-wrap rounded-lg border border-slate-200 p-0.5">
            {MEA_NAMES.map((m) => (
              <button key={m} onClick={() => setMeasure(m)} className={cn('px-3 py-1.5 text-sm font-medium rounded-md transition-colors', measure === m ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">View</div>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
            {(['Chart', 'Table'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn('px-3 py-1.5 text-sm font-medium rounded-md transition-colors', view === v ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="glass-panel rounded-xl p-5 flex-1 min-h-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">{measure} by {dim}</h2>
          <Badge tone="slate">{rows.length} groups · {allAssets.length} assets</Badge>
        </div>

        {view === 'Chart' ? (
          <BarChart data={rows.map((r) => ({ label: r.label, value: r.value }))} fmt={fmt} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{dim}</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Assets</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">{measure}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.label} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{r.label}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">{r.count}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">{fmt(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
