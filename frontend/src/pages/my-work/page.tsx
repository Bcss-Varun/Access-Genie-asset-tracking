import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Badge, EmptyState, MetricCard } from '@/components/ui/primitives';
import { FieldActionButtons, SlaChip } from '@/components/workforce/WorkOrderActions';
import { useSession } from '@/components/providers/SessionProvider';
import { allWorkOrders, allTransfers, getAssetById } from '@/lib/dataset';
import { fieldStageLabel } from '@/lib/field-ops';
import { nowMs, relTime, isOverdue } from '@/lib/utils';
import type { WorkOrder, WorkOrderPriority } from '@access-genie/shared';

// ─────────────────────────────────────────────────────────────────────────────
// My Work — the signed-in technician's personal work queue for today: what is
// assigned, what is due, and one action each to move it forward. Approvals
// (when the signed-in person is one) sit alongside, not on top of, execution.
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_RANK: Record<WorkOrderPriority, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const PRIORITY_TONE: Record<WorkOrderPriority, 'red' | 'amber' | 'primary' | 'slate'> = {
  Critical: 'red', High: 'amber', Medium: 'primary', Low: 'slate',
};

export default function MyWorkPage() {
  const { session } = useSession();
  const { user } = session;
  const canMaintain = session.modules.includes('maintenance') || session.modules.includes('operations');
  const isApprover = ['super_admin', 'org_admin', 'facility_manager', 'maintenance_manager'].includes(session.role.id);

  // Work orders: match by name, else fall back to open ones for a role that
  // actually does field work — an executive with no personal queue sees none.
  const workOrders = useMemo<WorkOrder[]>(() => {
    const isOpen = (w: WorkOrder) => w.status !== 'Completed' && w.status !== 'Cancelled';
    const mine = allWorkOrders.filter((w) => w.assignedTo === user.name && isOpen(w));
    const base = mine.length > 0 ? mine : canMaintain ? allWorkOrders.filter(isOpen) : [];
    return [...base].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || Date.parse(a.dueDate) - Date.parse(b.dueDate));
  }, [user.name, canMaintain]);

  const approvals = useMemo(() => {
    if (!isApprover) return [];
    return allTransfers.filter((t) => t.status === 'Pending' && t.requester !== user.name);
  }, [isApprover, user.name]);

  const today = new Date(nowMs()).toISOString().slice(0, 10);
  const dueToday = workOrders.filter((w) => w.dueDate.slice(0, 10) === today).length;
  const critical = workOrders.filter((w) => w.priority === 'Critical').length;
  const inProgress = workOrders.filter((w) => w.status === 'In Progress').length;
  const overdue = workOrders.filter((w) => isOverdue(w.dueDate)).length;

  const totalItems = workOrders.length + approvals.length;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={`Good morning, ${user.name.split(' ')[0]}`}
        subtitle={`${user.title} — here is your work for today.`}
        breadcrumb={[{ label: 'Mobile Workforce', href: '/workforce' }, { label: 'My Work' }]}
      />

      {totalItems === 0 ? (
        <div className="glass-panel rounded-xl flex-1 min-h-0 flex items-center justify-center">
          <EmptyState
            icon="🌤️"
            title="You're all caught up"
            description={`No work orders or approvals are assigned to ${user.name}. Enjoy the quiet.`}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <MetricCard label="Assigned" value={workOrders.length} sub="In your queue" tone="primary" />
            <MetricCard label="Due Today" value={dueToday} sub="Before end of shift" tone={dueToday > 0 ? 'amber' : 'emerald'} />
            <MetricCard label="Critical" value={critical} sub={critical > 0 ? 'Needs attention' : 'None open'} tone={critical > 0 ? 'red' : 'emerald'} />
            <MetricCard label="In Progress" value={inProgress} sub="Being worked" tone="primary" />
            <MetricCard label="Overdue" value={overdue} sub={overdue > 0 ? 'Past due date' : 'None overdue'} tone={overdue > 0 ? 'red' : 'emerald'} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3 flex-1 min-h-0">
            {/* Today's work */}
            <div className="lg:col-span-2 glass-panel rounded-xl overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-base font-heading font-semibold text-slate-900">Today&apos;s Work</h2>
              </div>
              <div className="flex-1 overflow-auto">
                {workOrders.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 text-sm">No work orders assigned.</div>
                ) : (
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
                      <tr>
                        <th className="px-5 py-3">Priority</th>
                        <th className="px-5 py-3">Work Order</th>
                        <th className="px-5 py-3">Asset</th>
                        <th className="px-5 py-3">Location</th>
                        <th className="px-5 py-3">Scheduled</th>
                        <th className="px-5 py-3">SLA</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {workOrders.map((wo) => {
                        const asset = getAssetById(wo.assetId);
                        return (
                          <tr key={wo.id} className={isOverdue(wo.dueDate) ? 'bg-red-50/40' : undefined}>
                            <td className="px-5 py-3"><Badge tone={PRIORITY_TONE[wo.priority]}>{wo.priority}</Badge></td>
                            <td className="px-5 py-3 max-w-[14rem]">
                              <Link to={`/maintenance/${wo.id}`} className="font-medium text-slate-800 hover:text-primary-600 transition-colors truncate block">
                                {wo.title}
                              </Link>
                              <span className="font-mono text-[11px] text-slate-400">{wo.id}</span>
                            </td>
                            <td className="px-5 py-3 text-slate-600">{wo.assetName}</td>
                            <td className="px-5 py-3 text-slate-500 text-xs">{asset?.location?.name ?? '—'}</td>
                            <td className="px-5 py-3 text-slate-500 text-xs">{relTime(wo.dueDate)}</td>
                            <td className="px-5 py-3"><SlaChip dueDate={wo.dueDate} status={wo.status} /></td>
                            <td className="px-5 py-3"><Badge tone="slate">{fieldStageLabel(wo)}</Badge></td>
                            <td className="px-5 py-3 text-right"><FieldActionButtons wo={wo} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Approvals — secondary panel, only for roles that approve */}
            <div className="flex flex-col gap-6 min-h-0">
              <div className="glass-panel rounded-xl overflow-hidden flex flex-col">
                <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-sm font-heading font-semibold text-slate-900">Pending Approvals</h2>
                  {approvals.length > 0 && <Badge tone="amber">{approvals.length}</Badge>}
                </div>
                <div className="divide-y divide-slate-100">
                  {approvals.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs">Nothing to approve.</div>
                  ) : (
                    approvals.map((a) => (
                      <div key={a.id} className="px-5 py-3">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[11px] text-slate-400">{a.id}</span>
                          <span className="text-[11px] text-slate-400">{relTime(a.requestedAt)}</span>
                        </div>
                        <div className="mt-1 text-sm text-slate-700">
                          Transfer: {a.assetName} → {a.to}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Link to="/asset-movement" className="text-xs font-medium text-primary-600 hover:text-primary-700">Review →</Link>
                          <span className="text-[11px] text-slate-400">from {a.requester}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
