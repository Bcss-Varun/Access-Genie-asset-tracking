'use client';

import Link from 'next/link';
import { mockWarehouses } from '@/lib/mock-data';
import { PageHeader, KpiCard } from '@/components/ui/primitives';
import { formatMoney } from '@/lib/utils';

export default function WarehousesPage() {
  const totalWarehouses = mockWarehouses.length;
  const totalSkus = mockWarehouses.reduce((sum, w) => sum + w.skuCount, 0);
  const totalBins = mockWarehouses.reduce((sum, w) => sum + w.binCount, 0);
  const totalValue = mockWarehouses.reduce((sum, w) => sum + w.valueInr, 0);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Warehouses"
        subtitle="Parts stores, spares depots & bin utilization across your facilities."
        breadcrumb={[
          { label: 'Inventory', href: '/warehouses' },
          { label: 'Warehouses' },
        ]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Warehouses" value={totalWarehouses} sub="Active stores" tone="primary" accent />
        <KpiCard label="Total SKUs" value={totalSkus.toLocaleString()} sub="Distinct parts stocked" tone="slate" />
        <KpiCard label="Total Bins" value={totalBins.toLocaleString()} sub="Storage locations" tone="slate" />
        <KpiCard label="Inventory Value" value={formatMoney(totalValue)} sub="On-hand carrying value" tone="slate" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {mockWarehouses.map((w) => (
          <Link
            key={w.id}
            href={`/warehouses/${w.id}`}
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
              <span className="group-hover:text-primary-600">View details →</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
