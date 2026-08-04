import { useState } from 'react';
import type { Supplier } from '@access-genie/shared';
import { allSuppliers } from '@/lib/dataset';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SupplierDialog } from '@/components/inventory/InventoryDialogs';
import { useMutate } from '@/api/mutate';
import { suppliersApi } from '@/api/inventory';
import { cn } from '@/lib/utils';

function Stars({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn('text-sm leading-none', i <= rounded ? 'text-amber-400' : 'text-slate-300')}>
          ★
        </span>
      ))}
      <span className="ml-1 text-xs font-medium tabular-nums text-slate-500">{rating.toFixed(1)}</span>
    </span>
  );
}

const onTimeColor = (pct: number): string =>
  pct >= 95 ? 'bg-emerald-500' : pct >= 90 ? 'bg-amber-500' : 'bg-red-500';

export default function SuppliersPage() {
  const { run, isPending } = useMutate();
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'edit'; supplier: Supplier } | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);

  const count = allSuppliers.length;
  // Guarded against an empty directory: dividing by zero here rendered NaN
  // across all three averages on a fresh installation.
  const avg = (pick: (s: Supplier) => number) =>
    count === 0 ? 0 : allSuppliers.reduce((sum, s) => sum + pick(s), 0) / count;

  const avgLead = Math.round(avg((s) => s.leadTimeDays));
  const avgOnTime = Math.round(avg((s) => s.onTimePct));
  const avgRating = avg((s) => s.rating);

  const remove = async () => {
    if (!deleting) return;
    await run(suppliersApi.remove(deleting.id), {
      success: `${deleting.name} removed`,
      describe: 'remove that supplier',
    });
    setDeleting(null);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Suppliers"
        subtitle="Vendor directory — lead times, on-time performance & quality ratings."
        breadcrumb={[
          { label: 'Inventory', href: '/warehouses' },
          { label: 'Suppliers' },
        ]}
        actions={<Button onClick={() => setDialog({ mode: 'new' })}>+ New Supplier</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Suppliers" value={count} sub="Active vendors" tone="primary" accent />
        <KpiCard label="Avg Lead Time" value={`${avgLead}d`} sub="Order to delivery" tone="slate" />
        <KpiCard label="Avg On-Time" value={`${avgOnTime}%`} sub="Delivery reliability" tone="slate" />
        <KpiCard label="Avg Rating" value={avgRating.toFixed(1)} sub="Quality score (of 5)" tone="slate" />
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">Supplier</th>
                <th className="px-5 py-2.5">Category</th>
                <th className="px-5 py-2.5 text-right">Lead Time</th>
                <th className="px-5 py-2.5">On-Time</th>
                <th className="px-5 py-2.5">Rating</th>
                <th className="px-5 py-2.5">Contact</th>
                <th className="px-5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {allSuppliers.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900">{s.name}</div>
                    <div className="text-xs text-slate-400">{s.id}</div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone="slate">{s.category}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">{s.leadTimeDays}d</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                        <div className={cn('h-full rounded-full', onTimeColor(s.onTimePct))} style={{ width: `${s.onTimePct}%` }} />
                      </div>
                      <span className="text-xs font-medium tabular-nums text-slate-600">{s.onTimePct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <Stars rating={s.rating} />
                  </td>
                  <td className="px-5 py-3">
                    <a href={`mailto:${s.contact}`} className="text-xs font-mono text-primary-600 hover:underline">
                      {s.contact}
                    </a>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'edit', supplier: s })}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(s)}>
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {count === 0 && (
          <EmptyState
            icon="🚚"
            title="No suppliers yet"
            description="A part without a supplier is never drafted onto a reorder, so an empty directory means the whole procurement loop stays shut."
            action={<Button onClick={() => setDialog({ mode: 'new' })}>+ New Supplier</Button>}
          />
        )}
      </div>

      {dialog?.mode === 'new' && <SupplierDialog onClose={() => setDialog(null)} />}
      {dialog?.mode === 'edit' && <SupplierDialog existing={dialog.supplier} onClose={() => setDialog(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Remove ${deleting.name}?`}
          description="Parts pointing at this supplier keep their reorder point but will no longer be drafted onto a purchase order."
          confirmLabel="Remove"
          busy={isPending}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
