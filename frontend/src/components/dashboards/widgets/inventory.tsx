import { Link } from 'react-router-dom';
import { HBars, TD, WidgetTable } from '@/components/dashboards/DashboardKit';
import { WidgetEmpty, WidgetFrame } from '@/components/dashboards/WidgetFrame';
import { Badge } from '@/components/ui/primitives';
import { getSupplier, reorderParts } from '@/lib/dataset';
import { cn, formatMoney } from '@/lib/utils';
import type { WidgetProps } from './types';

const ABC_COLORS: Record<string, string> = { 'Class A': '#ef4444', 'Class B': '#f59e0b', 'Class C': '#94a3b8' };
const abcTone = (c: string): 'red' | 'amber' | 'slate' => (c === 'A' ? 'red' : c === 'B' ? 'amber' : 'slate');

/** Where the tied-up capital sits. */
export function AbcAnalysis({ summary }: WidgetProps) {
  const rows = (summary.charts.abcAnalysis ?? []).map((r) => ({
    label: r.label,
    value: r.value,
    caption: r.caption,
    color: ABC_COLORS[r.label] ?? '#94a3b8',
  }));

  return (
    <WidgetFrame title="ABC analysis" subtitle="stock value by class" icon="🏬" href="/inventory" linkLabel="Spares">
      {rows.every((r) => r.value === 0) ? (
        <WidgetEmpty>No spare parts on hand.</WidgetEmpty>
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <HBars data={rows} format={formatMoney} />
          <p className="mt-5 text-xs text-slate-400">Class-A parts hold most of the capital — protect their availability.</p>
        </div>
      )}
    </WidgetFrame>
  );
}

/** SKUs at or below their reorder point, with what replenishing costs. */
export function ReorderAlerts() {
  const rows = reorderParts().slice(0, 6);

  return (
    <WidgetFrame title="Reorder alerts" icon="🛒" href="/reorder" linkLabel="Replenishment">
      {rows.length === 0 ? (
        <WidgetEmpty>Every SKU is above its reorder point.</WidgetEmpty>
      ) : (
        <WidgetTable
          columns={['Part', 'Class', 'On hand', 'Supplier', 'Reorder value']}
          rows={rows}
          keyOf={(p) => p.id}
          renderRow={(p) => {
            const shortfall = Math.max(0, p.reorderPoint * 2 - p.onHand);
            return (
              <>
                <td className={TD}>
                  <Link to={`/inventory/${p.sku}`} className="font-medium text-slate-900 hover:text-primary-600">
                    {p.sku}
                  </Link>
                  <div className="max-w-[12rem] truncate text-xs text-slate-400">{p.name}</div>
                </td>
                <td className={TD}>
                  <Badge tone={abcTone(p.abcClass)}>{p.abcClass}</Badge>
                </td>
                <td className={cn(TD, 'tabular-nums')}>
                  <span className="font-medium text-health-critical">{p.onHand}</span>
                  <span className="text-slate-400"> / {p.reorderPoint}</span>
                </td>
                <td className={cn(TD, 'text-slate-600')}>{getSupplier(p.supplierId)?.name ?? p.supplierId}</td>
                <td className={cn(TD, 'font-medium tabular-nums text-slate-800')}>{formatMoney(shortfall * p.unitCost)}</td>
              </>
            );
          }}
        />
      )}
    </WidgetFrame>
  );
}
