import { Donut } from '@/components/charts/Donut';
import { MultiLine } from '@/components/charts/MultiLine';
import { HBars } from '@/components/dashboards/DashboardKit';
import { WidgetEmpty, WidgetFrame } from '@/components/dashboards/WidgetFrame';
import { formatMoney } from '@/lib/utils';
import type { WidgetProps } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Twelve months of what the estate cost, what it is worth, and the gap.
 *
 * This is real history with nothing stored. Book value on any past date is
 * arithmetic over the purchase price, the in-service date and the useful life —
 * see `shared/src/depreciation.ts`. The alternative would have been a snapshot
 * table that only starts filling from the day it ships.
 */
export function ValueTrend({ summary }: WidgetProps) {
  const points = summary.charts.valueTrend ?? [];
  const latest = points[points.length - 1];

  return (
    <WidgetFrame
      title="Asset value trend"
      subtitle={latest ? `${formatMoney(latest.accumulated)} depreciated to date` : 'purchase, current and depreciation'}
      icon="📈"
      href="/financials"
      linkLabel="Financials"
    >
      {points.length === 0 ? (
        <WidgetEmpty>No depreciable assets in this scope.</WidgetEmpty>
      ) : (
        <MultiLine
          labels={points.map((p) => {
            const at = new Date(p.at);
            return `${MONTHS[at.getUTCMonth()]} ${String(at.getUTCFullYear()).slice(2)}`;
          })}
          series={[
            { label: 'Purchase value', color: '#4338ca', points: points.map((p) => p.purchase) },
            { label: 'Current value', color: '#10b981', points: points.map((p) => p.book), fill: true },
            { label: 'Depreciation', color: '#f59e0b', points: points.map((p) => p.accumulated) },
          ]}
          format={formatMoney}
        />
      )}
    </WidgetFrame>
  );
}

const CATEGORY_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#0ea5e9'];

/** How much of the estate has been written down, by category. */
export function DepreciationByCategory({ summary }: WidgetProps) {
  const rows = summary.charts.valueByCategory ?? [];
  const withDepreciation = rows
    .map((r) => ({ label: r.label, value: Math.max(0, r.purchase - r.book), purchase: r.purchase }))
    .filter((r) => r.purchase > 0)
    .sort((a, b) => b.value - a.value);

  const total = withDepreciation.reduce((s, r) => s + r.value, 0);

  return (
    <WidgetFrame
      title="Depreciation by category"
      subtitle={total ? `${formatMoney(total)} written down` : undefined}
      icon="📉"
      href="/financials"
      linkLabel="Financials"
    >
      {withDepreciation.length === 0 ? (
        <WidgetEmpty>No purchase values recorded in this scope.</WidgetEmpty>
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <HBars
            data={withDepreciation.map((r, i) => ({
              label: r.label,
              value: r.value,
              color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
              caption: `of ${formatMoney(r.purchase)}`,
            }))}
            format={formatMoney}
          />
        </div>
      )}
    </WidgetFrame>
  );
}

/** Distribution by category — the count, the share and what it is worth. */
export function CategoryDonut({ summary }: WidgetProps) {
  const rows = summary.charts.categoryBreakdown ?? [];

  return (
    <WidgetFrame title="Asset distribution" subtitle="by category" icon="🗂️" href="/assets" linkLabel="Registry">
      {rows.length === 0 ? (
        <WidgetEmpty>No assets in this scope.</WidgetEmpty>
      ) : (
        <div className="flex flex-1 items-center">
          <Donut
            totalLabel="Total assets"
            slices={rows.map((r, i) => ({
              label: r.category,
              value: r.count,
              color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] as string,
              caption: formatMoney(r.value),
            }))}
          />
        </div>
      )}
    </WidgetFrame>
  );
}

const STATUS_COLORS: Record<string, string> = {
  'In use': '#10b981',
  Idle: '#f59e0b',
  'In transit': '#8b5cf6',
  'Under maintenance': '#0ea5e9',
  Staging: '#94a3b8',
  Missing: '#ef4444',
  Retired: '#64748b',
};

/**
 * What the estate is doing right now.
 *
 * Not the stored status enum: Active splits on whether the asset has actually
 * been used lately, and anything mid-transfer is shown as in transit rather
 * than as sitting in the site it has already left.
 */
export function LiveStatus({ summary }: WidgetProps) {
  const rows = summary.charts.liveStatus ?? [];

  return (
    <WidgetFrame title="Live asset status" subtitle="right now" icon="🟢" href="/tracking" linkLabel="Live tracking">
      {rows.length === 0 ? (
        <WidgetEmpty>No assets in this scope.</WidgetEmpty>
      ) : (
        <div className="flex flex-1 items-center">
          <Donut
            totalLabel="In scope"
            slices={rows.map((r) => ({
              label: r.label,
              value: r.value,
              color: STATUS_COLORS[r.label] ?? '#94a3b8',
            }))}
          />
        </div>
      )}
    </WidgetFrame>
  );
}
