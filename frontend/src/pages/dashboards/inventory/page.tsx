import { Link } from 'react-router-dom';
import { Card, HBars, InsightPanel } from '@/components/dashboards/DashboardKit';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { mockParts, mockWarehouses, reorderParts, getSupplier, mockInsights } from '@/lib/mock-data';
import { cn, formatMoney } from '@/lib/utils';

const skus = mockParts.length;
const stockValue = mockWarehouses.reduce((s, w) => s + w.valueInr, 0);
const belowReorder = reorderParts();
const stockouts = mockParts.filter((p) => p.onHand < p.reorderPoint).length;
const fillRate = Math.round(((skus - belowReorder.length) / skus) * 100);

// ABC analysis by extended value
const abc = (['A', 'B', 'C'] as const).map((c) => ({
  label: `Class ${c}`,
  value: mockParts.filter((p) => p.abcClass === c).reduce((s, p) => s + p.onHand * p.unitCost, 0),
  color: c === 'A' ? '#ef4444' : c === 'B' ? '#f59e0b' : '#94a3b8',
  caption: `${mockParts.filter((p) => p.abcClass === c).length} SKUs`,
}));

const inventoryInsights = mockInsights.filter((i) => ['Cost Optimization', 'Predictive Failure'].includes(i.type)).slice(0, 3);

const abcTone = (c: string): 'red' | 'amber' | 'slate' => (c === 'A' ? 'red' : c === 'B' ? 'amber' : 'slate');

export default function InventoryDashboard() {
  const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';
  const td = 'px-4 py-3';
  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Inventory Dashboard"
        subtitle="Spare-parts health — stock value, reorder risk and ABC concentration."
        breadcrumb={[{ label: 'Workspace' }, { label: 'Dashboards', href: '/dashboards' }, { label: 'Inventory' }]}
        actions={
          <select defaultValue="All Warehouses" className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700">
            <option>All Warehouses</option>
            {mockWarehouses.map((w) => <option key={w.id}>{w.name}</option>)}
          </select>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Stock Value" value={formatMoney(stockValue)} sub="On-hand valuation" tone="primary" accent />
        <KpiCard label="Stockouts" value={stockouts} sub="Below reorder point" tone="red" />
        <KpiCard label="Below Reorder" value={belowReorder.length} sub="Needs replenishment" tone="amber" />
        <KpiCard label="Fill Rate" value={`${fillRate}%`} sub="SKUs at healthy stock" tone="slate" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="ABC Analysis" action={<span className="text-xs text-slate-400">by value</span>}>
          <div className="flex-1 flex flex-col justify-center">
            <HBars data={abc} format={formatMoney} />
            <p className="mt-6 text-xs text-slate-400">Class-A parts hold the majority of tied-up capital — prioritize their availability.</p>
          </div>
        </Card>

        <InsightPanel insights={inventoryInsights} title="✨ Inventory Signals" />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-semibold font-heading text-slate-800">Reorder Alerts</h3>
          <Link to="/reorder" className="text-xs font-medium text-primary-600 hover:underline">Replenishment queue →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className={th}>Part</th>
                <th className={th}>Class</th>
                <th className={th}>On-hand / Reorder</th>
                <th className={th}>Supplier</th>
                <th className={th}>Lead Time</th>
                <th className={th}>Reorder Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {belowReorder.map((p) => {
                const shortfall = Math.max(0, p.reorderPoint * 2 - p.onHand);
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className={td}>
                      <Link to={`/inventory/${p.sku}`} className="font-medium text-slate-900 hover:text-primary-600">{p.sku}</Link>
                      <div className="text-xs text-slate-400">{p.name}</div>
                    </td>
                    <td className={td}><Badge tone={abcTone(p.abcClass)}>{p.abcClass}</Badge></td>
                    <td className={cn(td, 'tabular-nums')}>
                      <span className="font-medium text-red-600">{p.onHand}</span>
                      <span className="text-slate-400"> / {p.reorderPoint}</span>
                    </td>
                    <td className={cn(td, 'text-slate-600')}>{getSupplier(p.supplierId)?.name ?? p.supplierId}</td>
                    <td className={cn(td, 'text-slate-500')}>{p.leadTimeDays}d</td>
                    <td className={cn(td, 'tabular-nums font-medium text-slate-800')}>{formatMoney(shortfall * p.unitCost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
