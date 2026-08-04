import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Warehouse } from '@access-genie/shared';
import { allWarehouses } from '@/lib/dataset';
import { PageHeader, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { WarehouseDialog } from '@/components/inventory/InventoryDialogs';
import { useMutate } from '@/api/mutate';
import { warehousesApi } from '@/api/inventory';
import { formatMoney } from '@/lib/utils';

export default function WarehousesPage() {
  const { run, isPending } = useMutate();
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'edit'; warehouse: Warehouse } | null>(null);
  const [deleting, setDeleting] = useState<Warehouse | null>(null);

  // The server refuses to delete a warehouse that still holds parts, and says
  // how many — so the screen submits and shows the refusal rather than
  // duplicating the count check here and getting it subtly different.
  const remove = async () => {
    if (!deleting) return;
    const ok = await run(warehousesApi.remove(deleting.id), {
      success: `${deleting.name} deleted`,
      describe: 'delete that warehouse',
    });
    if (ok !== null) setDeleting(null);
  };

  const totalWarehouses = allWarehouses.length;
  const totalSkus = allWarehouses.reduce((sum, w) => sum + w.skuCount, 0);
  const totalBins = allWarehouses.reduce((sum, w) => sum + w.binCount, 0);
  const totalValue = allWarehouses.reduce((sum, w) => sum + w.valueInr, 0);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Warehouses"
        subtitle="Parts stores, spares depots & bin utilization across your facilities."
        breadcrumb={[
          { label: 'Inventory', href: '/warehouses' },
          { label: 'Warehouses' },
        ]}
        actions={<Button onClick={() => setDialog({ mode: 'new' })}>+ New Warehouse</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Warehouses" value={totalWarehouses} sub="Active stores" tone="primary" accent />
        <KpiCard label="Total SKUs" value={totalSkus.toLocaleString()} sub="Distinct parts stocked" tone="slate" />
        <KpiCard label="Total Bins" value={totalBins.toLocaleString()} sub="Storage locations" tone="slate" />
        <KpiCard label="Inventory Value" value={formatMoney(totalValue)} sub="On-hand carrying value" tone="slate" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {allWarehouses.map((w) => (
          <Link
            key={w.id}
            to={`/warehouses/${w.id}`}
            className="glass-panel rounded-xl p-5 flex flex-col gap-4 hover:border-primary-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-lg shrink-0">
                  🏬
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate group-hover:text-primary-600">{w.name}</div>
                  <div className="text-xs text-slate-500 truncate">{w.location}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <div className="text-slate-400">SKUs</div>
                <div className="font-medium text-slate-700 tabular-nums">{w.skuCount.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-slate-400">Bins</div>
                <div className="font-medium text-slate-700 tabular-nums">{w.binCount.toLocaleString()}</div>
              </div>
              <div className="col-span-2">
                <div className="text-slate-400">Inventory Value</div>
                <div className="font-semibold text-slate-800 tabular-nums">{formatMoney(w.valueInr)}</div>
              </div>
            </div>

            <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
              <span>{w.id}</span>
              <span className="flex items-center gap-2">
                {/* Buttons inside a card-wide <Link>: the click must not also
                    navigate, so each stops the event before it bubbles. */}
                <button
                  className="font-medium text-slate-500 hover:text-primary-600"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDialog({ mode: 'edit', warehouse: w });
                  }}
                >
                  Edit
                </button>
                <button
                  className="font-medium text-slate-400 hover:text-red-600"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeleting(w);
                  }}
                >
                  Delete
                </button>
              </span>
            </div>
          </Link>
        ))}
      </div>

      {allWarehouses.length === 0 && (
        <div className="glass-panel rounded-xl">
          <EmptyState
            icon="🏬"
            title="No warehouses yet"
            description="Stock is counted per warehouse, so a part cannot be added until there is somewhere for it to sit."
            action={<Button onClick={() => setDialog({ mode: 'new' })}>+ New Warehouse</Button>}
          />
        </div>
      )}

      {dialog?.mode === 'new' && <WarehouseDialog onClose={() => setDialog(null)} />}
      {dialog?.mode === 'edit' && <WarehouseDialog existing={dialog.warehouse} onClose={() => setDialog(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          description="Refused if any parts are still stocked here — move them first."
          busy={isPending}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
