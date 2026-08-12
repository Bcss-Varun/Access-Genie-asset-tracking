import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, MetricCard, FilterBar, Badge, Avatar, EmptyState } from '@/components/ui/primitives';
import { Drawer, DrawerRow, DrawerSection } from '@/components/ui/Drawer';
import { Select } from '@/components/ui/FormDialog';
import { Donut } from '@/components/charts/Donut';
import { useScope } from '@/components/providers/ScopeProvider';
import { organizationScopes, locationScopesWithin, organizationOf } from '@/lib/rbac';
import { allWorkOrders, allAssets, getAssetById } from '@/lib/dataset';
import { relTime, isOverdue, cn } from '@/lib/utils';
import {
  techniciansWithLiveState,
  TECH_STATUS_TONE,
  SKILLS,
  technicianRoster,
  facilitiesUnder,
  scopeNodeForFacility,
  type LiveTechnician,
  type TechnicianStatus,
} from '@/lib/technicians';

// ─────────────────────────────────────────────────────────────────────────────
// Workforce Dashboard — the Super Admin's operational command centre.
// Organization-wide by default; the same page, the same numbers, the same
// tables filter down to one facility the moment the org/location switcher
// (top bar) selects one — see facilitiesUnder() for how the technician layer
// (which the scoped dataset does not cover on its own) follows the switcher.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_ORDER: TechnicianStatus[] = ['On Job', 'En Route', 'Assigned', 'Available', 'Off Shift', 'Unavailable'];
const STATUS_DOT: Record<TechnicianStatus, string> = {
  Available: 'bg-emerald-500',
  Assigned: 'bg-primary-500',
  'On Job': 'bg-primary-600',
  'En Route': 'bg-amber-500',
  'Off Shift': 'bg-slate-300',
  Unavailable: 'bg-red-400',
};
const STATUS_HEX: Record<TechnicianStatus, string> = {
  Available: '#10b981',
  Assigned: '#6366f1',
  'On Job': '#4f46e5',
  'En Route': '#f59e0b',
  'Off Shift': '#cbd5e1',
  Unavailable: '#f87171',
};
const PRIORITY_TONE: Record<string, 'red' | 'amber' | 'primary' | 'slate'> = {
  Critical: 'red', High: 'amber', Medium: 'primary', Low: 'slate',
};

function UtilizationBucket(t: LiveTechnician): 'Highly Utilized' | 'Normal' | 'Under Utilized' | 'Unavailable' {
  if (t.status === 'Unavailable') return 'Unavailable';
  if (t.utilizationPct >= 75) return 'Highly Utilized';
  if (t.utilizationPct >= 25) return 'Normal';
  return 'Under Utilized';
}

