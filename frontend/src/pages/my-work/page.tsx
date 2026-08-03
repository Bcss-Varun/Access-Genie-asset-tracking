import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Badge, EmptyState, KpiCard } from '@/components/ui/primitives';
import { useSession } from '@/components/providers/SessionProvider';
import { allWorkOrders } from '@/lib/dataset';
import { nowMs, relTime } from '@/lib/utils';
import type { WorkOrder, WorkOrderPriority } from '@access-genie/shared';

// ─────────────────────────────────────────────────────────────────────────────
// My Work — the signed-in persona's prioritized queue: assigned work orders,
// tasks and approvals. Adapts to the active role (persona switcher).
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_RANK: Record<WorkOrderPriority, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const PRIORITY_TONE: Record<WorkOrderPriority, 'red' | 'amber' | 'primary' | 'slate'> = {
  Critical: 'red', High: 'amber', Medium: 'primary', Low: 'slate',
};

interface Task {
  id: string;
  title: string;
  priority: WorkOrderPriority;
  due: string;
  href?: string;
}

interface Approval {
  id: string;
  title: string;
  requestedBy: string;
  at: string;
}

const NOW = nowMs();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

export default function MyWorkPage() {
  const { session } = useSession();
  const { user } = session;
  const canMaintain = session.modules.includes('maintenance');
  const isApprover = ['super_admin', 'org_admin', 'facility_manager', 'maintenance_manager'].includes(session.role.id);

  // Work orders: match by name, else fall back to open ones (only for roles that maintain).
  const workOrders = useMemo<WorkOrder[]>(() => {
    const mine = allWorkOrders.filter((w) => w.assignedTo === user.name);
    const base = mine.length > 0 ? mine : canMaintain ? allWorkOrders.filter((w) => w.status !== 'Completed') : [];
    return [...base].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
  }, [user.name, canMaintain]);

  const tasks = useMemo<Task[]>(() => {
    if (!canMaintain) return [];
    return [
      { id: 'TSK-01', title: 'Review predictive alert for MacBook Pro 16" battery', priority: 'High', due: hoursAgo(-6), href: '/maintenance/WO-5001' },
      { id: 'TSK-02', title: 'Confirm cold-spare SSD delivery for Synology NAS', priority: 'Medium', due: hoursAgo(-30), href: '/maintenance/WO-5004' },
      { id: 'TSK-03', title: 'Close out completed switch firmware OTA job', priority: 'Low', due: hoursAgo(-2), href: '/maintenance/WO-5010' },
    ];
  }, [canMaintain]);

  const approvals = useMemo<Approval[]>(() => {
    if (!isApprover) return [];
    return [
      { id: 'TR-4001', title: 'Transfer: Cisco Catalyst 9500 → Server Room Beta', requestedBy: 'Arjun Menon', at: hoursAgo(2) },
      { id: 'TR-4004', title: 'Transfer: Fluke DSX-8000 → Hyderabad Central Warehouse', requestedBy: 'Network Team', at: hoursAgo(3) },
    ];
  }, [isApprover]);

  const totalItems = workOrders.length + tasks.length + approvals.length;
  const criticalCount = workOrders.filter((w) => w.priority === 'Critical').length;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={`Good morning, ${user.name.split(' ')[0]}`}
        subtitle={`${user.title} — here is your prioritized queue for today.`}
        breadcrumb={[{ label: 'Workspace' }, { label: 'My Work' }]}
      />

      {totalItems === 0 ? (
        <div className="glass-panel rounded-xl flex-1 min-h-0 flex items-center justify-center">
          <EmptyState
            icon="🌤️"
            title="You're all caught up"
            description={`No work orders, tasks or approvals are assigned to ${user.name}. Enjoy the quiet.`}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard label="Assigned Work Orders" value={workOrders.length} sub="In your queue" accent />
            <KpiCard label="Critical" value={criticalCount} sub={criticalCount > 0 ? 'Needs attention' : 'None open'} tone={criticalCount > 0 ? 'red' : 'emerald'} />
            <KpiCard label="Pending Approvals" value={approvals.length} sub="Awaiting your sign-off" tone="amber" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3 flex-1 min-h-0">
            {/* Work order queue */}
            <div className="lg:col-span-2 glass-panel rounded-xl overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-base font-heading font-semibold text-slate-900">Prioritized Work Orders</h2>
              </div>
              <div className="flex-1 overflow-auto divide-y divide-slate-100">
                {workOrders.length === 0 && (
                  <div className="p-10 text-center text-slate-400 text-sm">No work orders assigned.</div>
                )}
                {workOrders.map((wo) => (
                  <Link
                    key={wo.id}
                    to={`/maintenance/${wo.id}`}
                    className="flex items-start gap-3 px-6 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${wo.priority === 'Critical' ? 'bg-health-critical' : wo.priority === 'High' ? 'bg-amber-500' : 'bg-primary-500'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-400">{wo.id}</span>
                        <Badge tone={PRIORITY_TONE[wo.priority]}>{wo.priority}</Badge>
                        {wo.aiGenerated && <span className="text-[10px] font-semibold text-primary-600">✨ AI</span>}
                      </div>
                      <div className="mt-1 font-medium text-slate-800 truncate">{wo.title}</div>
                      <div className="text-xs text-slate-400 truncate">{wo.assetName}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-500">{wo.status}</div>
                      <div className="text-[11px] text-slate-400">due {relTime(wo.dueDate)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Tasks + Approvals */}
            <div className="flex flex-col gap-6 min-h-0">
              <div className="glass-panel rounded-xl overflow-hidden flex flex-col">
                <div className="px-5 py-3.5 border-b border-slate-200">
                  <h2 className="text-sm font-heading font-semibold text-slate-900">Tasks</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {tasks.length === 0 && <div className="p-6 text-center text-slate-400 text-xs">No tasks.</div>}
                  {tasks.map((t) => (
                    <Link key={t.id} to={t.href ?? '#'} className="block px-5 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                        <span className="text-[11px] text-slate-400">due {relTime(t.due)}</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-700">{t.title}</div>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="glass-panel rounded-xl overflow-hidden flex flex-col">
                <div className="px-5 py-3.5 border-b border-slate-200">
                  <h2 className="text-sm font-heading font-semibold text-slate-900">Approvals</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {approvals.length === 0 && <div className="p-6 text-center text-slate-400 text-xs">Nothing to approve.</div>}
                  {approvals.map((a) => (
                    <div key={a.id} className="px-5 py-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] text-slate-400">{a.id}</span>
                        <span className="text-[11px] text-slate-400">{relTime(a.at)}</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-700">{a.title}</div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Link to="/operations/transfers" className="text-xs font-medium text-primary-600 hover:text-primary-700">Review →</Link>
                        <span className="text-[11px] text-slate-400">from {a.requestedBy}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
