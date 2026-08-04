import { Link } from 'react-router-dom';
import { UtilizationDowntimeChart } from '@/components/charts/DashboardCharts';
import { Card, InsightPanel, categoryEmoji, riskBar, riskTone } from '@/components/dashboards/DashboardKit';
import { PageHeader, KpiCard } from '@/components/ui/primitives';
import { allAlerts, allAssets, allInsights } from '@/lib/dataset';
import { cn, formatMoney } from '@/lib/utils';

export default function Dashboard() {
  // Derived per render: the dataset is fetched, so a value computed once at
  // module scope would never see a refetch.
  const topRiskAssets = [...allAssets]
    .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
    .slice(0, 5);
  const topInsights = allInsights.slice(0, 3);

  /*
   * The headline numbers, read off the estate.
   *
   * These four were literals carried over from the prototype — "14,205",
   * "₹107 Cr", "12", "92/100" — which read as real and were not. That was
   * survivable while this screen was one nav click in; it is the first thing
   * anyone sees after signing in, so it has to be the actual estate or nothing.
   *
   * An empty estate reports zeros and an em-dash, not a rounded-up guess.
   */
  const totalAssets = allAssets.length;
  const portfolioValue = allAssets.reduce((sum, a) => sum + (a.purchasePrice ?? 0), 0);
  const bookValue = allAssets.reduce((sum, a) => sum + (a.bookValue ?? a.purchasePrice ?? 0), 0);

  const openCritical = allAlerts.filter((a) => a.severity === 'Critical' && a.status !== 'Resolved');
  const missingCount = allAssets.filter((a) => a.status === 'Missing').length;

  // Mean health across the estate. Undefined rather than 0 when there is
  // nothing to average — an empty estate has no health score, and printing
  // "0/100" would report perfect ill-health for an estate in no state at all.
  const healthScore = totalAssets
    ? Math.round(allAssets.reduce((sum, a) => sum + (a.healthScore ?? 0), 0) / totalAssets)
    : undefined;

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
        <KpiCard
          label="Total Assets"
          value={totalAssets.toLocaleString()}
          sub={totalAssets ? 'In the registry' : 'Nothing registered yet'}
          tone="emerald"
        />
        <KpiCard
          label="Total Value (TCO)"
          value={formatMoney(portfolioValue)}
          sub={totalAssets ? `Net book ${formatMoney(bookValue)}` : 'No purchase values recorded'}
          tone="primary"
          accent
        />
        <KpiCard
          label="Critical Alerts"
          value={openCritical.length}
          sub={openCritical.length ? `${missingCount} missing · ${openCritical.length - missingCount} other` : 'Nothing critical open'}
          tone="red"
        />
        <KpiCard
          label="AI Health Score"
          value={healthScore === undefined ? '—' : <>{healthScore}<span className="text-lg text-slate-400">/100</span></>}
          sub={healthScore === undefined ? 'Awaiting assets' : healthScore >= 85 ? 'Optimal state' : healthScore >= 60 ? 'Needs attention' : 'Degraded'}
          tone={healthScore !== undefined && healthScore < 60 ? 'red' : 'emerald'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2" title="Asset Utilization vs Downtime" action={<span className="text-xs font-medium text-slate-400">Last 6 months</span>}>
          <div className="flex-1 min-h-[280px]"><UtilizationDowntimeChart /></div>
        </Card>

        <InsightPanel insights={topInsights} title="✨ AI Insights" />
      </div>

      <Card title="Top Risk Assets" action={<Link to="/ai-insights" className="text-xs font-medium text-primary-600 hover:underline">Risk & health scores →</Link>}>
        <div className="space-y-2">
          {topRiskAssets.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-slate-400">
              No assets registered yet — <Link to="/assets/new" className="font-medium text-primary-600 hover:underline">register one</Link> and
              its risk score appears here.
            </p>
          )}
          {topRiskAssets.map((asset) => (
            <Link
              key={asset.id}
              to={`/assets/${asset.id}`}
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
