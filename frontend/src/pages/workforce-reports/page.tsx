import { useMemo, useState } from 'react';
import { PageHeader, KpiCard, FilterBar, Badge } from '@/components/ui/primitives';
import { Select } from '@/components/ui/FormDialog';
import { Donut } from '@/components/charts/Donut';
import { Gauge } from '@/components/charts/Gauge';
import { useScope } from '@/components/providers/ScopeProvider';
import { organizationScopes, organizationOf } from '@/lib/rbac';
import { allWorkOrders, allTransfers, getAssetById } from '@/lib/dataset';
import { slaStatus } from '@/lib/field-ops';
import { techniciansWithLiveState, facilitiesUnder, regionOf, rosterNames, type LiveTechnician } from '@/lib/technicians';
import { WORK_ORDER_STATUSES, WORK_ORDER_TYPES } from '@access-genie/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Workforce Reports — the numbers a supervisor pulls at the end of a period,
// not another live dashboard. Same filters (org/facility via the shared scope
// switcher, plus period/technician/type/status), same underlying data as the
// rest of Mobile Workforce — nothing here is computed a second, different way.
// ─────────────────────────────────────────────────────────────────────────────

const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last quarter' },
  { value: '365', label: 'Last year' },
] as const;

const STATUS_COLOR: Record<string, string> = {
  New: '#94a3b8', Assigned: '#6366f1', 'In Progress': '#f59e0b', 'On Hold': '#64748b', Completed: '#10b981', Cancelled: '#cbd5e1',
};

const TH = 'px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500';
const TD = 'px-4 py-2.5 text-sm';