function TechnicianDrawer({ tech, onClose }: { tech: LiveTechnician; onClose: () => void }) {
  const assignedAssets = tech.openWorkOrders
    .map((w) => allAssets.find((a) => a.id === w.assetId))
    .filter((a): a is NonNullable<typeof a> => !!a);

  const recentActivity = tech.openWorkOrders
    .flatMap((w) => (w.comments ?? []).map((c) => ({ ...c, workOrderId: w.id })))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 6);

  return (
    <Drawer icon="👷" title={tech.name} subtitle={tech.title} onClose={onClose}
      footer={<Link to="/scheduling" className="text-sm font-medium text-primary-600 hover:text-primary-700">Open in Scheduling & Dispatch →</Link>}
    >
      <div className="flex items-center gap-3">
        <Avatar initials={tech.initials} className="w-12 h-12 text-base" />
        <div className="min-w-0">
          <Badge tone={TECH_STATUS_TONE[tech.status]}>
            <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[tech.status])} />
            {tech.status}
          </Badge>
          <div className="text-xs text-slate-500 mt-1">{tech.shift.label} · {tech.shift.start.toString().padStart(2, '0')}:00–{tech.shift.end.toString().padStart(2, '0')}:00 · {tech.workingDays.join(' ')}</div>
        </div>
      </div>

      <DrawerSection title="Employee">
        <DrawerRow label="Employee ID" value={<span className="font-mono text-xs">{tech.id}</span>} />
        <DrawerRow label="Department" value={tech.department} />
        <DrawerRow label="Region" value={tech.region} />
        <DrawerRow label="Home facility" value={tech.homeFacility} />
        <DrawerRow label="Email" value={tech.email} />
        <DrawerRow label="Phone" value={tech.phone} />
      </DrawerSection>

      <DrawerSection title="Skills">
        <div className="flex flex-wrap gap-1.5">
          {tech.skills.map((s) => <Badge key={s} tone="slate">{s}</Badge>)}
        </div>
      </DrawerSection>

      <DrawerSection title="Current Assignment">
        {tech.currentWorkOrder ? (
          <div className="rounded-lg border border-slate-200 p-3">
            <Link to={`/maintenance/${tech.currentWorkOrder.id}`} className="text-sm font-medium text-slate-800 hover:text-primary-600">{tech.currentWorkOrder.title}</Link>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">{tech.currentWorkOrder.id}</span>
              <Badge tone={PRIORITY_TONE[tech.currentWorkOrder.priority] ?? 'slate'}>{tech.currentWorkOrder.priority}</Badge>
            </div>
          </div>
        ) : <p className="text-sm text-slate-400">No active assignment.</p>}
      </DrawerSection>

      <DrawerSection title={`Assigned Assets (${assignedAssets.length})`}>
        {assignedAssets.length === 0 ? <p className="text-sm text-slate-400">None right now.</p> : (
          <ul className="space-y-1.5">
            {assignedAssets.map((a) => (
              <li key={a.id}>
                <Link to={`/assets/${a.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm hover:border-primary-300">
                  <span className="text-slate-700 truncate">{a.name}</span>
                  <span className="font-mono text-[11px] text-slate-400">{a.id}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DrawerSection>

      <DrawerSection title={`Today's Workload (${tech.openWorkOrders.length})`}>
        {tech.openWorkOrders.length === 0 ? <p className="text-sm text-slate-400">Queue is clear.</p> : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {tech.openWorkOrders.map((w) => (
              <li key={w.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <Link to={`/maintenance/${w.id}`} className="text-slate-700 hover:text-primary-600 truncate">{w.title}</Link>
                <span className="text-xs text-slate-400 shrink-0 ml-2">{w.status}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 text-xs text-slate-400">{tech.workloadHours}h estimated · {tech.utilizationPct}% utilized · {tech.dueToday} due today</div>
      </DrawerSection>

      <DrawerSection title="Recent Activity">
        {recentActivity.length === 0 ? <p className="text-sm text-slate-400">No activity logged yet.</p> : (
          <ul className="space-y-2.5">
            {recentActivity.map((c, i) => (
              <li key={i} className="text-sm">
                <div className="flex items-center gap-2 text-[11px] text-slate-400"><span className="font-mono">{c.workOrderId}</span><span>{relTime(c.at)}</span></div>
                <p className="text-slate-600">{c.text}</p>
              </li>
            ))}
          </ul>
        )}
      </DrawerSection>
    </Drawer>
  );
}

export default function WorkforcePage() {
  const { scope, tree, setScopeId } = useScope();
  const [department, setDepartment] = useState('All');
  const [skill, setSkill] = useState('All');
  const [techStatus, setTechStatus] = useState<'All' | TechnicianStatus>('All');
  const [priority, setPriority] = useState('All');
  const [selected, setSelected] = useState<LiveTechnician | null>(null);
  const [workloadPeriodDays, setWorkloadPeriodDays] = useState(30);

  const organizations = organizationScopes();
  const currentOrg = organizationOf(scope.id) ?? tree;
  const locations = locationScopesWithin(currentOrg.id);

  // Recomputed every render, not memoized: both `allTechnicians` and
  // `allWorkOrders` are module-level bindings that a hydrate can replace
  // wholesale (a scope switch, an assignment made elsewhere), and the roster
  // here is small enough (a few dozen rows) that there is nothing to gain
  // from caching it against a dependency array that would only go stale.
  const liveTechnicians = techniciansWithLiveState();
  const inScopeFacilities = facilitiesUnder(scope);
  const scopedTechnicians = inScopeFacilities
    ? liveTechnicians.filter((t) => inScopeFacilities.has(t.homeFacility))
    : liveTechnicians;

  const departments = [...new Set(technicianRoster().map((t) => t.department))].sort((a, b) => a.localeCompare(b));

  const technicians = scopedTechnicians
    .filter((t) => department === 'All' || t.department === department)
    .filter((t) => skill === 'All' || t.skills.includes(skill as (typeof SKILLS)[number]))
    .filter((t) => techStatus === 'All' || t.status === techStatus);

  // Work orders are already scoped server-side by the same org/location
  // selection (dataset.service filters by asset location) — no separate
  // filtering needed here, only the Priority filter this page adds locally.
  const workOrders = allWorkOrders.filter((w) => priority === 'All' || w.priority === priority);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const count = (s: TechnicianStatus) => technicians.filter((t) => t.status === s).length;
  const criticalJobs = workOrders.filter((w) => w.priority === 'Critical' && w.status !== 'Completed' && w.status !== 'Cancelled').length;
  const overdueJobs = workOrders.filter((w) => w.status !== 'Completed' && w.status !== 'Cancelled' && isOverdue(w.dueDate)).length;
  const unassignedJobs = workOrders.filter((w) => w.assignedTo === 'Unassigned' && w.status !== 'Completed' && w.status !== 'Cancelled').length;

  // ── A. Workforce by facility ─────────────────────────────────────────────
  const facilityNames = inScopeFacilities ?? new Set(technicianRoster().map((t) => t.homeFacility));
  const facilityRows = [...facilityNames].sort((a, b) => a.localeCompare(b)).map((facility) => {
    const techs = liveTechnicians.filter((t) => t.homeFacility === facility);
    const facilityWos = allWorkOrders.filter((w) => getAssetById(w.assetId)?.location?.name === facility);
    return {
      facility,
      total: techs.length,
      available: techs.filter((t) => t.status === 'Available').length,
      assigned: techs.filter((t) => t.status === 'Assigned').length,
      onJob: techs.filter((t) => t.status === 'On Job').length,
      overdueJobs: facilityWos.filter((w) => w.status !== 'Completed' && w.status !== 'Cancelled' && isOverdue(w.dueDate)).length,
    };
  });

  // ── C. Workload overview (date-ranged) ───────────────────────────────────
  const workloadCutoff = Date.now() - workloadPeriodDays * 86_400_000;
  const workloadWos = workOrders.filter((w) => Date.parse(w.createdAt) >= workloadCutoff);
  const workload = {
    open: workloadWos.filter((w) => w.status === 'New').length,
    assigned: workloadWos.filter((w) => w.status === 'Assigned').length,
    inProgress: workloadWos.filter((w) => w.status === 'In Progress').length,
    completed: workloadWos.filter((w) => w.status === 'Completed').length,
    overdue: workloadWos.filter((w) => w.status !== 'Completed' && w.status !== 'Cancelled' && isOverdue(w.dueDate)).length,
  };

  // ── D. Utilization buckets ───────────────────────────────────────────────
  const utilBuckets = ['Highly Utilized', 'Normal', 'Under Utilized', 'Unavailable'] as const;
  const utilization = utilBuckets.map((bucket) => ({
    bucket,
    technicians: technicians.filter((t) => UtilizationBucket(t) === bucket),
  }));

  // ── E. Critical attention ────────────────────────────────────────────────
  const overloaded = technicians.filter((t) => t.utilizationPct > 100);
  const slaRisk = workOrders.filter((w) => {
    if (w.status === 'Completed' || w.status === 'Cancelled') return false;
    const hoursLeft = (Date.parse(w.dueDate) - Date.now()) / 3_600_000;
    return hoursLeft > 0 && hoursLeft <= 24;
  });

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Workforce Dashboard"
        subtitle="Organization-wide view of technicians, field work and operational workload."
        breadcrumb={[{ label: 'Mobile Workforce', href: '/workforce' }, { label: 'Workforce Dashboard' }]}
      />

      {/* KPIs — the five numbers worth a first glance; the rest of the mix
          (Assigned / On Job / En Route / Off Shift / Unavailable) lives in
          Workforce Status below, not repeated up here as its own tile. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <MetricCard label="Total Technicians" value={technicians.length} sub={scope.name} tone="primary" />
        <MetricCard label="Available" value={count('Available')} sub={`${Math.round((count('Available') / (technicians.length || 1)) * 100)}% of roster`} tone="emerald" />
        <MetricCard label="Critical Jobs" value={criticalJobs} sub={criticalJobs > 0 ? 'Needs attention' : 'None open'} tone={criticalJobs > 0 ? 'red' : 'emerald'} />
        <MetricCard label="Overdue Jobs" value={overdueJobs} sub={overdueJobs > 0 ? 'Past due date' : 'On schedule'} tone={overdueJobs > 0 ? 'red' : 'emerald'} />
        <MetricCard label="Unassigned Jobs" value={unassignedJobs} sub={unassignedJobs > 0 ? 'Awaiting dispatch' : 'All dispatched'} tone={unassignedJobs > 0 ? 'amber' : 'emerald'} />
      </div>

      {/* Organization context + filters */}
      <FilterBar>
        {organizations.length > 1 && (
          <Field label="Organization">
            <Select value={currentOrg.id} onChange={(e) => setScopeId(e.target.value)}
              options={organizations.map(({ node, depth }) => ({ value: node.id, label: `${'  '.repeat(depth)}${node.name}` }))} />
          </Field>
        )}
        <Field label="Region / Facility">
          <Select value={scope.id} onChange={(e) => setScopeId(e.target.value)}
            options={[{ value: currentOrg.id, label: 'All facilities' }, ...locations.map(({ node, depth }) => ({ value: node.id, label: `${'  '.repeat(depth)}${node.name}` }))]} />
        </Field>
        <Field label="Department">
          <Select value={department} onChange={(e) => setDepartment(e.target.value)} options={[{ value: 'All', label: 'All departments' }, ...departments.map((d) => ({ value: d, label: d }))]} />
        </Field>
        <Field label="Skill">
          <Select value={skill} onChange={(e) => setSkill(e.target.value)} options={[{ value: 'All', label: 'All skills' }, ...SKILLS.map((s) => ({ value: s, label: s }))]} />
        </Field>
        <Field label="Technician Status">
          <Select value={techStatus} onChange={(e) => setTechStatus(e.target.value as typeof techStatus)} options={[{ value: 'All', label: 'Any status' }, ...STATUS_ORDER.map((s) => ({ value: s, label: s }))]} />
        </Field>
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value)} options={[{ value: 'All', label: 'All priorities' }, ...['Critical', 'High', 'Medium', 'Low'].map((p) => ({ value: p, label: p }))]} />
        </Field>
      </FilterBar>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* A. Workforce by facility */}
        <div className="xl:col-span-2 glass-panel rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-heading font-semibold text-slate-900">Workforce by Facility</h2>
            {scope.id !== currentOrg.id && (
              <button onClick={() => setScopeId(currentOrg.id)} className="text-xs font-medium text-primary-600 hover:text-primary-700">← Back to organization</button>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-5 py-3">Facility</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3 text-right">Available</th>
                  <th className="px-5 py-3 text-right">Assigned</th>
                  <th className="px-5 py-3 text-right">On Job</th>
                  <th className="px-5 py-3 text-right">Overdue Jobs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {facilityRows.map((f) => {
                  const node = scopeNodeForFacility(f.facility, tree);
                  return (
                    <tr key={f.facility} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => node && setScopeId(node.id)}>
                      <td className="px-5 py-3 font-medium text-slate-800">{f.facility}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{f.total}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-emerald-600">{f.available}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-primary-600">{f.assigned}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-primary-700">{f.onJob}</td>
                      <td className={cn('px-5 py-3 text-right tabular-nums font-semibold', f.overdueJobs > 0 ? 'text-health-critical' : 'text-slate-400')}>{f.overdueJobs}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* B. Workforce status */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-base font-heading font-semibold text-slate-900 mb-3">Workforce Status</h2>
          <Donut
            slices={STATUS_ORDER.map((s) => ({ label: s, value: count(s), color: STATUS_HEX[s] })).filter((s) => s.value > 0)}
            totalLabel="Technicians"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* C. Workload overview */}
        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-heading font-semibold text-slate-900">Workload Overview</h2>
            <Select value={String(workloadPeriodDays)} onChange={(e) => setWorkloadPeriodDays(Number(e.target.value))} className="!w-auto !py-1 !text-xs"
              options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([['Open', workload.open, 'slate'], ['Assigned', workload.assigned, 'primary'], ['In Progress', workload.inProgress, 'primary'], ['Completed', workload.completed, 'emerald'], ['Overdue', workload.overdue, 'red']] as const).map(([label, value, tone]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                <div className={cn('mt-1 text-xl font-heading font-bold tabular-nums', tone === 'red' ? 'text-health-critical' : tone === 'emerald' ? 'text-emerald-600' : 'text-slate-900')}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* D. Technician utilization */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-base font-heading font-semibold text-slate-900 mb-4">Technician Utilization</h2>
          <div className="space-y-2">
            {utilization.map(({ bucket, technicians: bucketTechs }) => (
              <div key={bucket} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
                <span className="text-sm font-medium text-slate-700">{bucket}</span>
                <span className="text-lg font-heading font-bold tabular-nums text-slate-900">{bucketTechs.length}</span>
              </div>
            ))}
          </div>
        </div>

        {/* E. Critical attention */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-base font-heading font-semibold text-slate-900 mb-4">Critical Attention</h2>
          <ul className="space-y-1">
            <li><Link to="/work-orders?priority=Critical" className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm hover:bg-slate-50"><span className="text-slate-700">Critical work orders</span><Badge tone={criticalJobs > 0 ? 'red' : 'slate'}>{criticalJobs}</Badge></Link></li>
            <li><Link to="/work-orders?sla=Overdue" className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm hover:bg-slate-50"><span className="text-slate-700">Overdue work orders</span><Badge tone={overdueJobs > 0 ? 'red' : 'slate'}>{overdueJobs}</Badge></Link></li>
            <li><Link to="/work-orders?technician=Unassigned" className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm hover:bg-slate-50"><span className="text-slate-700">Unassigned work orders</span><Badge tone={unassignedJobs > 0 ? 'amber' : 'slate'}>{unassignedJobs}</Badge></Link></li>
            <li><Link to="/work-orders?sla=At+Risk" className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm hover:bg-slate-50"><span className="text-slate-700">SLA risks (due within 24h)</span><Badge tone={slaRisk.length > 0 ? 'amber' : 'slate'}>{slaRisk.length}</Badge></Link></li>
            <li><Link to="/scheduling" className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm hover:bg-slate-50"><span className="text-slate-700">Overloaded technicians</span><Badge tone={overloaded.length > 0 ? 'red' : 'slate'}>{overloaded.length}</Badge></Link></li>
          </ul>
        </div>
      </div>

      {/* Technician roster table */}
      <div className="glass-panel rounded-xl flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200"><h2 className="text-base font-heading font-semibold text-slate-900">Technician Status</h2></div>
        <div className="flex-1 overflow-auto">
          {technicians.length === 0 ? (
            <EmptyState variant="no-results" title="No technicians match these filters" description="Try clearing a filter." />
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-6 py-3.5">Technician</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Current Work Order</th>
                  <th className="px-6 py-3.5">Location / Facility</th>
                  <th className="px-6 py-3.5">Asset</th>
                  <th className="px-6 py-3.5">Priority</th>
                  <th className="px-6 py-3.5 text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {technicians
                  .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name))
                  .map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setSelected(t)}>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar initials={t.initials} />
                          <div className="min-w-0">
                            <div className="font-medium text-slate-800">{t.name}</div>
                            <div className="text-[11px] text-slate-400 truncate">{t.department}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3.5"><Badge tone={TECH_STATUS_TONE[t.status]}><span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[t.status])} />{t.status}</Badge></td>
                      <td className="px-6 py-3.5">
                        {t.currentWorkOrder ? (
                          <Link to={`/maintenance/${t.currentWorkOrder.id}`} onClick={(e) => e.stopPropagation()} className="text-slate-700 hover:text-primary-600 transition-colors">
                            <span className="font-mono text-[11px] text-slate-400 mr-1.5">{t.currentWorkOrder.id}</span>{t.currentWorkOrder.title}
                          </Link>
                        ) : <span className="text-slate-400 text-xs">No active job</span>}
                      </td>
                      <td className="px-6 py-3.5 text-slate-600 text-xs">{t.currentFacility}</td>
                      <td className="px-6 py-3.5 text-slate-600 text-xs">{t.currentWorkOrder ? allAssets.find((a) => a.id === t.currentWorkOrder!.assetId)?.name ?? '—' : '—'}</td>
                      <td className="px-6 py-3.5">{t.currentWorkOrder ? <Badge tone={PRIORITY_TONE[t.currentWorkOrder.priority] ?? 'slate'}>{t.currentWorkOrder.priority}</Badge> : <span className="text-slate-300">—</span>}</td>
                      <td className="px-6 py-3.5 text-right text-slate-400 text-xs">{t.currentWorkOrder ? relTime(t.currentWorkOrder.updatedAt) : '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected && <TechnicianDrawer tech={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/** Compact labelled filter control — a `Field` without the heavier chrome the form dialogs use. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}
