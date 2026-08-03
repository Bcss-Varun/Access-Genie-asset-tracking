import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, EmptyState, ErrorState, KpiCard, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { cn, formatMoney, formatRupees } from '@/lib/format';
import { inventoryApi } from '@/features/notifications/notifications-api';

export function InventoryPage() {
  const [reorderOnly, setReorderOnly] = useState(false);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['parts', { reorderOnly }],
    queryFn: () => inventoryApi.parts({ limit: 100, ...(reorderOnly ? { reorder: 'true' } : {}) }),
  });

  const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: inventoryApi.warehouses });

  const stockValue = data?.items.reduce((sum, part) => sum + part.onHand * part.unitCost, 0) ?? 0;
  const belowReorder = data?.items.filter((part) => part.onHand <= part.reorderPoint).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="IT Spares Overview"
        subtitle="Parts on hand, reorder points and where each SKU sits."
        actions={
          <Button variant={reorderOnly ? 'primary' : 'secondary'} size="sm" onClick={() => setReorderOnly((v) => !v)}>
            {reorderOnly ? 'Showing reorder only' : 'Show reorder only'}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="SKUs" value={data?.meta.total ?? '—'} />
        <KpiCard label="Stock value" value={formatMoney(stockValue)} />
        <KpiCard label="At or below reorder" value={belowReorder} tone={belowReorder > 0 ? 'amber' : 'emerald'} />
        <KpiCard label="Warehouses" value={warehouses?.length ?? '—'} />
      </div>

      {error ? (
        <ErrorState title="Could not load inventory" description={error instanceof ApiRequestError ? error.message : undefined} onRetry={() => void refetch()} />
      ) : isPending ? (
        <TableSkeleton rows={8} columns={5} />
      ) : data.items.length === 0 ? (
        <div className="glass-panel">
          <EmptyState icon="📦" title={reorderOnly ? 'Nothing needs reordering' : 'No parts recorded'} />
        </div>
      ) : (
        <div className="glass-panel overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60">
                {['Part', 'Category', 'On hand', 'Reorder at', 'Unit cost', 'Bin', 'ABC'].map((heading) => (
                  <th key={heading} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((part) => {
                const low = part.onHand <= part.reorderPoint;
                return (
                  <tr key={part.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="block font-medium text-slate-800">{part.name}</span>
                      <span className="block text-[11px] font-mono text-slate-400">{part.sku}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{part.category}</td>
                    <td className={cn('px-4 py-3 tabular-nums font-semibold', low ? 'text-health-critical' : 'text-slate-700')}>
                      {part.onHand}
                      {low && <span className="ml-1.5 text-[10px] font-normal uppercase">reorder</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums">{part.reorderPoint}</td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums">{formatRupees(part.unitCost)}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-[12px]">{part.bin}</td>
                    <td className="px-4 py-3">
                      <Badge tone={part.abcClass === 'A' ? 'red' : part.abcClass === 'B' ? 'amber' : 'slate'}>{part.abcClass}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
