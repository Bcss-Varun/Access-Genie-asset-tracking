import Link from 'next/link';
import { Card, HBars, InsightPanel } from '@/components/dashboards/DashboardKit';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { mockAlerts, mockGeofences, mockCustody, mockAssets, mockInsights } from '@/lib/mock-data';
import { cn, relTime } from '@/lib/utils';

const activeAlerts = mockAlerts.filter((a) => a.status !== 'Resolved');
const geofenceBreaches = mockGeofences.reduce((s, g) => s + g.breaches24h, 0);
const custodyExceptions = mockCustody.filter((c) => c.holder === 'Unknown' || /geofence|no check-out/i.test(c.by));
const afterHours = custodyExceptions.length;
const missing = mockAssets.filter((a) => a.status === 'Missing').length;
const recovered = 0;

// Alerts by type
const typeColors: Record<string, string> = {
  Predictive: '#6366f1', Threshold: '#f59e0b', Tracking: '#ef4444',
  Geofence: '#f97316', Anomaly: '#8b5cf6', Device: '#94a3b8',
};
const types = Array.from(new Set(mockAlerts.map((a) => a.type)));
const alertsByType = types
  .map((t) => ({ label: t, value: mockAlerts.filter((a) => a.type === t).length, color: typeColors[t] ?? '#94a3b8' }))
  .sort((a, b) => b.value - a.value);

const securityInsights = mockInsights.filter((i) => ['Theft/Security', 'Anomaly'].includes(i.type)).slice(0, 3);

const sevTone = (s: string): 'red' | 'amber' | 'slate' => (s === 'Critical' ? 'red' : s === 'Warning' ? 'amber' : 'slate');

export default function SecurityDashboard() {
  const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';
  const td = 'px-4 py-3';
  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Security Dashboard"
        subtitle="Loss prevention — breaches, tamper events and chain-of-custody exceptions."
        breadcrumb={[{ label: 'Workspace' }, { label: 'Dashboards', href: '/dashboards' }, { label: 'Security' }]}
        actions={
          <select defaultValue="Last 24 Hours" className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700">
            <option>Last 24 Hours</option>
            <option>Last 7 Days</option>
            <option>Last 30 Days</option>
          </select>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Active Alerts" value={activeAlerts.length} sub="Unresolved" tone="red" accent />
        <KpiCard label="Geofence Breaches" value={geofenceBreaches} sub="Last 24h" tone="amber" />
        <KpiCard label="After-hours Moves" value={afterHours} sub="Custody exceptions" tone="slate" />
        <KpiCard label="Missing / Recovered" value={`${missing} / ${recovered}`} sub="Asset loss" tone="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Alerts by Type">
          <div className="flex-1 flex flex-col justify-center">
            <HBars data={alertsByType} />
            <p className="mt-6 text-xs text-slate-400">{activeAlerts.length} of {mockAlerts.length} alerts still open.</p>
          </div>
        </Card>

        <InsightPanel insights={securityInsights} title="✨ Security Signals" />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-semibold font-heading text-slate-800">Open Incidents</h3>
          <Link href="/alerts" className="text-xs font-medium text-primary-600 hover:underline">Incident console →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className={th}>Incident</th>
                <th className={th}>Severity</th>
                <th className={th}>Type</th>
                <th className={th}>Status</th>
                <th className={th}>Raised</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeAlerts.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                  <td className={td}>
                    <div className="font-medium text-slate-900">{a.title}</div>
                    {a.assetName && <div className="text-xs text-slate-400">{a.assetName} · {a.source}</div>}
                  </td>
                  <td className={td}><Badge tone={sevTone(a.severity)}>{a.severity}</Badge></td>
                  <td className={cn(td, 'text-slate-500')}>{a.type}</td>
                  <td className={cn(td, 'text-slate-500')}>{a.status}</td>
                  <td className={cn(td, 'text-xs text-slate-400')}>{relTime(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
