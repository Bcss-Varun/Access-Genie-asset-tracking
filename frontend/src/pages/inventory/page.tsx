import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allParts, getWarehouse } from '@/lib/dataset';
import type { Part, AbcClass } from '@access-genie/shared';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { AdjustStockDialog, PartDialog } from '@/components/inventory/InventoryDialogs';
import { downloadCsv } from '@/api/configuration';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, formatMoney } from '@/lib/utils';

const abcTone = (c: AbcClass): 'red' | 'amber' | 'slate' =>
  c === 'A' ? 'red' : c === 'B' ? 'amber' : 'slate';

type AbcFilter = 'All' | AbcClass;
const ABC_FILTERS: AbcFilter[] = ['All', 'A', 'B', 'C'];

const stockBarColor = (below: boolean): string => (below ? 'bg-red-500' : 'bg-emerald-500');

type Dialog = { mode: 'new-part' } | { mode: 'edit-part'; part: Part } | { mode: 'adjust'; part: Part };

export default function InventoryPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [abc, setAbc] = useState<AbcFilter>('All');
  const [belowOnly, setBelowOnly] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  // KPIs (whole catalog, not filtered view)
  const totalSkus = allParts.length;
  const totalValue = allParts.reduce((sum, p) => sum + p.onHand * p.unitCost, 0);
  const belowReorder = allParts.filter((p) => p.onHand <= p.reorderPoint).length;
  const aClass = allParts.filter((p) => p.abcClass === 'A').length;

  const visible = useMemo<Part[]>(() => {
    const q = query.trim().toLowerCase();
    return allParts.filter((p) => {
      if (abc !== 'All' && p.abcClass !== abc) return false;
      if (belowOnly && p.onHand > p.reorderPoint) return false;
      if (q && !(`${p.sku} ${p.name} ${p.category}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [query, abc, belowOnly]);

  const countForAbc = (f: AbcFilter): number =>
    f === 'All' ? totalSkus : allParts.filter((p) => p.abcClass === f).length;

  const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';
  const td = 'px-4 py-3.5';

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Stock Overview"
        subtitle="On-hand quantities, valuation & reorder health across all parts stores."
        breadcrumb={[{ label: 'Inventory', href: '/inventory' }, { label: 'Stock Overview' }]}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                // Exports the filtered view, not the catalogue: "export this"
                // means the rows on screen, which only the browser knows.
                const rows = visible.map((p) => ({
                  SKU: p.sku,
                  Name: p.name,
                  Category: p.category,
                  Class: p.abcClass,
                  'On hand': p.onHand,
                  'Reorder point': p.reorderPoint,
                  'Unit cost': p.unitCost,
                  'Stock value': p.onHand * p.unitCost,
                  Warehouse: getWarehouse(p.warehouseId)?.name ?? p.warehouseId,
                  Bin: p.bin,
                }));
                const n = downloadCsv(`stock-${new Date().toISOString().slice(0, 10)}.csv`, rows);
                toast({
                  title: n > 0 ? `${n} row${n === 1 ? '' : 's'} exported` : 'Nothing to export',
                  description: n > 0 ? 'Downloaded as CSV.' : 'No parts match the current filters.',
                  tone: n > 0 ? 'success' : 'info',
                });
              }}
            >
              Export CSV
            </Button>
            <Button onClick={() => setDialog({ mode: 'new-part' })}>+ New Part</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total SKUs" value={totalSkus} sub="Distinct parts tracked" tone="primary" accent />
        <KpiCard label="Inventory Value" value={formatMoney(totalValue)} sub="On-hand × unit cost" tone="slate" />
        <KpiCard label="Below Reorder" value={belowReorder} sub="Needs replenishment" tone="red" />
        <KpiCard label="A-Class Items" value={aClass} sub="High-value / critical" tone="slate" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SKU, name or category…"
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ABC_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setAbc(f)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                abc === f
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {f === 'All' ? 'All classes' : `Class ${f}`}
              <span className="text-slate-400">{countForAbc(f)}</span>
            </button>
          ))}
          <button
            onClick={() => setBelowOnly((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              belowOnly
                ? 'border-red-400 bg-red-50 text-red-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', belowOnly ? 'bg-red-500' : 'bg-slate-300')} />
            Below reorder
            <span className={cn(belowOnly ? 'text-red-400' : 'text-slate-400')}>{belowReorder}</span>
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-xl flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Parts</h2>
          <span className="text-xs text-slate-400">{visible.length} of {totalSkus} SKUs</span>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            variant={allParts.length === 0 ? 'empty' : 'no-results'}
            icon="📦"
            title={allParts.length === 0 ? 'No parts stocked' : 'No parts match your filters'}
            description={
              allParts.length === 0
                ? 'Parts are what a work order consumes. Without them, completing maintenance cannot draw anything off the shelf and the reorder loop never starts.'
                : 'Try clearing the search or ABC / reorder filters.'
            }
            action={
              allParts.length === 0 ? (
                <Button onClick={() => setDialog({ mode: 'new-part' })}>+ New Part</Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery('');
                    setAbc('All');
                    setBelowOnly(false);
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  <th className={th}>SKU / Name</th>
                  <th className={th}>Category</th>
                  <th className={th}>Class</th>
                  <th className={th}>On-hand vs Reorder</th>
                  <th className={th}>Unit Cost</th>
                  <th className={th}>Ext. Value</th>
                  <th className={th}>Warehouse</th>
                  <th className={cn(th, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((p) => {
                  const below = p.onHand <= p.reorderPoint;
                  const wh = getWarehouse(p.warehouseId);
                  // Bar scales on-hand against a headroom of 2× reorder point (min 1).
                  const scale = Math.max(1, p.reorderPoint * 2);
                  const pct = Math.min(100, Math.round((p.onHand / scale) * 100));
                  const markPct = Math.min(100, Math.round((p.reorderPoint / scale) * 100));
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className={td}>
                        <Link to={`/inventory/${p.sku}`} className="font-medium text-slate-900 hover:text-primary-600">
                          {p.sku}
                        </Link>
                        <div className="text-xs text-slate-400">{p.name}</div>
                      </td>
                      <td className={td}><Badge tone="slate">{p.category}</Badge></td>
                      <td className={td}><Badge tone={abcTone(p.abcClass)}>{p.abcClass}</Badge></td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <div className="relative w-28 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <div className={cn('h-full rounded-full', stockBarColor(below))} style={{ width: `${pct}%` }} />
                            <span
                              className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-slate-500/70"
                              style={{ left: `${markPct}%` }}
                              title={`Reorder point ${p.reorderPoint}`}
                            />
                          </div>
                          <span className={cn('text-xs font-medium tabular-nums', below ? 'text-red-600' : 'text-slate-600')}>
                            {p.onHand}
                            <span className="text-slate-400"> / {p.reorderPoint}</span>
                          </span>
                        </div>
                      </td>
                      <td className={cn(td, 'tabular-nums text-slate-700')}>{formatMoney(p.unitCost)}</td>
                      <td className={cn(td, 'tabular-nums font-medium text-slate-800')}>{formatMoney(p.onHand * p.unitCost)}</td>
                      <td className={td}>
                        <Link to={`/warehouses/${p.warehouseId}`} className="text-primary-600 hover:text-primary-700 font-medium">
                          {wh?.name ?? p.warehouseId}
                        </Link>
                      </td>
                      <td className={cn(td, 'text-right')}>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setDialog({ mode: 'adjust', part: p })}>
                            Adjust
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'edit-part', part: p })}>
                            Edit
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialog?.mode === 'new-part' && <PartDialog onClose={() => setDialog(null)} />}
      {dialog?.mode === 'edit-part' && <PartDialog existing={dialog.part} onClose={() => setDialog(null)} />}
      {dialog?.mode === 'adjust' && <AdjustStockDialog part={dialog.part} onClose={() => setDialog(null)} />}
    </div>
  );
}
