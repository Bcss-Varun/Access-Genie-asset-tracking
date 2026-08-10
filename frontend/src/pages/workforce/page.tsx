import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, KpiCard, Badge, Avatar, EmptyState } from '@/components/ui/primitives';
import { Drawer, DrawerRow, DrawerSection } from '@/components/ui/Drawer';
import { Select } from '@/components/ui/FormDialog';
import { Button } from '@/components/ui/Button';
import { ScanAssetDialog } from '@/components/workforce/ScanAssetDialog';
import { allWorkOrders, allAssets, allCustody } from '@/lib/dataset';
import { relTime, isOverdue, cn } from '@/lib/utils';
import {
  techniciansWithLiveState,
  TECH_STATUS_TONE,
  SKILLS,
  ROSTER,
  type LiveTechnician,
  type TechnicianStatus,
} from '@/lib/technicians';

// ─────────────────────────────────────────────────────────────────────────────
// Workforce Overview — the command-centre landing page for Mobile Workforce.
// Who is doing what, right now, and which assets are out with them. No map, no
// telemetry — location here is "which facility", the operational fact a
// supervisor actually needs.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_ORDER: TechnicianStatus[] = ['On Job', 'On Site', 'En Route', 'Assigned', 'Waiting', 'Available', 'Completed', 'Offline'];
const STATUS_DOT: Record<TechnicianStatus, string> = {
  Available: 'bg-emerald-500',
  Assigned: 'bg-primary-500',
  'En Route': 'bg-amber-500',
  'On Site': 'bg-primary-500',
  'On Job': 'bg-primary-600',
  Waiting: 'bg-amber-500',
  Completed: 'bg-emerald-500',
  Offline: 'bg-slate-300',
};

const PRIORITY_TONE: Record<string, 'red' | 'amber' | 'primary' | 'slate'> = {
  Critical: 'red', High: 'amber', Medium: 'primary', Low: 'slate',
};

