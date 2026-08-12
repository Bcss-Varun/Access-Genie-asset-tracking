import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, MetricCard, FilterBar, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { FormDialog, Field, FieldRow, Select, TextArea, TextInput, dateInDays } from '@/components/ui/FormDialog';
import { AssetPicker } from '@/components/ui/AssetPicker';
import { FieldActionButtons, SlaChip } from '@/components/workforce/WorkOrderActions';
import { useMutate } from '@/api/mutate';
import { maintenanceApi } from '@/api/work-orders';
import { allWorkOrders, getAssetById } from '@/lib/dataset';
import { fieldStageLabel, slaStatus, STAGE_TONE, SLA_STATUSES, type SlaStatus } from '@/lib/field-ops';
import { rosterNames, SKILLS } from '@/lib/technicians';
import { relTime, isOverdue, cn } from '@/lib/utils';
import { WORK_ORDER_PRIORITIES, WORK_ORDER_SOURCES, WORK_ORDER_STATUSES, WORK_ORDER_TYPES } from '@access-genie/shared';
import type { WorkOrder, WorkOrderPriority, WorkOrderType, WorkOrderSource } from '@access-genie/shared';

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

/**
 * Raise a field job.
 *
 * Technician assignment is optional — an unassigned work order is a normal
 * state, not a validation failure; it is exactly what Scheduling & Dispatch
 * exists to clear. Facility/location are read off the asset once it is
 * picked rather than asked for again — the asset registry already owns that,
 * so this form does not collect a second, independently-typed copy of it.
 */
function NewWorkOrderDialog({ onClose }: { onClose: () => void }) {
  const { run, isPending } = useMutate();

  const [assetId, setAssetId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<WorkOrderType>('Corrective');
  const [priority, setPriority] = useState<WorkOrderPriority>('Medium');
  const [requiredSkill, setRequiredSkill] = useState('');
  const [dueDate, setDueDate] = useState(dateInDays(3));
  const [estimatedHours, setEstimatedHours] = useState('2');
  const [technician, setTechnician] = useState('Unassigned');
  const [source, setSource] = useState<WorkOrderSource>('Manual');

  const asset = assetId ? getAssetById(assetId) : undefined;

  const submit = async () => {
    const ok = await run(
      maintenanceApi.create({
        title: title.trim(),
        assetId,
        type,
        priority,
        status: 'New',
        assignedTo: technician,
        dueDate: new Date(dueDate).toISOString(),
        description: description.trim(),
        estimatedHours: Number(estimatedHours) || 1,
        source,
        requiredSkill: requiredSkill || undefined,
      }),
      {
        success: 'Work order created',
        successDetail: title.trim(),
        describe: 'create that work order',
      },
    );
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="🧾"
      title="New work order"
      description="Enters the queue as Open. Assigning a technician now is optional — Scheduling & Dispatch can pick it up later."
      submitLabel="Create Work Order"
      busy={isPending}
      disabled={!assetId || title.trim().length < 4}
      onSubmit={() => void submit()}
      onCancel={onClose}
      width="lg"
    >
      <AssetPicker value={assetId} onChange={setAssetId} required />
      {asset && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{asset.location.name}</span>
          {asset.location.zone && <span> · {asset.location.zone}</span>}
          <span className="ml-2 font-mono text-slate-400">{asset.id}</span>
        </div>
      )}

      <Field label="Title" required>
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Replace failing UPS battery" />
      </Field>

      <Field label="Description">
        <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What needs to be done, and why." />
      </Field>

      <FieldRow>
        <Field label="Work Type" required>
          <Select value={type} onChange={(e) => setType(e.target.value as WorkOrderType)} options={WORK_ORDER_TYPES.map((t) => ({ value: t, label: t }))} />
        </Field>
        <Field label="Priority" required>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as WorkOrderPriority)} options={WORK_ORDER_PRIORITIES.map((p) => ({ value: p, label: p }))} />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Due Date" required>
          <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Estimated Hours (SLA)">
          <TextInput type="number" min={0} step={0.5} value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Required Skill" hint="Used to match technicians in Scheduling & Dispatch.">
          <Select value={requiredSkill} onChange={(e) => setRequiredSkill(e.target.value)} options={[{ value: '', label: 'Not specified' }, ...SKILLS.map((s) => ({ value: s, label: s }))]} />
        </Field>
        <Field label="Technician" hint="Optional — leave unassigned to dispatch later.">
          <Select value={technician} onChange={(e) => setTechnician(e.target.value)} options={[{ value: 'Unassigned', label: 'Unassigned' }, ...rosterNames().map((n) => ({ value: n, label: n }))]} />
        </Field>
      </FieldRow>

      <Field label="Source" required hint="Where this job originated.">
        <Select value={source} onChange={(e) => setSource(e.target.value as WorkOrderSource)} options={WORK_ORDER_SOURCES.map((s) => ({ value: s, label: s }))} />
      </Field>
    </FormDialog>
  );
}

