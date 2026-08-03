import { Link } from 'react-router-dom';
import { Card, GroupedBars, InsightPanel } from '@/components/dashboards/DashboardKit';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { allAssets, allInsights, allForecasts } from '@/lib/dataset';
import { cn, relTime, nowMs, formatMoney } from '@/lib/utils';

// Capex forecast horizon = forecast-only points (no actuals); FC-CAPEX is in ₹ lakh

// Book vs purchase by category
const cats = ['Compute', 'Network', 'Endpoints', 'Infrastructure', 'Sensors'];

// Warranty-expiry exposure
const daysTo = (iso?: string) => (iso ? Math.round((Date.parse(iso) - nowMs()) / 86_400_000) : Infinity);

export default function FinancialDashboard() {
  // Derived per render: the dataset is fetched, so a value computed once at
  // module scope would never see a refetch.
  const bookValue = allAssets.reduce((s, a) => s + (a.bookValue ?? 0), 0);
    const tco = allAssets.reduce((s, a) => s + a.purchasePrice, 0);
    const accumDep = tco - bookValue;
    const writeOffs = allAssets.filter((a) => a.lifecycleStage === 'EOL Planning').reduce((s, a) => s + (a.bookValue ?? 0), 0);
    const capexFc = allForecasts.find((f) => f.id === 'FC-CAPEX');
    const capexForecast = (capexFc?.points.filter((p) => p.actual == null).reduce((s, p) => s + p.forecast, 0) ?? 0) * 1_00_000;
    const byCategory = cats.map((c) => {
    const items = allAssets.filter((a) => a.category === c);
    return {
      label: c,
      a: items.reduce((s, x) => s + x.purchasePrice, 0),
      b: items.reduce((s, x) => s + (x.bookValue ?? 0), 0),
    };
  }).sort((x, y) => y.a - x.a);
    const exposure = [...allAssets]
    .filter((a) => a.warrantyExpiry)
    .map((a) => ({ a, days: daysTo(a.warrantyExpiry) }))
    .sort((x, y) => x.days - y.days)
    .slice(0, 7);
    const financialInsights = allInsights.filter((i) => ['Cost Optimization', 'Lifecycle'].includes(i.type)).slice(0, 3);

  const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';
  const td = 'px-4 py-3';
  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Financial Dashboard"
        subtitle="Book value, depreciation, capex forecast and warranty-cost exposure."
        breadcrumb={[{ label: 'Workspace' }, { label: 'Dashboards', href: '/dashboards' }, { label: 'Financial' }]}
        actions={
          <select defaultValue="FY 2026" className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700">
            <option>FY 2026</option>
            <option>Q3 2026</option>
            <option>Q2 2026</option>
          </select>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Book Value" value={formatMoney(bookValue)} sub="Net of depreciation" tone="primary" accent />
        <KpiCard label="Accum. Depreciation" value={formatMoney(accumDep)} sub={`${Math.round((accumDep / tco) * 100)}% of cost`} tone="amber" />
        <KpiCard label="Capex Forecast" value={formatMoney(capexForecast)} sub="Next 4 months" tone="primary" />
        <KpiCard label="Write-offs" value={formatMoney(writeOffs)} sub="Disposal pipeline" tone="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2" title="Book vs Purchase by Category">
          <div className="flex-1 flex flex-col justify-center">
            <GroupedBars rows={byCategory} aColor="#4338ca" bColor="#818cf8" aLabel="Purchase (TCO)" bLabel="Book value" format={formatMoney} />
          </div>
        </Card>

        <InsightPanel insights={financialInsights} title="✨ Cost Optimization" />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-semibold font-heading text-slate-800">Warranty-Expiry Cost Exposure</h3>
          <Link to="/lifecycle" className="text-xs font-medium text-primary-600 hover:underline">Depreciation schedule →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className={th}>Asset</th>
                <th className={th}>Category</th>
                <th className={th}>Warranty</th>
                <th className={th}>Book Value</th>
                <th className={th}>Exposure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exposure.map(({ a, days }) => (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                  <td className={td}>
                    <Link to={`/assets/${a.id}`} className="font-medium text-slate-900 hover:text-primary-600">{a.name}</Link>
                    <div className="text-xs text-slate-400">{a.id} · {a.depreciationMethod}</div>
                  </td>
                  <td className={cn(td, 'text-slate-600')}>{a.category}</td>
                  <td className={cn(td, 'text-xs font-medium', days < 0 ? 'text-health-critical' : days <= 90 ? 'text-amber-600' : 'text-slate-500')}>
                    {days < 0 ? `lapsed ${relTime(a.warrantyExpiry!)}` : `${days}d left`}
                  </td>
                  <td className={cn(td, 'tabular-nums text-slate-700')}>{formatMoney(a.bookValue ?? 0)}</td>
                  <td className={td}>
                    <Badge tone={days < 0 ? 'red' : days <= 90 ? 'amber' : 'slate'}>
                      {days < 0 ? 'Uncovered' : days <= 90 ? 'At risk' : 'Covered'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