function TechnicianDrawer({ tech, onClose }: { tech: LiveTechnician; onClose: () => void }) {
  const assignedAssets = tech.openWorkOrders
    .map((w) => allAssets.find((a) => a.id === w.assetId))
    .filter((a): a is NonNullable<typeof a> => !!a);

  const recentActivity = tech.openWorkOrders
    .flatMap((w) => (w.comments ?? []).map((c) => ({ ...c, workOrderId: w.id })))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 6);

  return (
    <Drawer
      icon="👷"
      title={tech.name}
      subtitle={tech.title}
      onClose={onClose}
      footer={
        <Link to={`/scheduling`} className="text-sm font-medium text-primary-600 hover:text-primary-700">
          Open in Scheduling & Dispatch →
        </Link>
      }
    >
      <div className="flex items-center gap-3">
        <Avatar initials={tech.initials} className="w-12 h-12 text-base" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone={TECH_STATUS_TONE[tech.status]}>
              <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[tech.status])} />
              {tech.status}
            </Badge>
          </div>
          <div className="text-xs text-slate-500 mt-1">{tech.shift}</div>
        </div>
      </div>

      <DrawerSection title="Skills">
        <div className="flex flex-wrap gap-1.5">
          {tech.skills.map((s) => (
            <Badge key={s} tone="slate">{s}</Badge>
          ))}
        </div>
      </DrawerSection>

      <DrawerSection title="Current Assignment">
        {tech.currentWorkOrder ? (
          <div className="rounded-lg border border-slate-200 p-3">
            <Link to={`/maintenance/${tech.currentWorkOrder.id}`} className="text-sm font-medium text-slate-800 hover:text-primary-600">
              {tech.currentWorkOrder.title}
            </Link>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">{tech.currentWorkOrder.id}</span>
              <Badge tone={PRIORITY_TONE[tech.currentWorkOrder.priority] ?? 'slate'}>{tech.currentWorkOrder.priority}</Badge>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No active assignment.</p>
        )}
      </DrawerSection>

      <DrawerSection title="Location / Facility">
        <DrawerRow label="Currently at" value={tech.currentFacility} />
        <DrawerRow label="Home facility" value={tech.homeFacility} />
        <DrawerRow label="Phone" value={tech.phone} />
      </DrawerSection>

      <DrawerSection title={`Assigned Assets (${assignedAssets.length})`}>
        {assignedAssets.length === 0 ? (
          <p className="text-sm text-slate-400">None right now.</p>
        ) : (
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
        {tech.openWorkOrders.length === 0 ? (
          <p className="text-sm text-slate-400">Queue is clear.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {tech.openWorkOrders.map((w) => (
              <li key={w.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <Link to={`/maintenance/${w.id}`} className="text-slate-700 hover:text-primary-600 truncate">{w.title}</Link>
                <span className="text-xs text-slate-400 shrink-0 ml-2">{w.status}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 text-xs text-slate-400">{tech.workloadHours}h estimated · {tech.dueToday} due today</div>
      </DrawerSection>

      <DrawerSection title="Recent Activity">
        {recentActivity.length === 0 ? (
          <p className="text-sm text-slate-400">No activity logged yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {recentActivity.map((c, i) => (
              <li key={i} className="text-sm">
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="font-mono">{c.workOrderId}</span>
                  <span>{relTime(c.at)}</span>
                </div>
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
  const [statusFilter, setStatusFilter] = useState<'All' | TechnicianStatus>('All');
  const [facilityFilter, setFacilityFilter] = useState('All');
  const [skillFilter, setSkillFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [selected, setSelected] = useState<LiveTechnician | null>(null);
  const [scanning, setScanning] = useState(false);

  const technicians = useMemo(() => techniciansWithLiveState(), []);

  const facilities = useMemo(
    () => [...new Set(ROSTER.map((t) => t.homeFacility))].sort((a, b) => a.localeCompare(b)),
    [],
  );

  const filtered = technicians
    .filter((t) => statusFilter === 'All' || t.status === statusFilter)
    .filter((t) => facilityFilter === 'All' || t.currentFacility === facilityFilter || t.homeFacility === facilityFilter)
    .filter((t) => skillFilter === 'All' || t.skills.includes(skillFilter as (typeof SKILLS)[number]))
    .filter((t) => priorityFilter === 'All' || t.currentWorkOrder?.priority === priorityFilter)
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name));

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const available = technicians.filter((t) => t.status === 'Available').length;
  const assigned = technicians.filter((t) => t.openWorkOrders.length > 0).length;
  const activeJobs = allWorkOrders.filter((w) => w.status === 'In Progress').length;
  const overdueJobs = allWorkOrders.filter((w) => w.status !== 'Completed' && isOverdue(w.dueDate)).length;
  const assetsUnderCustody = allAssets.filter((a) => a.custodian && a.custodian !== 'Unassigned').length;

  const awaitingReturn = useMemo(() => {
    const latestByAsset = new Map<string, (typeof allCustody)[number]>();
    for (const rec of allCustody) {
      const prev = latestByAsset.get(rec.assetId);
      if (!prev || Date.parse(rec.at) > Date.parse(prev.at)) latestByAsset.set(rec.assetId, rec);
    }
    return [...latestByAsset.values()].filter((r) => r.action === 'Checked Out').length;
  }, []);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Workforce Overview"
        subtitle="Where the field team stands right now — technicians, active jobs and asset custody in one view."
        breadcrumb={[{ label: 'Mobile Workforce', href: '/workforce' }, { label: 'Workforce Overview' }]}
        actions={<Button variant="outline" onClick={() => setScanning(true)}>🔍 Identify / Scan Asset</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard label="Available" value={available} sub={`of ${technicians.length} technicians`} tone="emerald" accent />
        <KpiCard label="Assigned" value={assigned} sub="Carrying active work" tone="primary" />
        <KpiCard label="Active Jobs" value={activeJobs} sub="In progress now" tone="primary" />
        <KpiCard label="Overdue Jobs" value={overdueJobs} sub={overdueJobs > 0 ? 'Needs attention' : 'None overdue'} tone={overdueJobs > 0 ? 'red' : 'emerald'} />
        <KpiCard label="Assets Under Custody" value={assetsUnderCustody} sub="Held by someone" tone="amber" />
        <KpiCard label="Awaiting Return" value={awaitingReturn} sub="Checked out, not back" tone="amber" />
      </div>

      {/* Filters */}
      <div className="glass-panel rounded-xl p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">Filter</span>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="!w-auto"
          options={[{ value: 'All', label: 'All statuses' }, ...STATUS_ORDER.map((s) => ({ value: s, label: s }))]}
        />
        <Select
          value={facilityFilter}
          onChange={(e) => setFacilityFilter(e.target.value)}
          className="!w-auto"
          options={[{ value: 'All', label: 'All facilities' }, ...facilities.map((f) => ({ value: f, label: f }))]}
        />
        <Select
          value={skillFilter}
          onChange={(e) => setSkillFilter(e.target.value)}
          className="!w-auto"
          options={[{ value: 'All', label: 'All skills' }, ...SKILLS.map((s) => ({ value: s, label: s }))]}
        />
        <Select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="!w-auto"
          options={[{ value: 'All', label: 'All priorities' }, ...['Critical', 'High', 'Medium', 'Low'].map((p) => ({ value: p, label: p }))]}
        />
        <span className="ml-auto text-xs text-slate-400">{filtered.length} of {technicians.length}</span>
      </div>

      <div className="glass-panel rounded-xl flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-heading font-semibold text-slate-900">Technician Status</h2>
        </div>
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
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
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setSelected(t)}>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar initials={t.initials} />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800">{t.name}</div>
                          <div className="text-[11px] text-slate-400 truncate">{t.title}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <Badge tone={TECH_STATUS_TONE[t.status]}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[t.status])} />
                        {t.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-3.5">
                      {t.currentWorkOrder ? (
                        <Link
                          to={`/maintenance/${t.currentWorkOrder.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-700 hover:text-primary-600 transition-colors"
                        >
                          <span className="font-mono text-[11px] text-slate-400 mr-1.5">{t.currentWorkOrder.id}</span>
                          {t.currentWorkOrder.title}
                        </Link>
                      ) : (
                        <span className="text-slate-400 text-xs">No active job</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-slate-600 text-xs">{t.currentFacility}</td>
                    <td className="px-6 py-3.5 text-slate-600 text-xs">
                      {t.currentWorkOrder ? allAssets.find((a) => a.id === t.currentWorkOrder!.assetId)?.name ?? '—' : '—'}
                    </td>
                    <td className="px-6 py-3.5">
                      {t.currentWorkOrder ? <Badge tone={PRIORITY_TONE[t.currentWorkOrder.priority] ?? 'slate'}>{t.currentWorkOrder.priority}</Badge> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-3.5 text-right text-slate-400 text-xs">
                      {t.currentWorkOrder ? relTime(t.currentWorkOrder.updatedAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected && <TechnicianDrawer tech={selected} onClose={() => setSelected(null)} />}
      {scanning && <ScanAssetDialog onClose={() => setScanning(false)} />}
    </div>
  );
}
