import { Link } from 'react-router-dom';
import { Card, Funnel, InsightPanel } from '@/components/dashboards/DashboardKit';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { mockWorkOrders, mockPmSchedules, mockInsights, mockAnomalies } from '@/lib/mock-data';
import { cn, relTime, DEMO_NOW } from '@/lib/utils';

const openWos = mockWorkOrders.filter((w) => w.status !== 'Completed');
const overdue = openWos.filter((w) => Date.parse(w.dueDate) <= DEMO_NOW);

// PM compliance (mean across schedules)
const pmCompliance = Math.round(mockPmSchedules.reduce((s, p) => s + p.compliancePct, 0) / mockPmSchedules.length);
const overduePms = mockPmSchedules.filter((p) => Date.parse(p.nextDue) < DEMO_NOW).length;

const predictiveAlerts = mockAnomalies.filter((a) => DEMO_NOW - Date.parse(a.detectedAt) < 24 * 3600_000).length;

// WO pipeline funnel
const pipeline = [
  { label: 'New', value: mockWorkOrders.filter((w) => w.status === 'New').length, color: '#ef4444' },
  { label: 'Assigned', value: mockWorkOrders.filter((w) => w.status === 'Assigned').length, color: '#f59e0b' },
  { label: 'In Progress', value: mockWorkOrders.filter((w) => w.status === 'In Progress').length, color: '#6366f1' },
  { label: 'Completed', value: mockWorkOrders.filter((w) => w.status === 'Completed').length, color: '#10b981' },
];

// Overdue / urgent table (soonest due first)
const urgent = [...openWos].sort((a, b) => Date.parse(a.dueDate) - Date.parse(b.dueDate)).slice(0, 6);

const predictiveInsights = mockInsights.filter((i) => ['Predictive Failure', 'Anomaly'].includes(i.type)).slice(0, 3);

const prioTone = (p: string): 'red' | 'amber' | 'slate' => (p === 'Critical' ? 'red' : p === 'High' ? 'amber' : 'slate');

export default function MaintenanceDashboard() {
  const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';
  const td = 'px-4 py-3';
  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Maintenance Dashboard"
        subtitle="Reliability, PM compliance and the work-order pipeline."
        breadcrumb={[{ label: 'Workspace' }, { label: 'Dashboards', href: '/dashboards' }, { label: 'Maintenance' }]}
        actions={
          <select defaultValue="This Week" className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700">
            <option>This Week</option>
            <option>This Month</option>
            <option>This Quarter</option>
          </select>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="PM Compliance" value={`${pmCompliance}%`} sub={`${overduePms} overdue PM`} tone="emerald" accent />
        <KpiCard label="Open WOs" value={openWos.length} sub={`${overdue.length} overdue`} tone="amber" />
        <KpiCard label="Overdue WOs" value={overdue.length} sub="Past due date" tone="red" />
        <KpiCard label="Predictive" value={predictiveAlerts} sub="Anomalies (24h)" tone="primary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Work-order Pipeline">
          <div className="flex-1 flex flex-col justify-center py-4"><Funnel stages={pipeline} /></div>
        </Card>
        <InsightPanel insights={predictiveInsights} title="✨ Predicted Failures" />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-semibold font-heading text-slate-800">Overdue &amp; Urgent Work Orders</h3>
          <Link to="/maintenance" className="text-xs font-medium text-primary-600 hover:underline">Work-order queue →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className={th}>Work Order</th>
                <th className={th}>Asset</th>
                <th className={th}>Priority</th>
                <th className={th}>Assigned</th>
                <th className={th}>Due</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {urgent.map((w) => {
                const isOverdue = Date.parse(w.dueDate) <= DEMO_NOW;
                return (
                  <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                    <td className={td}>
                      <Link to={`/maintenance/${w.id}`} className="font-medium text-slate-900 hover:text-primary-600">{w.id}</Link>
                      <div className="text-xs text-slate-400">{w.title}</div>
                    </td>
                    <td className={cn(td, 'text-slate-600')}>{w.assetName}</td>
                    <td className={td}><Badge tone={prioTone(w.priority)}>{w.priority}</Badge></td>
                    <td className={cn(td, 'text-slate-500')}>{w.assignedTo}</td>
                    <td className={cn(td, 'text-xs font-medium', isOverdue ? 'text-health-critical' : 'text-slate-500')}>
                      {relTime(w.dueDate)}
                    </td>
                    <td className={cn(td, 'text-slate-500')}>{w.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
