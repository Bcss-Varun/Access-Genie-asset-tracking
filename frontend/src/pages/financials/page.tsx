// ─────────────────────────────────────────────────────────────────────────────
// Financials — portfolio book value, depreciation and asset-level valuation.
// Hand-rolled SVG donut + grouped bars. Deterministic, light theme.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allAssets } from '@/lib/dataset';
import { PageHeader, Badge, KpiCard } from '@/components/ui/primitives';
import { cn, formatMoney, nowMs } from '@/lib/utils';
import type { AssetCategory } from '@access-genie/shared';

// Indigo-anchored, harmonious cool palette (index-based so segments stay stable).
const CAT_PALETTE = ['#4f46e5', '#6366f1', '#8b5cf6', '#a78bfa', '#60a5fa', '#38bdf8'];
const colorFor = (_c: string, i: number) => CAT_PALETTE[i % CAT_PALETTE.length];

const YEAR_MS = 365.25 * 86_400_000;
const ageYears = (iso: string) => Math.max(0, (nowMs() - Date.parse(iso)) / YEAR_MS);

// ── Donut geometry helpers ────────────────────────────────────────────────────
function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arc(cx: number, cy: number, ro: number, ri: number, s: number, e: number): string {
  const large = e - s > 180 ? 1 : 0;
  const o1 = polar(cx, cy, ro, s);
  const o2 = polar(cx, cy, ro, e);
  const i2 = polar(cx, cy, ri, e);
  const i1 = polar(cx, cy, ri, s);
  return [
    `M ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `A ${ro} ${ro} 0 ${large} 1 ${o2.x.toFixed(2)} ${o2.y.toFixed(2)}`,
    `L ${i2.x.toFixed(2)} ${i2.y.toFixed(2)}`,
    `A ${ri} ${ri} 0 ${large} 0 ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

interface CatAgg {
  category: AssetCategory;
  book: number;
  purchase: number;
}

export default function FinancialsPage() {
  const [hovered, setHovered] = useState<number | null>(null);

  const purchaseTotal = allAssets.reduce((s, a) => s + a.purchasePrice, 0);
  const bookTotal = allAssets.reduce((s, a) => s + (a.bookValue ?? 0), 0);
  const accumDep = purchaseTotal - bookTotal;
  const avgAge = allAssets.reduce((s, a) => s + ageYears(a.purchaseDate), 0) / allAssets.length;

  const byCat = useMemo<CatAgg[]>(() => {
    const map = new Map<AssetCategory, CatAgg>();
    for (const a of allAssets) {
      const cur = map.get(a.category) ?? { category: a.category, book: 0, purchase: 0 };
      cur.book += a.bookValue ?? 0;
      cur.purchase += a.purchasePrice;
      map.set(a.category, cur);
    }
    return [...map.values()].sort((x, y) => y.book - x.book);
  }, []);

  // Donut segments over book value.
  const CX = 100, CY = 100, RO = 92, RI = 60, GAP = 2;
  const segments = useMemo(() => {
    const safe = bookTotal || 1;
    return byCat.map((d, i) => {
      const frac = d.book / safe;
      const startFrac = byCat.slice(0, i).reduce((s, x) => s + x.book / safe, 0);
      const start = startFrac * 360;
      const end = (startFrac + frac) * 360;
      return { ...d, i, frac, start, end };
    });
  }, [byCat, bookTotal]);
  const active = hovered === null ? null : segments[hovered];

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Financials"
        subtitle="Portfolio valuation, accumulated depreciation and asset-level book value."
        breadcrumb={[{ label: 'Analytics', href: '/reports' }, { label: 'Financials' }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Portfolio Book Value" value={formatMoney(bookTotal)} sub="Current depreciated value" tone="primary" accent />
        <KpiCard label="Purchase Value" value={formatMoney(purchaseTotal)} sub="Original acquisition cost" tone="slate" />
        <KpiCard label="Accumulated Depreciation" value={formatMoney(accumDep)} sub={`${Math.round((accumDep / (purchaseTotal || 1)) * 100)}% of cost basis`} tone="slate" />
        <KpiCard label="Avg Asset Age" value={`${avgAge.toFixed(1)}y`} sub={`${allAssets.length} tracked assets`} tone="slate" />
      </div>

      <div>
        {/* Donut — book value by category (single focal visual) */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Book Value by Category</h2>
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative shrink-0" style={{ width: 208, maxWidth: '100%' }}>
              <svg viewBox="0 0 200 200" className="w-full h-auto" role="img" aria-label="Book value by asset category">
                {segments.map((seg) => {
                  const on = hovered === seg.i;
                  const ro = on ? RO + 5 : RO;
                  const halfGap = Math.min(GAP / 2, (seg.end - seg.start) / 3);
                  return (
                    <path
                      key={seg.category}
                      d={arc(CX, CY, ro, RI, seg.start + halfGap, seg.end - halfGap)}
                      fill={colorFor(seg.category, seg.i)}
                      fillOpacity={hovered === null || on ? 1 : 0.4}
                      className="transition-all duration-150"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHovered(seg.i)}
                      onMouseLeave={() => setHovered(null)}
                    />
                  );
                })}
                {active ? (
                  <>
                    <text x={CX} y={CY - 8} textAnchor="middle" className="fill-slate-500" fontSize={9}>{active.category}</text>
                    <text x={CX} y={CY + 12} textAnchor="middle" className="fill-slate-900" fontSize={20} fontWeight={700}>{formatMoney(active.book)}</text>
                    <text x={CX} y={CY + 27} textAnchor="middle" className="fill-slate-400" fontSize={9}>{(active.frac * 100).toFixed(1)}% of book</text>
                  </>
                ) : (
                  <>
                    <text x={CX} y={CY - 8} textAnchor="middle" className="fill-slate-500" fontSize={9}>Total Book Value</text>
                    <text x={CX} y={CY + 13} textAnchor="middle" className="fill-primary-500" fontSize={22} fontWeight={700}>{formatMoney(bookTotal)}</text>
                    <text x={CX} y={CY + 28} textAnchor="middle" className="fill-slate-400" fontSize={9}>{byCat.length} categories</text>
                  </>
                )}
              </svg>
            </div>
            <ul className="flex-1 w-full space-y-1.5">
              {segments.map((seg) => (
                <li
                  key={seg.category}
                  onMouseEnter={() => setHovered(seg.i)}
                  onMouseLeave={() => setHovered(null)}
                  className={cn('flex items-center justify-between rounded-lg px-2.5 py-1.5 cursor-pointer transition-colors', hovered === seg.i ? 'bg-slate-100' : 'hover:bg-slate-50')}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: colorFor(seg.category, seg.i) }} />
                    <span className="truncate text-sm font-medium text-slate-700">{seg.category}</span>
                  </span>
                  <span className="flex items-baseline gap-2 pl-3 shrink-0">
                    <span className="text-sm font-semibold font-heading text-slate-900">{formatMoney(seg.book)}</span>
                    <span className="w-10 text-right text-xs tabular-nums text-slate-400">{(seg.frac * 100).toFixed(0)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Asset valuation table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Asset Valuation Register</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">Asset</th>
                <th className="px-5 py-2.5">Category</th>
                <th className="px-5 py-2.5 text-right">Purchase Price</th>
                <th className="px-5 py-2.5 text-right">Book Value</th>
                <th className="px-5 py-2.5">Depreciation</th>
                <th className="px-5 py-2.5">Method</th>
              </tr>
            </thead>
            <tbody>
              {allAssets.map((a) => {
                const book = a.bookValue ?? 0;
                const depPct = Math.round(((a.purchasePrice - book) / (a.purchasePrice || 1)) * 100);
                const tone = depPct >= 70 ? 'bg-red-500' : depPct >= 40 ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <Link to={`/assets/${a.id}`} className="font-medium text-slate-900 hover:text-primary-600">{a.name}</Link>
                      <div className="text-xs text-slate-400">{a.id}</div>
                    </td>
                    <td className="px-5 py-3"><Badge tone="slate">{a.category}</Badge></td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">{formatMoney(a.purchasePrice)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium text-slate-900">{formatMoney(book)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div className={cn('h-full rounded-full', tone)} style={{ width: `${depPct}%` }} />
                        </div>
                        <span className="text-xs font-medium tabular-nums text-slate-600">{depPct}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">{a.depreciationMethod ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