export default function WorkOrdersPage() {
  const [params] = useSearchParams();

  const [status, setStatus] = useState(params.get('status') ?? 'All');
  const [priority, setPriority] = useState(params.get('priority') ?? 'All');
  const [technician, setTechnician] = useState(params.get('technician') ?? 'All');
  const [facility, setFacility] = useState(params.get('facility') ?? 'All');
  const [type, setType] = useState('All');
  const [source, setSource] = useState('All');
  const [sla, setSla] = useState<'All' | SlaStatus>((params.get('sla') as SlaStatus) ?? 'All');
  const [due, setDue] = useState<DueFilter>('All');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  // Not memoized: `allWorkOrders` is a module binding a hydrate replaces
  // wholesale, and a `[]` dependency array would freeze these lists at
  // whichever work orders existed on the first render of this page.
  const technicians = [...new Set(allWorkOrders.map((w) => w.assignedTo).filter((t) => t && t !== 'Unassigned'))].sort((a, b) => a.localeCompare(b));
  const facilities = (() => {
    const set = new Set<string>();
    for (const w of allWorkOrders) {
      const loc = getAssetById(w.assetId)?.location?.name;
      if (loc) set.add(loc);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  })();

  const rows = allWorkOrders
    .filter((w) => status === 'All' || w.status === status)
    .filter((w) => priority === 'All' || w.priority === priority)
    .filter((w) => technician === 'All' || w.assignedTo === technician)
    .filter((w) => type === 'All' || w.type === type)
    .filter((w) => source === 'All' || (w.source ?? 'Manual') === source)
    .filter((w) => sla === 'All' || slaStatus(w.dueDate, w.status) === sla)
    .filter((w) => facility === 'All' || getAssetById(w.assetId)?.location?.name === facility)
    .filter((w) => dueMatches(w.dueDate, due))
    .filter((w) => {
      if (!q.trim()) return true;
      const needle = q.trim().toLowerCase();
      return w.id.toLowerCase().includes(needle) || w.title.toLowerCase().includes(needle) || w.assetName.toLowerCase().includes(needle);
    })
    .sort((a, b) => PRIORITY_RANK[b.priority]! - PRIORITY_RANK[a.priority]! || Date.parse(a.dueDate) - Date.parse(b.dueDate));

  const open = allWorkOrders.filter((w) => w.status === 'New').length;
  const assigned = allWorkOrders.filter((w) => w.status === 'Assigned').length;
  const inProgress = allWorkOrders.filter((w) => w.status === 'In Progress').length;
  const overdue = allWorkOrders.filter((w) => w.status !== 'Completed' && w.status !== 'Cancelled' && isOverdue(w.dueDate)).length;
  const completed = allWorkOrders.filter((w) => w.status === 'Completed').length;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Work Orders"
        subtitle="Every field job — asset, location, technician and how much SLA runway is left."
        breadcrumb={[{ label: 'Mobile Workforce', href: '/workforce' }, { label: 'Work Orders' }]}
        actions={<Button onClick={() => setCreating(true)}>+ New Work Order</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard label="Open" value={open} sub="Not yet assigned" tone="primary" />
        <MetricCard label="Assigned" value={assigned} sub="Awaiting acceptance" tone="primary" />
        <MetricCard label="In Progress" value={inProgress} sub="Being worked" tone="primary" />
        <MetricCard label="Overdue" value={overdue} sub={overdue > 0 ? 'Past SLA' : 'None overdue'} tone={overdue > 0 ? 'red' : 'emerald'} />
        <MetricCard label="Completed" value={completed} sub="Closed out" tone="emerald" />
      </div>

      <FilterBar min={150}>
        <Field label="Search"><TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, title or asset…" /></Field>
        <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'All', label: 'All statuses' }, ...WORK_ORDER_STATUSES.map((s) => ({ value: s, label: s }))]} /></Field>
        <Field label="Priority"><Select value={priority} onChange={(e) => setPriority(e.target.value)} options={[{ value: 'All', label: 'All priorities' }, ...WORK_ORDER_PRIORITIES.map((p) => ({ value: p, label: p }))]} /></Field>
        <Field label="Work Type"><Select value={type} onChange={(e) => setType(e.target.value)} options={[{ value: 'All', label: 'All work types' }, ...WORK_ORDER_TYPES.map((t) => ({ value: t, label: t }))]} /></Field>
        <Field label="Source"><Select value={source} onChange={(e) => setSource(e.target.value)} options={[{ value: 'All', label: 'All sources' }, ...WORK_ORDER_SOURCES.map((s) => ({ value: s, label: s }))]} /></Field>
        <Field label="SLA"><Select value={sla} onChange={(e) => setSla(e.target.value as typeof sla)} options={[{ value: 'All', label: 'Any SLA' }, ...SLA_STATUSES.map((s) => ({ value: s, label: s }))]} /></Field>
        <Field label="Technician"><Select value={technician} onChange={(e) => setTechnician(e.target.value)} options={[{ value: 'All', label: 'All technicians' }, ...technicians.map((t) => ({ value: t, label: t }))]} /></Field>
        <Field label="Facility"><Select value={facility} onChange={(e) => setFacility(e.target.value)} options={[{ value: 'All', label: 'All facilities' }, ...facilities.map((f) => ({ value: f, label: f }))]} /></Field>
        <Field label="Due"><Select value={due} onChange={(e) => setDue(e.target.value as DueFilter)} options={DUE_FILTERS.map((d) => ({ value: d, label: d }))} /></Field>
        <div className="flex items-center justify-end text-xs font-medium text-slate-400 sm:justify-start">{rows.length} of {allWorkOrders.length} shown</div>
      </FilterBar>

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
                  <th className="px-6 py-3.5">Source</th>
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
                      <td className="px-6 py-3.5 text-slate-500 text-xs">{w.source ?? 'Manual'}</td>
                      <td className="px-6 py-3.5 text-slate-500 text-xs">{relTime(w.dueDate)}</td>
                      <td className="px-6 py-3.5"><SlaChip dueDate={w.dueDate} status={w.status} /></td>
                      <td className="px-6 py-3.5">
                        <div className="flex flex-col gap-1">
                          <Badge tone="slate">{w.status}</Badge>
                          {w.status !== 'Completed' && w.status !== 'Cancelled' && (
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

      {creating && <NewWorkOrderDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
