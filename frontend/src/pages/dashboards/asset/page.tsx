import { Link } from 'react-router-dom';
import { ValueByCategoryDonut } from '@/components/charts/DashboardCharts';
import { Card, InsightPanel, categoryEmoji } from '@/components/dashboards/DashboardKit';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { allAssets, allInsights } from '@/lib/dataset';
import { cn, relTime, nowMs, formatMoney } from '@/lib/utils';

  const FIELDS: ((a: (typeof allAssets)[number]) => unknown)[] = [
  (a) => a.manufacturer, (a) => a.model, (a) => a.warrantyExpiry,
  (a) => a.bookValue, (a) => a.telemetry?.batteryLevel, (a) => a.trackingTech,
];

// Data-quality: % of a defined field checklist populated across the fleet

let filled = 0;
allAssets.forEach((a) => FIELDS.forEach((f) => { if (f(a) != null) filled += 1; }));

// Days to warranty expiry
const daysTo = (iso?: string) => (iso ? Math.round((Date.parse(iso) - nowMs()) / 86_400_000) : Infinity);

export default function AssetDashboard() {
  // Derived per render: the dataset is fetched, so a value computed once at
  // module scope would never see a refetch.
  const total = allAssets.length;
    const active = allAssets.filter((a) => a.status === 'Active').length;
    const dataQuality = Math.round((filled / (allAssets.length * FIELDS.length)) * 100);
    const incomplete = allAssets.filter((a) => a.telemetry?.batteryLevel == null);
    const avgUtil = Math.round(allAssets.reduce((s, a) => s + (a.utilization ?? 0), 0) / total);
    const eol = allAssets
    .map((a) => ({ a, days: daysTo(a.warrantyExpiry) }))
    .filter(({ a, days }) => days <= 90 || a.lifecycleStage === 'EOL Planning')
    .sort((x, y) => x.days - y.days);
    const assetInsights = allInsights.filter((i) => ['Lifecycle', 'Cost Optimization', 'Utilization'].includes(i.type)).slice(0, 3);

  const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';
  const td = 'px-4 py-3';
  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Asset Dashboard"
        subtitle="Registry health — data quality, lifecycle and upcoming end-of-life."
        breadcrumb={[{ label: 'Workspace' }, { label: 'Dashboards', href: '/dashboards' }, { label: 'Asset' }]}
        actions={
          <select defaultValue="All Categories" className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700">
            <option>All Categories</option>
            <option>Compute</option>
            <option>Network</option>
            <option>Endpoints</option>
            <option>Infrastructure</option>
            <option>Sensors</option>
          </select>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Assets" value={total} sub={`${active} active`} tone="primary" accent />
        <KpiCard label="Data Quality" value={`${dataQuality}%`} sub={`${incomplete.length} incomplete`} tone="amber" />
        <KpiCard label="Avg Utilization" value={`${avgUtil}%`} sub="Fleet-wide" tone="slate" />
        <KpiCard label="Upcoming EOL" value={eol.length} sub="≤ 90 days" tone="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2" title="Portfolio by Category">
          <div className="flex-1"><ValueByCategoryDonut /></div>
        </Card>
        <InsightPanel insights={assetInsights} title="✨ Registry Recommendations" />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-semibold font-heading text-slate-800">Warranty / EOL within 90 Days</h3>
          <Link to="/lifecycle" className="text-xs font-medium text-primary-600 hover:underline">Lifecycle planner →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className={th}>Asset</th>
                <th className={th}>Category</th>
                <th className={th}>Stage</th>
                <th className={th}>Warranty</th>
                <th className={th}>Book Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {eol.map(({ a, days }) => (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                  <td className={td}>
                    <Link to={`/assets/${a.id}`} className="font-medium text-slate-900 hover:text-primary-600">{a.name}</Link>
                    <div className="text-xs text-slate-400">{a.id}</div>
                  </td>
                  <td className={td}>
                    <span className="inline-flex items-center gap-1.5 text-slate-600">{categoryEmoji(a.category)} {a.category}</span>
                  </td>
                  <td className={td}><Badge tone={a.lifecycleStage === 'EOL Planning' ? 'red' : 'slate'}>{a.lifecycleStage}</Badge></td>
                  <td className={cn(td, 'text-xs font-medium', days < 0 ? 'text-health-critical' : 'text-amber-600')}>
                    {days < 0 ? `lapsed ${relTime(a.warrantyExpiry!)}` : `${days}d left`}
                  </td>
                  <td className={cn(td, 'tabular-nums text-slate-700')}>{formatMoney(a.bookValue ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
