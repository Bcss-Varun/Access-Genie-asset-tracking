import Link from 'next/link';
import { UtilizationDowntimeChart } from '@/components/charts/DashboardCharts';
import { Card, InsightPanel, categoryEmoji, riskBar, riskTone } from '@/components/dashboards/DashboardKit';
import { PageHeader, KpiCard } from '@/components/ui/primitives';
import { mockAssets, mockInsights } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

const topRiskAssets = [...mockAssets]
  .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
  .slice(0, 5);

const topInsights = mockInsights.slice(0, 3);

export default function Dashboard() {
  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Executive Dashboard"
        subtitle="Real-time asset intelligence across India operations."
        actions={
          <select defaultValue="All Organizations" className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700">
            <option>All Organizations</option>
            <option>South India</option>
            <option>North &amp; West India</option>
          </select>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Assets" value="14,205" sub="↑ 2.4% vs last month" tone="emerald" />
        <KpiCard label="Total Value (TCO)" value="₹107 Cr" sub="Depreciated ₹18 Cr" tone="primary" accent />
        <KpiCard label="Critical Alerts" value="12" sub="8 missing, 4 failure risk" tone="red" />
        <KpiCard label="AI Health Score" value={<>92<span className="text-lg text-slate-400">/100</span></>} sub="Optimal state" tone="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2" title="Asset Utilization vs Downtime" action={<span className="text-xs font-medium text-slate-400">Last 6 months</span>}>
          <div className="flex-1 min-h-[280px]"><UtilizationDowntimeChart /></div>
        </Card>

        <InsightPanel insights={topInsights} title="✨ AI Insights" />
      </div>

      <Card title="Top Risk Assets" action={<Link href="/ai-insights" className="text-xs font-medium text-primary-600 hover:underline">Risk & health scores →</Link>}>
        <div className="space-y-2">
          {topRiskAssets.map((asset) => (
            <Link
              key={asset.id}
              href={`/assets/${asset.id}`}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center min-w-0">
                <div className="w-9 h-9 rounded bg-slate-100 flex items-center justify-center text-lg mr-3 shrink-0">
                  {categoryEmoji(asset.category)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{asset.name}</div>
                  <div className="text-xs text-slate-500">{asset.id} · {asset.location.name}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0 ml-4">
                <div className="w-24 hidden sm:block">
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={cn('h-full rounded-full', riskBar(asset.riskScore ?? 0))} style={{ width: `${asset.riskScore ?? 0}%` }} />
                  </div>
                </div>
                <span className={cn('text-sm font-semibold tabular-nums', riskTone(asset.riskScore ?? 0))}>
                  {asset.riskScore ?? 0}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
