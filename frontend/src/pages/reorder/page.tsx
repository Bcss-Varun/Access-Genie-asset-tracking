import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { reorderParts, getSupplier } from '@/lib/dataset';
import type { Part } from '@access-genie/shared';
import { PageHeader, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { useMutate } from '@/api/mutate';
import { procurementApi } from '@/api/inventory';
import { cn, formatMoney } from '@/lib/utils';

// Suggested order quantity: top back up to 2× the reorder point.
const suggestedQty = (p: Part): number => Math.max(1, p.reorderPoint * 2 - p.onHand);
const lineValue = (p: Part): number => suggestedQty(p) * p.unitCost;

function stockBarColor(onHand: number, reorderPoint: number): string {
  if (onHand === 0) return 'bg-red-500';
  if (onHand < reorderPoint) return 'bg-amber-500';
  return 'bg-primary-500';
}

export default function ReorderPage() {
  const { toast } = useToast();
  const { run, isPending } = useMutate();
  const parts = useMemo(() => reorderParts(), []);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const stockouts = parts.filter((p) => p.onHand === 0).length;
  const supplierCount = new Set(parts.map((p) => p.supplierId)).size;
  const suggestedValue = parts.reduce((sum, p) => sum + lineValue(p), 0);

  const allSelected = parts.length > 0 && selected.size === parts.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(parts.map((p) => p.id)));
  }

  /**
   * Draft the orders.
   *
   * The server groups by supplier and skips any supplier that already has an
   * open draft, so pressing this twice cannot produce two orders for the same
   * vendor — which is why the result reports both numbers rather than assuming
   * everything was created.
   */
  async function createPo() {
    const result = await run(procurementApi.draftReorders(), { describe: 'draft those purchase orders' });
    if (!result) return;

    setSelected(new Set());
    toast({
      title:
        result.drafted > 0
          ? `Drafted ${result.drafted} purchase order${result.drafted === 1 ? '' : 's'}`
          : 'Nothing new to draft',
      description:
        result.skipped > 0
          ? `${result.skipped} supplier${result.skipped === 1 ? ' already has' : 's already have'} an open draft — those were left alone.`
          : result.drafted > 0
            ? 'Grouped by supplier, in Procurement as drafts. Nothing is committed until you send them.'
            : 'Every part below its reorder point either has no supplier or is already on a draft order.',
      tone: result.drafted > 0 ? 'success' : 'info',
    });
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Reorder & Procurement"
        subtitle="Parts at or below their reorder point, with suggested order quantities — enough to reach twice the reorder point."
        breadcrumb={[
          { label: 'Inventory', href: '/assets' },
          { label: 'Reorder & Procurement' },
        ]}
        actions={
          <Button onClick={() => void createPo()} disabled={isPending || parts.length === 0}>
            {isPending ? 'Drafting…' : 'Draft POs for everything below reorder'}
          </Button>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Items Below Reorder" value={parts.length} sub="Need replenishment" tone="primary" accent />
        <KpiCard label="Suggested PO Value" value={formatMoney(suggestedValue)} sub="Across all suggestions" tone="slate" />
        <KpiCard label="Stockouts" value={stockouts} sub={stockouts > 0 ? 'Zero on hand' : 'None'} tone={stockouts > 0 ? 'red' : 'emerald'} />
        <KpiCard label="Suppliers Involved" value={supplierCount} sub="Distinct vendors" tone="slate" />
      </div>

      {/* Table */}
      {parts.length === 0 ? (
        <div className="glass-panel rounded-xl flex-1">
          <EmptyState icon="✅" title="Nothing to reorder" description="Every part is above its reorder point." />
        </div>
      ) : (
        <div className="glass-panel rounded-xl flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-4 py-4 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                      className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                  <th className="px-4 py-4">Part</th>
                  <th className="px-4 py-4 w-56">On Hand / Reorder</th>
                  <th className="px-4 py-4 text-right">Suggested Qty</th>
                  <th className="px-4 py-4 text-right">Line Value</th>
                  <th className="px-4 py-4 text-right">Lead Time</th>
                  <th className="px-4 py-4">Supplier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parts.map((p) => {
                  const supplier = getSupplier(p.supplierId);
                  const pct = Math.min(100, Math.round((p.onHand / (p.reorderPoint * 2)) * 100));
                  const isSel = selected.has(p.id);
                  return (
                    <tr
                      key={p.id}
                      className={cn('transition-colors', isSel ? 'bg-primary-50/60' : 'hover:bg-slate-50')}
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggle(p.id)}
                          aria-label={`Select ${p.sku}`}
                          className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-900">{p.name}</div>
                        <div className="text-xs text-slate-400"><span className="font-mono">{p.sku}</span> · {p.category}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden min-w-[5rem]">
                            <div className={cn('h-full rounded-full', stockBarColor(p.onHand, p.reorderPoint))} style={{ width: `${Math.max(4, pct)}%` }} />
                          </div>
                          <span className={cn('text-xs font-medium tabular-nums', p.onHand === 0 ? 'text-red-600' : 'text-slate-600')}>
                            {p.onHand} / {p.reorderPoint}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-slate-900 tabular-nums">{suggestedQty(p)}</td>
                      <td className="px-4 py-4 text-right font-medium text-slate-900 tabular-nums">{formatMoney(lineValue(p))}</td>
                      <td className="px-4 py-4 text-right text-slate-500 tabular-nums">{p.leadTimeDays}d</td>
                      <td className="px-4 py-4">
                        <Link to={`/suppliers/${p.supplierId}`} className="text-primary-600 hover:text-primary-700 font-medium">
                          {supplier?.name ?? p.supplierId}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
