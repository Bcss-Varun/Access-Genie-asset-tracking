'use client';

import { useMemo } from 'react';
import { mockParts } from '@/lib/mock-data';
import type { Part } from '@/types/asset';
import { PageHeader, Badge, KpiCard } from '@/components/ui/primitives';
import { formatMoney } from '@/lib/utils';

// Deterministic synthetic monthly consumption derived from a part's own attributes.
// (No Math.random / Date.now → stable across server & client renders.)
const seedOf = (s: string): number => [...s].reduce((a, c) => a + c.charCodeAt(0), 0);
const issuedQty = (p: Part): number => p.reorderPoint * 2 + (seedOf(p.sku) % 9) + 1;
const issuedValue = (p: Part): number => issuedQty(p) * p.unitCost;

const BAR_COLOR = '#6366f1'; // primary-500

export default function ConsumptionPage() {
  const { categories, topParts, totalIssued, totalValue, topCategory } = useMemo(() => {
    // Aggregate by category.
    const byCat = new Map<string, { category: string; qty: number; value: number }>();
    for (const p of mockParts) {
      const row = byCat.get(p.category) ?? { category: p.category, qty: 0, value: 0 };
      row.qty += issuedQty(p);
      row.value += issuedValue(p);
      byCat.set(p.category, row);
    }
    const categories = [...byCat.values()].sort((a, b) => b.value - a.value);

    const topParts = [...mockParts]
      .map((p) => ({ part: p, qty: issuedQty(p), value: issuedValue(p) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const totalIssued = mockParts.reduce((s, p) => s + issuedQty(p), 0);
    const totalValue = categories.reduce((s, c) => s + c.value, 0);
    const topCategory = categories[0]?.category ?? '—';

    return { categories, topParts, totalIssued, totalValue, topCategory };
  }, []);

  // ── SVG horizontal bar-chart geometry ────────────────────────────────────────
  const W = 760;
  const rowH = 34;
  const gap = 12;
  const gutter = 150; // left label column
  const rightPad = 70; // value label
  const topPad = 8;
  const barMax = Math.max(...categories.map((c) => c.value), 1);
  const barAreaW = W - gutter - rightPad;
  const H = topPad * 2 + categories.length * rowH + (categories.length - 1) * gap;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Parts Consumption"
        subtitle="Issued-parts analytics — consumption by category and top-moving SKUs (trailing 30 days)."
        breadcrumb={[
          { label: 'Inventory', href: '/warehouses' },
          { label: 'Consumption' },
        ]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Parts Issued (30d)" value={totalIssued.toLocaleString()} sub="Units drawn from stock" tone="primary" accent />
        <KpiCard label="Consumption Value" value={formatMoney(totalValue)} sub="Cost of parts issued" tone="slate" />
        <KpiCard label="Top Category" value={topCategory} sub="Highest consumption value" tone="slate" />
      </div>

      {/* Consumption-by-category bar chart */}
      <div className="glass-panel rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">Consumption Value by Category</h2>
          <span className="text-xs text-slate-400">Trailing 30 days</span>
        </div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 520 }} role="img" aria-label="Consumption value by category">
            {categories.map((c, i) => {
              const y = topPad + i * (rowH + gap);
              const w = (c.value / barMax) * barAreaW;
              return (
                <g key={c.category}>
                  <text x={gutter - 10} y={y + rowH / 2} textAnchor="end" dominantBaseline="central" fontSize={12} fill="#475569" fontWeight={500}>
                    {c.category}
                  </text>
                  <rect x={gutter} y={y} width={barAreaW} height={rowH} rx={6} fill="#f1f5f9" />
                  <rect x={gutter} y={y} width={Math.max(w, 2)} height={rowH} rx={6} fill={BAR_COLOR} />
                  <text x={gutter + Math.max(w, 2) + 8} y={y + rowH / 2} dominantBaseline="central" fontSize={11} fill="#64748b" fontWeight={600}>
                    {formatMoney(c.value)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Top consumed parts table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-5 pb-3">
          <h2 className="text-base font-semibold text-slate-800">Top Consumed Parts</h2>
          <span className="text-xs text-slate-400">By consumption value</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">SKU</th>
                <th className="px-5 py-2.5">Part</th>
                <th className="px-5 py-2.5">Category</th>
                <th className="px-5 py-2.5 text-right">Issued (30d)</th>
                <th className="px-5 py-2.5 text-right">Unit Cost</th>
                <th className="px-5 py-2.5 text-right">Consumption Value</th>
              </tr>
            </thead>
            <tbody>
              {topParts.map(({ part, qty, value }) => (
                <tr key={part.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs font-medium text-slate-700">{part.sku}</td>
                  <td className="px-5 py-3 text-slate-700">{part.name}</td>
                  <td className="px-5 py-3">
                    <Badge tone="slate">{part.category}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">{qty}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-500">{formatMoney(part.unitCost)}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-800">{formatMoney(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
