import { GroupedBars } from '@/components/dashboards/DashboardKit';
import { WidgetEmpty, WidgetFrame } from '@/components/dashboards/WidgetFrame';
import { formatMoney } from '@/lib/utils';
import type { WidgetProps } from './types';

/** What it cost against what it is still worth, by category. */
export function ValueByCategory({ summary }: WidgetProps) {
  const rows = (summary.charts.valueByCategory ?? []).map((r) => ({ label: r.label, a: r.purchase, b: r.book }));
  const purchase = rows.reduce((s, r) => s + r.a, 0);
  const book = rows.reduce((s, r) => s + r.b, 0);

  return (
    <WidgetFrame
      title="Purchase vs book value"
      subtitle={purchase ? `${formatMoney(purchase - book)} depreciated to date` : undefined}
      icon="💰"
      href="/financials"
      linkLabel="Financials"
    >
      {rows.length === 0 || purchase === 0 ? (
        <WidgetEmpty>No purchase values recorded in this scope.</WidgetEmpty>
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <GroupedBars
            rows={rows}
            aColor="#4338ca"
            bColor="#818cf8"
            aLabel="Purchase (TCO)"
            bLabel="Book value"
            format={formatMoney}
          />
        </div>
      )}
    </WidgetFrame>
  );
}
