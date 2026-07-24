import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, KpiCard, Badge, Avatar } from '@/components/ui/primitives';
import { mockWorkOrders, getAssetById } from '@/lib/mock-data';
import { relTime } from '@/lib/utils';
import type { WorkOrder } from '@/types/asset';

// ─────────────────────────────────────────────────────────────────────────────
// Field operations live view — technicians/operators, their current job, and
// live location, derived deterministically from the work-order pipeline.
// ─────────────────────────────────────────────────────────────────────────────

type FieldStatus = 'On Job' | 'En Route' | 'Idle';

interface FieldTech {
  name: string;
  initials: string;
  status: FieldStatus;
  job?: WorkOrder;
  location: string;
}

function initialsOf(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '—';
}

const STATUS_TONE: Record<FieldStatus, 'primary' | 'amber' | 'slate'> = {
  'On Job': 'primary',
  'En Route': 'amber',
  Idle: 'slate',
};

const STATUS_DOT: Record<FieldStatus, string> = {
  'On Job': 'bg-primary-500',
  'En Route': 'bg-amber-500',
  Idle: 'bg-slate-400',
};

export default function FieldOpsPage() {
  const techs = useMemo<FieldTech[]>(() => {
    // Group active work by assignee (skip Unassigned + system/team accounts).
    const byTech = new Map<string, WorkOrder[]>();
    for (const wo of mockWorkOrders) {
      if (wo.assignedTo === 'Unassigned' || /team|platform/i.test(wo.assignedTo)) continue;
      const list = byTech.get(wo.assignedTo) ?? [];
      list.push(wo);
      byTech.set(wo.assignedTo, list);
    }

    return [...byTech.entries()]
      .map(([name, orders]) => {
        const inProgress = orders.find((o) => o.status === 'In Progress');
        const assigned = orders.find((o) => o.status === 'Assigned');
        const job = inProgress ?? assigned;
        const status: FieldStatus = inProgress ? 'On Job' : assigned ? 'En Route' : 'Idle';
        const asset = job ? getAssetById(job.assetId) : undefined;
        const location = asset ? `${asset.location.name}${asset.location.zone ? ` · ${asset.location.zone}` : ''}` : 'Depot';
        return { name, initials: initialsOf(name), status, job, location };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const inField = techs.filter((t) => t.status !== 'Idle').length;
  const activeJobs = mockWorkOrders.filter((w) => w.status === 'In Progress').length;
  const assetsInMotion = new Set(
    mockWorkOrders.filter((w) => w.status === 'In Progress' || w.status === 'Assigned').map((w) => w.assetId),
  ).size;

  const board: { status: FieldStatus; count: number }[] = (['On Job', 'En Route', 'Idle'] as FieldStatus[]).map(
    (s) => ({ status: s, count: techs.filter((t) => t.status === s).length }),
  );

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Field Operations"
        subtitle="Live view of technicians in the field, their current job and location."
        breadcrumb={[{ label: 'Operations', href: '/operations/transfers' }, { label: 'Field Operations' }]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Technicians in Field" value={inField} sub={`${techs.length} on roster`} accent />
        <KpiCard label="Active Jobs" value={activeJobs} sub="In progress now" tone="primary" />
        <KpiCard label="Assets in Motion" value={assetsInMotion} sub="Under active work" tone="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Roster table */}
        <div className="lg:col-span-3 glass-panel rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-heading font-semibold text-slate-900">Field Roster</h2>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-6 py-3.5">Operator</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Current Job</th>
                  <th className="px-6 py-3.5">Location</th>
                  <th className="px-6 py-3.5 text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {techs.map((t) => (
                  <tr key={t.name} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar initials={t.initials} />
                        <span className="font-medium text-slate-800">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <Badge tone={STATUS_TONE[t.status]}>
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[t.status]}`} />
                        {t.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-3.5">
                      {t.job ? (
                        <Link to={`/maintenance/${t.job.id}`} className="text-slate-700 hover:text-primary-600 transition-colors">
                          <span className="font-mono text-[11px] text-slate-400 mr-1.5">{t.job.id}</span>
                          {t.job.title}
                        </Link>
                      ) : (
                        <span className="text-slate-400 text-xs">No active job</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-slate-600 text-xs">{t.location}</td>
                    <td className="px-6 py-3.5 text-right text-slate-400 text-xs">
                      {t.job ? relTime(t.job.createdAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Status board */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-base font-heading font-semibold text-slate-900 mb-4">Status Board</h2>
          <div className="space-y-3">
            {board.map((b) => (
              <div key={b.status} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[b.status]}`} />
                  <span className="text-sm font-medium text-slate-700">{b.status}</span>
                </div>
                <span className="text-2xl font-bold font-heading text-slate-900">{b.count}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Live status inferred from the maintenance work-order pipeline.
          </p>
        </div>
      </div>
    </div>
  );
}