export default function WorkforceReportsPage() {
  const { scope, tree } = useScope();
  const organizations = organizationScopes();
  const currentOrg = organizationOf(scope.id) ?? tree;

  const [periodDays, setPeriodDays] = useState('30');
  const [technician, setTechnician] = useState('All');
  const [workType, setWorkType] = useState('All');
  const [status, setStatus] = useState('All');

  const cutoff = Date.now() - Number(periodDays) * 86_400_000;
  const inScopeFacilities = facilitiesUnder(scope);

  const workOrders = allWorkOrders
    .filter((w) => Date.parse(w.createdAt) >= cutoff)
    .filter((w) => technician === 'All' || w.assignedTo === technician)
    .filter((w) => workType === 'All' || w.type === workType)
    .filter((w) => status === 'All' || w.status === status)
    .filter((w) => !inScopeFacilities || inScopeFacilities.has(getAssetById(w.assetId)?.location?.name ?? ''));

  const transfers = allTransfers.filter((t) => Date.parse(t.requestedAt) >= cutoff);

  const allLiveTechnicians = techniciansWithLiveState();
  const technicians = inScopeFacilities ? allLiveTechnicians.filter((t) => inScopeFacilities.has(t.homeFacility)) : allLiveTechnicians;

  // ── 1. Work Orders by Status ────────────────────────────────────────────
  const byStatus = WORK_ORDER_STATUSES.map((s) => ({ label: s, value: workOrders.filter((w) => w.status === s).length, color: STATUS_COLOR[s] ?? '#94a3b8' })).filter((s) => s.value > 0);

  // ── 2. Work Orders by Facility ──────────────────────────────────────────
  const byFacility = useMemo(() => {
    const map = new Map<string, { total: number; completed: number; overdue: number }>();
    for (const w of workOrders) {
      const facility = getAssetById(w.assetId)?.location?.name ?? 'Unknown';
      const row = map.get(facility) ?? { total: 0, completed: 0, overdue: 0 };
      row.total += 1;
      if (w.status === 'Completed') row.completed += 1;
      if (slaStatus(w.dueDate, w.status) === 'Overdue') row.overdue += 1;
      map.set(facility, row);
    }
    return [...map.entries()].map(([facility, r]) => ({ facility, ...r })).sort((a, b) => b.total - a.total);
  }, [workOrders]);

  // ── 3 & 8. Technician utilization + workload ────────────────────────────
  const utilBuckets = (['Highly Utilized', 'Normal', 'Under Utilized', 'Unavailable'] as const).map((bucket) => ({
    bucket,
    count: technicians.filter((t) => (t.status === 'Unavailable' ? bucket === 'Unavailable' : bucket === (t.utilizationPct >= 75 ? 'Highly Utilized' : t.utilizationPct >= 25 ? 'Normal' : 'Under Utilized'))).length,
  }));

  // ── 4. Completed vs overdue ─────────────────────────────────────────────
  const completedCount = workOrders.filter((w) => w.status === 'Completed').length;
  const overdueCount = workOrders.filter((w) => slaStatus(w.dueDate, w.status) === 'Overdue').length;

  // ── 5. SLA performance ───────────────────────────────────────────────────
  const slaEligible = workOrders.filter((w) => w.status === 'Completed' || slaStatus(w.dueDate, w.status) !== 'On Track');
  const slaMet = slaEligible.filter((w) => slaStatus(w.dueDate, w.status) !== 'Overdue').length;
  const slaPct = slaEligible.length === 0 ? null : Math.round((slaMet / slaEligible.length) * 100);

  // ── 6. Average completion time ──────────────────────────────────────────
  const completedWithTimes = workOrders.filter((w) => w.status === 'Completed' && w.completedAt);
  const avgCompletionHours = completedWithTimes.length === 0 ? null : Math.round(
    completedWithTimes.reduce((sum, w) => sum + (Date.parse(w.completedAt!) - Date.parse(w.createdAt)) / 3_600_000, 0) / completedWithTimes.length,
  );

  // ── 7. Asset movements ───────────────────────────────────────────────────
  const movementsByStatus = (['Pending', 'Approved', 'Picked Up', 'In Transit', 'Received', 'Completed', 'Rejected', 'Cancelled'] as const)
    .map((s) => ({ status: s, count: transfers.filter((t) => t.status === s).length }))
    .filter((s) => s.count > 0);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Workforce Reports"
        subtitle="Work order, technician and asset-movement performance over a period."
        breadcrumb={[{ label: 'Mobile Workforce', href: '/workforce' }, { label: 'Workforce Reports' }]}
      />

      {/* A report reads like a document, not a live ops board — one accent
          cue on the headline figure, plain slate everywhere else, and no
          icon decoration. See the same restraint in reports/page.tsx and
          compliance-reports/page.tsx. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Work Orders" value={workOrders.length} sub={`Over ${periodDays} days`} accent />
        <KpiCard label="Completed" value={completedCount} tone="slate" />
        <KpiCard label="Overdue" value={overdueCount} tone={overdueCount > 0 ? 'red' : 'slate'} />
        <KpiCard label="Avg. Completion" value={avgCompletionHours === null ? '—' : avgCompletionHours < 48 ? `${avgCompletionHours}h` : `${Math.round(avgCompletionHours / 24)}d`} sub="Created → completed" tone="slate" />
      </div>

      <FilterBar>
        <ReportField label="Period"><Select value={periodDays} onChange={(e) => setPeriodDays(e.target.value)} options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} /></ReportField>
        {organizations.length > 1 && (
          <ReportField label="Organization"><span className="block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{currentOrg.name}</span></ReportField>
        )}
        <ReportField label="Region / Facility"><span className="block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600" title="Change from the organization switcher in the top bar">{scope.name}</span></ReportField>
        <ReportField label="Technician"><Select value={technician} onChange={(e) => setTechnician(e.target.value)} options={[{ value: 'All', label: 'All technicians' }, ...rosterNames().map((n) => ({ value: n, label: n }))]} /></ReportField>
        <ReportField label="Work Type"><Select value={workType} onChange={(e) => setWorkType(e.target.value)} options={[{ value: 'All', label: 'All types' }, ...WORK_ORDER_TYPES.map((t) => ({ value: t, label: t }))]} /></ReportField>
        <ReportField label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'All', label: 'All statuses' }, ...WORK_ORDER_STATUSES.map((s) => ({ value: s, label: s }))]} /></ReportField>
      </FilterBar>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* 1. Work Orders by Status */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-base font-heading font-semibold text-slate-900 mb-3">Work Orders by Status</h2>
          <Donut slices={byStatus} totalLabel="Work Orders" />
        </div>

        {/* 5. SLA performance */}
        <div className="glass-panel rounded-xl p-5 flex flex-col items-center">
          <h2 className="text-base font-heading font-semibold text-slate-900 mb-1 self-start">SLA Performance</h2>
          <Gauge value={slaPct} label="met SLA" />
        </div>

        {/* 3. Technician utilization */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-base font-heading font-semibold text-slate-900 mb-3">Technician Utilization</h2>
          <div className="space-y-2">
            {utilBuckets.map(({ bucket, count }) => (
              <div key={bucket} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span className="text-slate-600">{bucket}</span>
                <span className="font-heading font-bold text-slate-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 2. Work Orders by Facility */}
        <div className="glass-panel rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200"><h2 className="text-sm font-heading font-semibold text-slate-900">Work Orders by Facility</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100 bg-slate-50/60"><th className={TH}>Facility</th><th className={`${TH} text-right`}>Total</th><th className={`${TH} text-right`}>Completed</th><th className={`${TH} text-right`}>Overdue</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {byFacility.map((r) => (
                  <tr key={r.facility}><td className={TD}>{r.facility}</td><td className={`${TD} text-right tabular-nums`}>{r.total}</td><td className={`${TD} text-right tabular-nums text-emerald-600`}>{r.completed}</td><td className={`${TD} text-right tabular-nums ${r.overdue > 0 ? 'text-health-critical font-semibold' : 'text-slate-400'}`}>{r.overdue}</td></tr>
                ))}
                {byFacility.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">No work orders in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* 7. Asset movements */}
        <div className="glass-panel rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200"><h2 className="text-sm font-heading font-semibold text-slate-900">Asset Movements</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100 bg-slate-50/60"><th className={TH}>Status</th><th className={`${TH} text-right`}>Count</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {movementsByStatus.map((r) => (
                  <tr key={r.status}><td className={TD}><Badge tone="slate">{r.status}</Badge></td><td className={`${TD} text-right tabular-nums font-medium`}>{r.count}</td></tr>
                ))}
                {movementsByStatus.length === 0 && <tr><td colSpan={2} className="px-4 py-8 text-center text-sm text-slate-400">No transfers in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 8. Technician workload */}
      <div className="glass-panel rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="px-5 py-3.5 border-b border-slate-200"><h2 className="text-sm font-heading font-semibold text-slate-900">Technician Workload</h2></div>
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-100"><th className={TH}>Technician</th><th className={TH}>Facility</th><th className={TH}>Region</th><th className={`${TH} text-right`}>Open Jobs</th><th className={`${TH} text-right`}>Hours</th><th className={`${TH} text-right`}>Utilization</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {technicians.map((t: LiveTechnician) => (
                <tr key={t.id}>
                  <td className={TD}>{t.name}</td>
                  <td className={`${TD} text-slate-500`}>{t.homeFacility}</td>
                  <td className={`${TD} text-slate-500`}>{regionOf(t.homeFacility)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{t.openWorkOrders.length}</td>
                  <td className={`${TD} text-right tabular-nums`}>{t.workloadHours}h</td>
                  <td className={`${TD} text-right tabular-nums font-semibold ${t.utilizationPct > 100 ? 'text-health-critical' : t.utilizationPct >= 75 ? 'text-amber-600' : 'text-slate-700'}`}>{t.utilizationPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ReportField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}
