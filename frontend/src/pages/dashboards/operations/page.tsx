import { Link } from 'react-router-dom';
import { UtilizationDowntimeChart } from '@/components/charts/DashboardCharts';
import { Card, InsightPanel } from '@/components/dashboards/DashboardKit';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { mockAssets, mockWorkOrders, mockAlerts, mockInsights } from '@/lib/mock-data';
import { cn, relTime } from '@/lib/utils';

const total = mockAssets.length;
const active = mockAssets.filter((a) => a.status === 'Active').length;
const down = mockAssets.filter((a) => a.status === 'Maintenance').length;
const missing = mockAssets.filter((a) => a.status === 'Missing').length;
const availability = Math.round((active / total) * 100);
const openWos = mockWorkOrders.filter((w) => w.status !== 'Completed');
const unassigned = mockWorkOrders.filter((w) => w.status === 'New').length;

// Alerts to triage (unresolved), most severe / recent first
const sevRank: Record<string, number> = { Critical: 0, Warning: 1, Info: 2 };
const triage = [...mockAlerts]
  .filter((a) => a.status !== 'Resolved')
  .sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || Date.parse(b.createdAt) - Date.parse(a.createdAt));

const opsInsights = mockInsights.filter((i) => ['Utilization', 'Anomaly', 'Predictive Failure'].includes(i.type)).slice(0, 3);

const alertTone = (s: string): 'red' | 'amber' | 'slate' => (s === 'Critical' ? 'red' : s === 'Warning' ? 'amber' : 'slate');

export default function OperationsDashboard() {
  const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';
  const td = 'px-4 py-3';
  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Operations Dashboard"
        subtitle="Live facility state — availability, backlog and alerts to triage."
        breadcrumb={[{ label: 'Workspace' }, { label: 'Dashboards', href: '/dashboards' }, { label: 'Operations' }]}
        actions={
          <select defaultValue="Hyderabad Central Warehouse" className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700">
            <option>Hyderabad Central Warehouse</option>
            <option>Bengaluru HQ</option>
            <option>Chennai Data Center</option>
            <option>All Facilities</option>
          </select>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Availability" value={`${availability}%`} sub="Active / total" tone="primary" accent />
        <KpiCard label="Open WOs" value={openWos.length} sub={`${unassigned} unassigned`} tone="amber" />
        <KpiCard label="Down" value={down} sub="In maintenance" tone="red" />
        <KpiCard label="Missing" value={missing} sub="Not scanned" tone="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2" title="Utilization vs Downtime" action={<span className="text-xs font-medium text-slate-400">Last 6 months</span>}>
          <div className="flex-1 min-h-[280px]"><UtilizationDowntimeChart /></div>
        </Card>

        <InsightPanel insights={opsInsights} title="✨ Ops Recommendations" />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-semibold font-heading text-slate-800">Alerts to Triage</h3>
          <Link to="/alerts" className="text-xs font-medium text-primary-600 hover:underline">Open alerts console →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className={th}>Alert</th>
                <th className={th}>Severity</th>
                <th className={th}>Type</th>
                <th className={th}>Status</th>
                <th className={th}>Raised</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {triage.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                  <td className={td}>
                    <div className="font-medium text-slate-900">{a.title}</div>
                    {a.assetName && <div className="text-xs text-slate-400">{a.assetName}</div>}
                  </td>
                  <td className={td}><Badge tone={alertTone(a.severity)}>{a.severity}</Badge></td>
                  <td className={cn(td, 'text-slate-500')}>{a.type}</td>
                  <td className={cn(td, 'text-slate-500')}>{a.status}</td>
                  <td className={cn(td, 'text-slate-400 text-xs')}>{relTime(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
