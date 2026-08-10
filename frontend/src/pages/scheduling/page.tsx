import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allWorkOrders, getAssetById } from '@/lib/dataset';
import { maintenanceApi } from '@/api/work-orders';
import { useMutate } from '@/api/mutate';
import { PageHeader, KpiCard, Avatar, Badge, EmptyState } from '@/components/ui/primitives';
import { Select } from '@/components/ui/FormDialog';
import { Dropdown, MenuItem } from '@/components/ui/Dropdown';
import { cn, relTime } from '@/lib/utils';
import { techniciansWithLiveState, TECH_STATUS_TONE, SKILLS, ROSTER, type LiveTechnician, type TechnicianStatus } from '@/lib/technicians';
import type { WorkOrder, WorkOrderPriority } from '@access-genie/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Scheduling & Dispatch — "which technician should do this work?" Unassigned
// work on the left, the roster (skills, availability, current load) on the
// right. Assigning a work order writes `assignedTo`, the same field My Work
// and Workforce Overview already read, so the change shows up everywhere the
// moment the dataset refreshes.
// ─────────────────────────────────────────────────────────────────────────────

const UNASSIGNED = 'Unassigned';
/** Daily technician capacity in hours (one 8-hour shift). */
const DAY_CAPACITY = 8;

const PRIORITY_DOT: Record<WorkOrderPriority, string> = {
  Critical: 'bg-health-critical',
  High: 'bg-amber-500',
  Medium: 'bg-primary-500',
  Low: 'bg-slate-400',
};

function loadTone(pct: number): { bar: string; text: string; label: string } {
  if (pct > 100) return { bar: 'bg-health-critical', text: 'text-health-critical', label: 'Overloaded' };
  if (pct >= 75) return { bar: 'bg-amber-500', text: 'text-amber-600', label: 'Near capacity' };
  return { bar: 'bg-emerald-500', text: 'text-emerald-600', label: 'Healthy' };
}

const isOpen = (w: WorkOrder) => w.status !== 'Completed';

