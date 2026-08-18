import { useState } from 'react';
import { Link } from 'react-router-dom';
import { allWorkOrders, getAssetById } from '@/lib/dataset';
import { maintenanceApi } from '@/api/work-orders';
import { useMutate } from '@/api/mutate';
import { PageHeader, MetricCard, FilterBar, Avatar, Badge, EmptyState } from '@/components/ui/primitives';
import { Select, TextInput } from '@/components/ui/FormDialog';
import { Button } from '@/components/ui/Button';
import { cn, relTime } from '@/lib/utils';
import {
  techniciansWithLiveState, TECH_STATUS_TONE, SKILLS, technicianRoster, skillMatchPct,
  type LiveTechnician, type TechnicianStatus,
} from '@/lib/technicians';
import type { WorkOrder, WorkOrderPriority } from '@access-genie/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Scheduling & Dispatch — "which technician should do this work?" Select an
// unassigned work order and the roster re-ranks itself by fit: skill match,
// then availability, then how loaded they already are. Assigning writes
// `assignedTo`, the same field My Work and the Workforce Dashboard already
// read, so the change shows up everywhere the moment the dataset refreshes.
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

const isOpen = (w: WorkOrder) => w.status !== 'Completed' && w.status !== 'Cancelled';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export default function SchedulingPage() {
  const { run } = useMutate();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(() => allWorkOrders.map((w) => ({ ...w })));
  const [selectedWoId, setSelectedWoId] = useState<string | null>(null);

  const [skillFilter, setSkillFilter] = useState('All');
  const [facilityFilter, setFacilityFilter] = useState('All');
  const [availabilityFilter, setAvailabilityFilter] = useState<'All' | TechnicianStatus>('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [shiftFilter, setShiftFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [workloadFilter, setWorkloadFilter] = useState<'All' | 'Under 50%' | '50–100%' | 'Over 100%'>('All');
  const [search, setSearch] = useState('');

  // The roster and derived lists below are cheap over a few dozen technicians,
  // so they are recomputed on every render rather than memoized against a
  // dependency array — `allTechnicians` is a module binding a hydrate can
  // replace wholesale, and there is nothing to gain from caching it.
  const roster = technicianRoster();
  const facilities = [...new Set(roster.map((t) => t.homeFacility))].sort((a, b) => a.localeCompare(b));
  const departments = [...new Set(roster.map((t) => t.department))].sort((a, b) => a.localeCompare(b));
  const technicians = techniciansWithLiveState(workOrders);

  async function assign(woId: string, tech: string) {
    const previous = workOrders;
    const status = workOrders.find((w) => w.id === woId)?.status;
    const nextStatus = status === 'New' ? 'Assigned' : status;

    setWorkOrders((prev) => prev.map((w) => (w.id === woId ? { ...w, assignedTo: tech, status: nextStatus ?? w.status } : w)));
    setSelectedWoId(null);

    // The assign action, not a PATCH: it checks the name against the roster and
    // advances New → Assigned itself, so the optimistic `nextStatus` above is a
    // prediction of what the server does rather than an instruction to it.
    await run(maintenanceApi.assign(woId, tech), {
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

  const selectedWo = selectedWoId ? unassigned.find((w) => w.id === selectedWoId) ?? null : null;

  const workloadMatches = (pct: number) => {
    if (workloadFilter === 'All') return true;
    if (workloadFilter === 'Under 50%') return pct < 50;
    if (workloadFilter === '50–100%') return pct >= 50 && pct <= 100;
    return pct > 100;
  };

  const filteredTechs = technicians
    .filter((t) => skillFilter === 'All' || t.skills.includes(skillFilter as (typeof SKILLS)[number]))
    .filter((t) => facilityFilter === 'All' || t.homeFacility === facilityFilter || t.currentFacility === facilityFilter)
    .filter((t) => availabilityFilter === 'All' || t.status === availabilityFilter)
    .filter((t) => shiftFilter === 'All' || t.shift.label === shiftFilter)
    .filter((t) => departmentFilter === 'All' || t.department === departmentFilter)
    .filter((t) => workloadMatches(t.utilizationPct))
    .filter((t) => !search.trim() || t.name.toLowerCase().includes(search.trim().toLowerCase()));

  // Ranked for the selected work order: skill match, then available-first, then lightest load.
  const ranked = [...filteredTechs].sort((a, b) => {
    const matchA = skillMatchPct(a, selectedWo?.requiredSkill);
    const matchB = skillMatchPct(b, selectedWo?.requiredSkill);
    if (matchA !== matchB) return matchB - matchA;
    const availA = a.status === 'Available' ? 0 : 1;
    const availB = b.status === 'Available' ? 0 : 1;
    if (availA !== availB) return availA - availB;
    return a.utilizationPct - b.utilizationPct;
  });

  const activeTechnicians = technicians.filter((t) => t.status !== 'Unavailable' && t.status !== 'Off Shift').length;
  const avgLoad = technicians.length === 0 ? 0 : Math.round(technicians.reduce((s, t) => s + t.utilizationPct, 0) / technicians.length);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Scheduling & Dispatch"
        subtitle="Select an unassigned work order to see technicians ranked by skill match, availability and workload."
        breadcrumb={[{ label: 'Mobile Workforce', href: '/workforce' }, { label: 'Scheduling & Dispatch' }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Active Technicians" value={activeTechnicians} sub={`${technicians.length} on roster`} tone="primary" />
        <MetricCard label="Open Work Orders" value={openWos.length} sub={`${workOrders.length} total`} />
        <MetricCard label="Unassigned" value={unassigned.length} sub={unassigned.length > 0 ? 'Awaiting dispatch' : 'All dispatched'} tone={unassigned.length > 0 ? 'amber' : 'emerald'} />
        <MetricCard label="Average Workload" value={`${avgLoad}%`} sub="Across roster" tone={avgLoad >= 100 ? 'red' : avgLoad >= 75 ? 'amber' : 'emerald'} />
      </div>

      <FilterBar min={150}>
        <Field label="Search Technician"><TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name…" /></Field>
        <Field label="Skill"><Select value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)} options={[{ value: 'All', label: 'All skills' }, ...SKILLS.map((s) => ({ value: s, label: s }))]} /></Field>
        <Field label="Facility"><Select value={facilityFilter} onChange={(e) => setFacilityFilter(e.target.value)} options={[{ value: 'All', label: 'All facilities' }, ...facilities.map((f) => ({ value: f, label: f }))]} /></Field>
        <Field label="Department"><Select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} options={[{ value: 'All', label: 'All departments' }, ...departments.map((d) => ({ value: d, label: d }))]} /></Field>
        <Field label="Availability">
          <Select
            value={availabilityFilter}
            onChange={(e) => setAvailabilityFilter(e.target.value as typeof availabilityFilter)}
            options={[{ value: 'All', label: 'Any availability' }, ...(['Available', 'Assigned', 'On Job', 'En Route', 'Off Shift', 'Unavailable'] as TechnicianStatus[]).map((s) => ({ value: s, label: s }))]}
          />
        </Field>
        <Field label="Shift"><Select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)} options={[{ value: 'All', label: 'Any shift' }, { value: 'Morning', label: 'Morning' }, { value: 'Evening', label: 'Evening' }, { value: 'Night', label: 'Night' }]} /></Field>
        <Field label="Workload"><Select value={workloadFilter} onChange={(e) => setWorkloadFilter(e.target.value as typeof workloadFilter)} options={[{ value: 'All', label: 'Any workload' }, { value: 'Under 50%', label: 'Under 50%' }, { value: '50–100%', label: '50–100%' }, { value: 'Over 100%', label: 'Over 100% (overloaded)' }]} /></Field>
        <Field label="Priority"><Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} options={[{ value: 'All', label: 'All priorities' }, ...['Critical', 'High', 'Medium', 'Low'].map((p) => ({ value: p, label: p }))]} /></Field>
      </FilterBar>

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
                const active = w.id === selectedWoId;
                return (
                  <button
                    key={w.id}
                    onClick={() => setSelectedWoId(active ? null : w.id)}
                    className={cn(
                      'w-full text-left rounded-lg bg-white border p-3.5 shadow-sm transition-colors',
                      active ? 'border-primary-400 ring-1 ring-primary-200 bg-primary-50/30' : 'border-slate-200 hover:border-primary-300',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full shrink-0', PRIORITY_DOT[w.priority])} />
                      <span className="font-mono text-[11px] text-slate-500">{w.id}</span>
                      <Badge tone={w.priority === 'Critical' ? 'red' : w.priority === 'High' ? 'amber' : 'slate'}>{w.priority}</Badge>
                      {w.requiredSkill && <span className="text-[10px] text-slate-400">· needs {w.requiredSkill}</span>}
                      <span className="ml-auto text-[11px] text-slate-400">{w.estimatedHours}h</span>
                    </div>
                    <h4 className="mt-1.5 text-sm font-medium text-slate-800 leading-snug">{w.title}</h4>
                    <p className="mt-1 text-xs text-slate-500">{w.assetName} · {asset?.location?.name ?? 'Unassigned location'}</p>
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">due {relTime(w.dueDate)}</span>
                      <span className="text-xs font-semibold text-primary-600">{active ? 'Hide technicians ▲' : 'Find technicians ▼'}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT — suitable technicians for the selected work order, or the full roster */}
        <div className="glass-panel rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-heading font-semibold text-slate-900">
              {selectedWo ? 'Suitable Technicians' : 'Technician Roster'}
            </h2>
            {selectedWo && <p className="text-xs text-slate-500 mt-0.5 truncate">for {selectedWo.title} {selectedWo.requiredSkill && `· ${selectedWo.requiredSkill}`}</p>}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {ranked.length === 0 ? (
              <EmptyState variant="no-results" title="No technicians match" description="Try clearing a filter." />
            ) : (
              ranked.map((tech: LiveTechnician) => {
                const tone = loadTone(tech.utilizationPct);
                const match = selectedWo ? skillMatchPct(tech, selectedWo.requiredSkill) : null;
                return (
                  <div key={tech.id} className="rounded-lg border border-slate-200 bg-white p-3.5">
                    <div className="flex items-start gap-2.5">
                      <Avatar initials={tech.initials} className="w-9 h-9 text-xs shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-800 truncate">{tech.name}</span>
                          <Badge tone={TECH_STATUS_TONE[tech.status]}>{tech.status}</Badge>
                        </div>
                        <div className="text-[11px] text-slate-400">{tech.homeFacility} · {tech.shift.label} shift</div>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {tech.skills.map((s) => (
                        <span key={s} className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', selectedWo?.requiredSkill === s ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600')}>{s}</span>
                      ))}
                    </div>

                    {match !== null && (
                      <div className="mt-2.5 flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-600">Skill match</span>
                        <span className={cn('font-bold', match >= 90 ? 'text-emerald-600' : match >= 50 ? 'text-amber-600' : 'text-slate-400')}>{match}%</span>
                      </div>
                    )}

                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className={cn('font-semibold', tone.text)}>{tone.label}</span>
                        <span className="font-semibold text-slate-600">{tech.workloadHours}/{DAY_CAPACITY}h · {tech.openWorkOrders.length} jobs</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', tone.bar)} style={{ width: `${Math.min(100, tech.utilizationPct)}%` }} />
                      </div>
                    </div>

                    {selectedWo && (
                      <Button size="sm" className="w-full mt-3" onClick={() => void assign(selectedWo.id, tech.name)}>
                        Assign to {tech.name.split(' ')[0]}
                      </Button>
                    )}
                    {!selectedWo && tech.currentWorkOrder && (
                      <Link to={`/maintenance/${tech.currentWorkOrder.id}`} className="mt-3 block text-center text-xs font-medium text-primary-600 hover:text-primary-700">
                        View current job →
                      </Link>
                    )}
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
