import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, KpiCard, Badge, EmptyState } from '@/components/ui/primitives';
import { Select, TextInput } from '@/components/ui/FormDialog';
import { FieldActionButtons, SlaChip } from '@/components/workforce/WorkOrderActions';
import { allWorkOrders, getAssetById } from '@/lib/dataset';
import { fieldStageLabel, STAGE_TONE } from '@/lib/field-ops';
import { relTime, isOverdue, cn } from '@/lib/utils';
import { WORK_ORDER_PRIORITIES, WORK_ORDER_STATUSES, WORK_ORDER_TYPES } from '@access-genie/shared';
import type { WorkOrder } from '@access-genie/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Work Orders — the field-job register: every job, who has it, where the asset
// is, and how much runway is left against its SLA. Complements the automated
// work-order queue in Predictive Maintenance rather than duplicating it — this
// view is filtered and columned for "who does what where", not for triage.
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_TONE: Record<string, 'red' | 'amber' | 'primary' | 'slate'> = {
  Critical: 'red', High: 'amber', Medium: 'primary', Low: 'slate',
};
const PRIORITY_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

const DUE_FILTERS = ['All', 'Overdue', 'Due Today', 'Due This Week'] as const;
type DueFilter = (typeof DUE_FILTERS)[number];

function dueMatches(dueDate: string, filter: DueFilter): boolean {
  if (filter === 'All') return true;
  const due = Date.parse(dueDate);
  const now = Date.now();
  if (filter === 'Overdue') return due < now;
  const day = 86_400_000;
  if (filter === 'Due Today') return due >= now - day && due < now + day;
  return due >= now && due < now + 7 * day;
}