export default function SchedulingPage() {
  const { run } = useMutate();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(() => allWorkOrders.map((w) => ({ ...w })));

  const [skillFilter, setSkillFilter] = useState('All');
  const [facilityFilter, setFacilityFilter] = useState('All');
  const [availabilityFilter, setAvailabilityFilter] = useState<'All' | TechnicianStatus>('All');
  const [priorityFilter, setPriorityFilter] = useState('All');

  const facilities = useMemo(() => [...new Set(ROSTER.map((t) => t.homeFacility))].sort((a, b) => a.localeCompare(b)), []);
  const technicians = useMemo(() => techniciansWithLiveState(workOrders), [workOrders]);

  async function assign(woId: string, tech: string) {
    const previous = workOrders;
    const status = workOrders.find((w) => w.id === woId)?.status;
    const nextStatus = status === 'New' ? 'Assigned' : status;

    setWorkOrders((prev) => prev.map((w) => (w.id === woId ? { ...w, assignedTo: tech, status: nextStatus ?? w.status } : w)));

    await run(maintenanceApi.update(woId, { assignedTo: tech, status: nextStatus }), {
      success: 'Work order assigned',
      successDetail: `${woId} → ${tech}`,
      describe: 'assign that work order',
      rollback: () => setWorkOrders(previous),
    });
  }

  const openWos = workOrders.filter(isOpen);
  const unassigned = openWos
    .filter((w) => w.assignedTo === UNASSIGNED)
    .filter((w) => priorityFilter === 'All' || w.priority === priorityFilter)
    .filter((w) => facilityFilter === 'All' || getAssetById(w.assetId)?.location?.name === facilityFilter)
    .sort((a, b) => Date.parse(a.dueDate) - Date.parse(b.dueDate));

  const filteredTechs = technicians
    .filter((t) => skillFilter === 'All' || t.skills.includes(skillFilter as (typeof SKILLS)[number]))
    .filter((t) => facilityFilter === 'All' || t.homeFacility === facilityFilter || t.currentFacility === facilityFilter)
    .filter((t) => availabilityFilter === 'All' || t.status === availabilityFilter);

  const activeTechnicians = technicians.filter((t) => t.status !== 'Offline').length;
  const avgLoad = technicians.length === 0 ? 0 : Math.round(technicians.reduce((s, t) => s + (t.workloadHours / DAY_CAPACITY) * 100, 0) / technicians.length);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Scheduling & Dispatch"
        subtitle="Assign open work to the right technician, balanced against skill, facility and current load."
        breadcrumb={[{ label: 'Mobile Workforce', href: '/workforce' }, { label: 'Scheduling & Dispatch' }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Active Technicians" value={activeTechnicians} sub={`${technicians.length} on roster`} accent />
        <KpiCard label="Open Work Orders" value={openWos.length} sub={`${workOrders.length} total`} />
        <KpiCard
          label="Unassigned"
          value={unassigned.length}
          sub={unassigned.length > 0 ? 'Awaiting dispatch' : 'All dispatched'}
          tone={unassigned.length > 0 ? 'amber' : 'emerald'}
        />
        <KpiCard label="Average Workload" value={`${avgLoad}%`} sub="Across roster" tone={avgLoad >= 100 ? 'red' : avgLoad >= 75 ? 'amber' : 'emerald'} />
      </div>

      <div className="glass-panel rounded-xl p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">Filter</span>
        <Select value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)} className="!w-auto" options={[{ value: 'All', label: 'All skills' }, ...SKILLS.map((s) => ({ value: s, label: s }))]} />
        <Select value={facilityFilter} onChange={(e) => setFacilityFilter(e.target.value)} className="!w-auto" options={[{ value: 'All', label: 'All facilities' }, ...facilities.map((f) => ({ value: f, label: f }))]} />
        <Select
          value={availabilityFilter}
          onChange={(e) => setAvailabilityFilter(e.target.value as typeof availabilityFilter)}
          className="!w-auto"
          options={[{ value: 'All', label: 'Any availability' }, ...(['Available', 'Assigned', 'En Route', 'On Site', 'On Job', 'Waiting', 'Offline'] as TechnicianStatus[]).map((s) => ({ value: s, label: s }))]}
        />
        <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="!w-auto" options={[{ value: 'All', label: 'All priorities' }, ...['Critical', 'High', 'Medium', 'Low'].map((p) => ({ value: p, label: p }))]} />
      </div>

      {/* Two-panel dispatch layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* LEFT / MAIN — unassigned work orders */}
        <div className="lg:col-span-2 glass-panel rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-heading font-semibold text-slate-900">Unassigned Work Orders</h2>
            <Badge tone={unassigned.length > 0 ? 'amber' : 'emerald'}>{unassigned.length}</Badge>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {unassigned.length === 0 ? (
              <EmptyState icon="✅" title="Everything is dispatched" description="No unassigned work matches these filters." />
            ) : (
              unassigned.map((w) => {
                const asset = getAssetById(w.assetId);
                return (
                  <div key={w.id} className="rounded-lg bg-white border border-slate-200 p-3.5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full shrink-0', PRIORITY_DOT[w.priority])} />
                      <Link to={`/maintenance/${w.id}`} className="font-mono text-[11px] text-slate-500 hover:text-primary-600 transition-colors">{w.id}</Link>
                      <Badge tone={w.priority === 'Critical' ? 'red' : w.priority === 'High' ? 'amber' : 'slate'}>{w.priority}</Badge>
                      <span className="ml-auto text-[11px] text-slate-400">{w.estimatedHours}h</span>
                    </div>
                    <h4 className="mt-1.5 text-sm font-medium text-slate-800 leading-snug">{w.title}</h4>
                    <p className="mt-1 text-xs text-slate-500">{w.assetName} · {asset?.location?.name ?? 'Unassigned location'}</p>
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">due {relTime(w.dueDate)}</span>
                      <Dropdown
                        ariaLabel={`Assign ${w.id}`}
                        trigger={({ toggle }) => (
                          <button onClick={toggle} className="text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors">
                            Assign →
                          </button>
                        )}
                      >
                        {({ close }) => (
                          <>
                            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Assign to</div>
                            {technicians.map((tech) => (
                              <MenuItem
                                key={tech.id}
                                onClick={() => {
                                  void assign(w.id, tech.name);
                                  close();
                                }}
                              >
                                <span className="flex-1">{tech.name}</span>
                                <span className="text-[10px] text-slate-400">{tech.workloadHours}h · {tech.status}</span>
                              </MenuItem>
                            ))}
                          </>
                        )}
                      </Dropdown>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT — technician roster */}
        <div className="glass-panel rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-heading font-semibold text-slate-900">Technician Roster</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {filteredTechs.length === 0 ? (
              <EmptyState variant="no-results" title="No technicians match" description="Try clearing a filter." />
            ) : (
              filteredTechs.map((tech: LiveTechnician) => {
                const pct = Math.round((tech.workloadHours / DAY_CAPACITY) * 100);
                const tone = loadTone(pct);
                return (
                  <div key={tech.id} className="rounded-lg border border-slate-200 bg-white p-3.5">
                    <div className="flex items-start gap-2.5">
                      <Avatar initials={tech.initials} className="w-9 h-9 text-xs shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-800 truncate">{tech.name}</span>
                          <Badge tone={TECH_STATUS_TONE[tech.status]}>{tech.status}</Badge>
                        </div>
                        <div className="text-[11px] text-slate-400">{tech.homeFacility} · {tech.shift.split(' ')[0]}</div>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {tech.skills.map((s) => (
                        <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{s}</span>
                      ))}
                    </div>

                    <div className="mt-2.5">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className={cn('font-semibold', tone.text)}>{tone.label}</span>
                        <span className="font-semibold text-slate-600">{tech.workloadHours}/{DAY_CAPACITY}h · {tech.openWorkOrders.length} jobs</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', tone.bar)} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
