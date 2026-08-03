import { Link, useParams } from 'react-router-dom';
import { getWarehouse, getPartsForWarehouse } from '@/lib/dataset';
import type { AbcClass } from '@access-genie/shared';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { cn, formatMoney } from '@/lib/utils';

const abcTone: Record<AbcClass, 'primary' | 'amber' | 'slate'> = {
  A: 'primary',
  B: 'amber',
  C: 'slate',
};

const seedOf = (s: string): number => [...s].reduce((a, c) => a + c.charCodeAt(0), 0);

// Deterministic per-zone occupancy for the bin-utilization visual (no randomness).
const BIN_ZONES = ['A', 'B', 'C', 'D', 'E'] as const;

export default function WarehouseDetailPage() {
  const { id = '' } = useParams();
  const warehouse = getWarehouse(id);

  if (!warehouse) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <EmptyState
          icon="🏬"
          title="Warehouse not found"
          description={`No warehouse with id “${id}” exists in this session.`}
          action={<Link to="/warehouses"><Button variant="outline">← Back to Warehouses</Button></Link>}
        />
      </div>
    );
  }

  const parts = getPartsForWarehouse(warehouse.id);
  const stockValue = parts.reduce((sum, p) => sum + p.onHand * p.unitCost, 0);

  // Deterministic bin utilization derived from the warehouse's own attributes + seed.
  const seed = seedOf(warehouse.id);
  const zoneRows = BIN_ZONES.map((zone, i) => {
    const pct = 45 + ((seed + i * 17) % 50); // 45–94%, deterministic
    const capacity = Math.round(warehouse.binCount / BIN_ZONES.length);
    const occupied = Math.round((capacity * pct) / 100);
    return { zone, pct, capacity, occupied };
  });
  const totalOccupied = zoneRows.reduce((s, z) => s + z.occupied, 0);
  const overallPct = Math.round((totalOccupied / warehouse.binCount) * 100);

  const zoneColor = (pct: number): string =>
    pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-primary-500';

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={warehouse.name}
        subtitle={warehouse.location}
        breadcrumb={[
          { label: 'Inventory', href: '/warehouses' },
          { label: 'Warehouses', href: '/warehouses' },
          { label: warehouse.name },
        ]}
        actions={<Link to="/warehouses"><Button variant="outline">← All Warehouses</Button></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="SKUs" value={warehouse.skuCount.toLocaleString()} sub="Distinct parts stocked" tone="primary" accent />
        <KpiCard label="Bins" value={warehouse.binCount.toLocaleString()} sub="Storage locations" tone="slate" />
        <KpiCard label="Bin Utilization" value={`${overallPct}%`} sub={`${totalOccupied.toLocaleString()} of ${warehouse.binCount.toLocaleString()} occupied`} tone="slate" />
        <KpiCard label="Inventory Value" value={formatMoney(warehouse.valueInr)} sub="On-hand carrying value" tone="slate" />
      </div>

      {/* Bin-utilization visual */}
      <div className="glass-panel rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">Bin Utilization by Zone</h2>
          <span className="text-xs text-slate-400">{warehouse.binCount.toLocaleString()} bins across {BIN_ZONES.length} zones</span>
        </div>
        <div className="space-y-3">
          {zoneRows.map((z) => (
            <div key={z.zone} className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-sm font-medium text-slate-600">Zone {z.zone}</span>
              <div className="flex-1 h-3 rounded-full bg-slate-200 overflow-hidden">
                <div className={cn('h-full rounded-full', zoneColor(z.pct))} style={{ width: `${z.pct}%` }} />
              </div>
              <span className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-500">
                {z.occupied}/{z.capacity} · {z.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Parts table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-5 pb-3">
          <h2 className="text-base font-semibold text-slate-800">Stocked Parts</h2>
          <span className="text-xs text-slate-400">{parts.length} SKUs in this store</span>
        </div>
        {parts.length === 0 ? (
          <EmptyState
            title="No parts stocked here"
            description="This warehouse has no parts recorded in the current session."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">SKU</th>
                  <th className="px-5 py-2.5">Part</th>
                  <th className="px-5 py-2.5">Bin</th>
                  <th className="px-5 py-2.5 text-right">On Hand</th>
                  <th className="px-5 py-2.5">ABC</th>
                  <th className="px-5 py-2.5 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((p) => {
                  const low = p.onHand <= p.reorderPoint;
                  return (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3">
                        <Link to={`/inventory/${p.sku}`} className="font-mono text-xs font-medium text-primary-600 hover:underline">
                          {p.sku}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{p.name}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{p.bin}</td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        <span className={cn('font-medium', low ? 'text-red-600' : 'text-slate-700')}>{p.onHand}</span>
                        {low && <span className="ml-1 text-[10px] text-red-500">low</span>}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={abcTone[p.abcClass]}>{p.abcClass}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium text-slate-700">
                        {formatMoney(p.onHand * p.unitCost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50/70 font-semibold text-slate-700">
                  <td className="px-5 py-3" colSpan={5}>On-hand stock value ({parts.length} SKUs)</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-800">{formatMoney(stockValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
