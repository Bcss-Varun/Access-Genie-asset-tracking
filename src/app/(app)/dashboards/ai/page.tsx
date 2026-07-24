import Link from 'next/link';
import { Card, HBars, categoryEmoji } from '@/components/dashboards/DashboardKit';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { mockAssets, mockInsights, mockAnomalies } from '@/lib/mock-data';
import { cn, relTime, DEMO_NOW, formatMoney } from '@/lib/utils';

const atRisk = mockAssets.filter((a) => (a.riskScore ?? 0) > 60).length;
const predictedFailures = mockAssets.filter((a) => (a.riskScore ?? 0) >= 70).length;
const anomalies24h = mockAnomalies.filter((a) => DEMO_NOW - Date.parse(a.detectedAt) < 24 * 3600_000).length;
const savings = mockInsights.reduce((s, i) => s + (i.impactInr ?? 0), 0);

// Risk score distribution
const buckets = [
  { label: 'Low (0–25)', color: '#10b981' },
  { label: 'Medium (26–50)', color: '#f59e0b' },
  { label: 'High (51–75)', color: '#f97316' },
  { label: 'Critical (76–100)', color: '#ef4444' },
];
const riskDist = buckets.map((b, i) => ({
  label: b.label,
  color: b.color,
  value: mockAssets.filter((a) => {
    const r = a.riskScore ?? 0;
    return i === 0 ? r <= 25 : i === 1 ? r > 25 && r <= 50 : i === 2 ? r > 50 && r <= 75 : r > 75;
  }).length,
}));

const rankedInsights = [...mockInsights].sort((a, b) => (b.impactInr ?? 0) - (a.impactInr ?? 0));
const topAnomalies = [...mockAnomalies].sort((a, b) => b.confidence - a.confidence);

const anomTone = (s: string): 'red' | 'amber' | 'slate' => (s === 'Critical' ? 'red' : s === 'Warning' ? 'amber' : 'slate');

export default function AiIntelligenceDashboard() {
  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="AI Intelligence"
        subtitle="The AI command center — risk, predictions, anomalies and realized savings."
        breadcrumb={[{ label: 'Workspace' }, { label: 'Dashboards', href: '/dashboards' }, { label: 'AI Intelligence' }]}
        actions={
          <select defaultValue="All Models" className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700">
            <option>All Models</option>
            <option>Failure Prediction</option>
            <option>Anomaly Detection</option>
            <option>Utilization</option>
          </select>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Assets at Risk" value={atRisk} sub="Risk > 60" tone="red" accent />
        <KpiCard label="Predicted Failures" value={predictedFailures} sub="Next 30 days" tone="amber" />
        <KpiCard label="Anomalies" value={anomalies24h} sub="Last 24h" tone="primary" />
        <KpiCard label="Savings" value={formatMoney(savings)} sub="Identified" tone="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Risk Score Distribution">
          <div className="flex-1 flex flex-col justify-center">
            <HBars data={riskDist} />
            <p className="mt-6 text-xs text-slate-400">{atRisk} assets above the risk-60 action threshold.</p>
          </div>
        </Card>

        <Card className="lg:col-span-2 p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-base font-semibold font-heading text-slate-800">Top Anomalies</h3>
            <Link href="/ai/anomaly" className="text-xs font-medium text-primary-600 hover:underline">Anomaly console →</Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {topAnomalies.map((an) => (
              <li key={an.id} className="px-6 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 truncate">{an.assetName}</span>
                    <Badge tone={anomTone(an.severity)}>{an.severity}</Badge>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{an.metric} · {an.description}</div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <div className="text-sm font-semibold tabular-nums text-slate-800">{an.zScore.toFixed(1)}σ</div>
                  <div className="text-[11px] text-slate-400">{an.confidence}% · {relTime(an.detectedAt)}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Ranked Insight Feed" action={<Link href="/ai-insights" className="text-xs font-medium text-primary-600 hover:underline">All insights →</Link>}>
        <div className="space-y-3">
          {rankedInsights.map((ins, i) => (
            <Link key={ins.id} href="/ai-insights" className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-primary-500/50 transition-colors">
              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 truncate">{ins.title}</span>
                  <span className="text-sm font-semibold text-emerald-600 shrink-0">{formatMoney(ins.impactInr ?? 0)}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{ins.summary}</p>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
                  <span className={cn('font-medium', ins.severity === 'Critical' ? 'text-health-critical' : ins.severity === 'Opportunity' ? 'text-emerald-600' : 'text-amber-600')}>{ins.severity}</span>
                  <span>·</span><span>{ins.confidence}% confidence</span>
                  {ins.assetName && (<><span>·</span><span className="truncate">{categoryEmoji((mockAssets.find((a) => a.id === ins.assetId)?.category) ?? '')} {ins.assetName}</span></>)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