export default function WorkOrdersPage() {
  const [status, setStatus] = useState('All');
  const [priority, setPriority] = useState('All');
  const [technician, setTechnician] = useState('All');
  const [facility, setFacility] = useState('All');
  const [type, setType] = useState('All');
  const [due, setDue] = useState<DueFilter>('All');
  const [q, setQ] = useState('');

  const technicians = useMemo(
    () => [...new Set(allWorkOrders.map((w) => w.assignedTo).filter((t) => t && t !== 'Unassigned'))].sort((a, b) => a.localeCompare(b)),
    [],
  );
  const facilities = useMemo(() => {
    const set = new Set<string>();
    for (const w of allWorkOrders) {
      const loc = getAssetById(w.assetId)?.location?.name;
      if (loc) set.add(loc);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, []);

  const rows = allWorkOrders
    .filter((w) => status === 'All' || w.status === status)
    .filter((w) => priority === 'All' || w.priority === priority)
    .filter((w) => technician === 'All' || w.assignedTo === technician)
    .filter((w) => type === 'All' || w.type === type)
    .filter((w) => facility === 'All' || getAssetById(w.assetId)?.location?.name === facility)
    .filter((w) => dueMatches(w.dueDate, due))
    .filter((w) => {
      if (!q.trim()) return true;
      const needle = q.trim().toLowerCase();
      return w.id.toLowerCase().includes(needle) || w.title.toLowerCase().includes(needle) || w.assetName.toLowerCase().includes(needle);
    })
    .sort((a, b) => PRIORITY_RANK[b.priority]! - PRIORITY_RANK[a.priority]! || Date.parse(a.dueDate) - Date.parse(b.dueDate));

  const open = allWorkOrders.filter((w) => w.status === 'New' || w.status === 'Assigned').length;
  const assigned = allWorkOrders.filter((w) => w.status === 'Assigned').length;
  const inProgress = allWorkOrders.filter((w) => w.status === 'In Progress').length;
  const overdue = allWorkOrders.filter((w) => w.status !== 'Completed' && isOverdue(w.dueDate)).length;
  const completed = allWorkOrders.filter((w) => w.status === 'Completed').length;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Work Orders"
        subtitle="Every field job — asset, location, technician and how much SLA runway is left."
        breadcrumb={[{ label: 'Mobile Workforce', href: '/workforce' }, { label: 'Work Orders' }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Open" value={open} sub="New & unstarted" accent />
        <KpiCard label="Assigned" value={assigned} sub="Awaiting acceptance" tone="primary" />
        <KpiCard label="In Progress" value={inProgress} sub="Being worked" tone="primary" />
        <KpiCard label="Overdue" value={overdue} sub={overdue > 0 ? 'Past SLA' : 'None overdue'} tone={overdue > 0 ? 'red' : 'emerald'} />
        <KpiCard label="Completed" value={completed} sub="Closed out" tone="emerald" />
      </div>

      <div className="glass-panel rounded-xl p-3 flex flex-wrap items-center gap-2">
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, title or asset…" className="!w-56" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto" options={[{ value: 'All', label: 'All statuses' }, ...WORK_ORDER_STATUSES.map((s) => ({ value: s, label: s }))]} />
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="!w-auto" options={[{ value: 'All', label: 'All priorities' }, ...WORK_ORDER_PRIORITIES.map((p) => ({ value: p, label: p }))]} />
        <Select value={type} onChange={(e) => setType(e.target.value)} className="!w-auto" options={[{ value: 'All', label: 'All work types' }, ...WORK_ORDER_TYPES.map((t) => ({ value: t, label: t }))]} />
        <Select value={technician} onChange={(e) => setTechnician(e.target.value)} className="!w-auto" options={[{ value: 'All', label: 'All technicians' }, ...technicians.map((t) => ({ value: t, label: t }))]} />
        <Select value={facility} onChange={(e) => setFacility(e.target.value)} className="!w-auto" options={[{ value: 'All', label: 'All facilities' }, ...facilities.map((f) => ({ value: f, label: f }))]} />
        <Select value={due} onChange={(e) => setDue(e.target.value as DueFilter)} className="!w-auto" options={DUE_FILTERS.map((d) => ({ value: d, label: d }))} />
        <span className="ml-auto text-xs text-slate-400">{rows.length} of {allWorkOrders.length}</span>
      </div>

      <div className="glass-panel rounded-xl flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          {rows.length === 0 ? (
            <EmptyState variant="no-results" title="No work orders match these filters" description="Try clearing a filter." />
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-6 py-3.5">Work Order</th>
                  <th className="px-6 py-3.5">Type</th>
                  <th className="px-6 py-3.5">Asset</th>
                  <th className="px-6 py-3.5">Facility</th>
                  <th className="px-6 py-3.5">Priority</th>
                  <th className="px-6 py-3.5">Technician</th>
                  <th className="px-6 py-3.5">Scheduled</th>
                  <th className="px-6 py-3.5">SLA</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((w: WorkOrder) => {
                  const asset = getAssetById(w.assetId);
                  const stage = fieldStageLabel(w);
                  return (
                    <tr key={w.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3.5">
                        <Link to={`/maintenance/${w.id}`} className="font-medium text-slate-800 hover:text-primary-600 transition-colors">{w.title}</Link>
                        <div className="text-[11px] font-mono text-slate-400">{w.id}</div>
                      </td>
                      <td className="px-6 py-3.5 text-slate-600 text-xs">{w.type}</td>
                      <td className="px-6 py-3.5">
                        <Link to={`/assets/${w.assetId}`} className="text-slate-700 hover:text-primary-600 truncate">{w.assetName}</Link>
                      </td>
                      <td className="px-6 py-3.5 text-slate-600 text-xs">{asset?.location?.name ?? '—'}</td>
                      <td className="px-6 py-3.5"><Badge tone={PRIORITY_TONE[w.priority] ?? 'slate'}>{w.priority}</Badge></td>
                      <td className="px-6 py-3.5 text-slate-600 text-xs">{w.assignedTo}</td>
                      <td className="px-6 py-3.5 text-slate-500 text-xs">{relTime(w.dueDate)}</td>
                      <td className="px-6 py-3.5"><SlaChip dueDate={w.dueDate} status={w.status} /></td>
                      <td className="px-6 py-3.5">
                        <div className="flex flex-col gap-1">
                          <Badge tone="slate">{w.status}</Badge>
                          {w.status !== 'Completed' && (
                            <span className={cn('text-[10px] font-medium', STAGE_TONE[stage] === 'red' ? 'text-red-600' : STAGE_TONE[stage] === 'amber' ? 'text-amber-600' : 'text-primary-600')}>
                              {stage}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <FieldActionButtons wo={w} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
