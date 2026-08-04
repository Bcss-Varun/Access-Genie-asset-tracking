import { useState } from 'react';
import { Link } from 'react-router-dom';
import { allInspections } from '@/lib/dataset';
import type { Inspection, InspectionStatus } from '@access-genie/shared';
import { PageHeader, KpiCard, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { InspectionDialog } from '@/components/maintenance/InspectionDialog';
import { useMutate } from '@/api/mutate';
import { inspectionsApi } from '@/api/maintenance';
import { cn, relTime } from '@/lib/utils';

const STATUSES: InspectionStatus[] = ['Scheduled', 'In Progress', 'Passed', 'Failed'];

const statusTone = (s: InspectionStatus): 'emerald' | 'red' | 'amber' | 'slate' =>
  s === 'Passed' ? 'emerald' : s === 'Failed' ? 'red' : s === 'In Progress' ? 'amber' : 'slate';

export default function InspectionsPage() {
  const { run, isPending } = useMutate();
  const [filter, setFilter] = useState<'All' | InspectionStatus>('All');
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'edit'; inspection: Inspection } | null>(null);
  const [deleting, setDeleting] = useState<Inspection | null>(null);

  // Read the hydrated binding directly rather than snapshotting into state: a
  // copy taken on first render never sees the refetch that follows a write, so
  // a newly scheduled inspection would not appear until reload.
  const inspections = allInspections;

  const remove = async () => {
    if (!deleting) return;
    await run(inspectionsApi.remove(deleting.id), {
      success: 'Inspection removed',
      successDetail: deleting.title,
      describe: 'remove that inspection',
    });
    setDeleting(null);
  };

  const count = (s: InspectionStatus) => inspections.filter((i) => i.status === s).length;
  const filtered = filter === 'All' ? inspections : inspections.filter((i) => i.status === filter);

  const chipCls = (active: boolean) =>
    cn(
      'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
      active
        ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
        : 'bg-transparent text-slate-500 border-slate-200 hover:border-primary-500/50 hover:text-slate-700',
    );

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Inspections"
        subtitle="Scheduled and completed asset inspections across all facilities."
        breadcrumb={[{ label: 'Maintenance', href: '/maintenance' }, { label: 'Inspections' }]}
        actions={<Button onClick={() => setDialog({ mode: 'new' })}>+ New Inspection</Button>}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Scheduled" value={count('Scheduled')} tone="slate" sub="Awaiting start" />
        <KpiCard label="In Progress" value={count('In Progress')} tone="amber" sub="Being filled out" />
        <KpiCard label="Passed" value={count('Passed')} tone="emerald" sub="Compliant" />
        <KpiCard label="Failed" value={count('Failed')} tone="red" sub="Needs follow-up" />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mr-1">Status</span>
        <button onClick={() => setFilter('All')} className={chipCls(filter === 'All')}>
          All
        </button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={chipCls(filter === s)}>
            {s}
          </button>
        ))}
        <span className="ml-auto text-sm text-slate-500 font-medium">
          {filtered.length} of {inspections.length}
        </span>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-xl flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4">Inspection</th>
                <th className="px-6 py-4">Asset</th>
                <th className="px-6 py-4">Template</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Due</th>
                <th className="px-6 py-4">Inspector</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <Link to={`/inspections/${i.id}`} className="font-medium text-slate-900 hover:text-primary-600 transition-colors">
                      {i.title}
                    </Link>
                    <div className="text-[11px] font-mono text-slate-400">{i.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      to={`/assets/${i.assetId}`}
                      className="text-slate-600 hover:text-primary-600 transition-colors"
                    >
                      {i.assetName}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{i.template}</td>
                  <td className="px-6 py-4">
                    <Badge tone={statusTone(i.status)}>{i.status}</Badge>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{relTime(i.dueDate)}</td>
                  <td className="px-6 py-4 text-slate-600">{i.inspector}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link to={`/inspections/${i.id}`} className="px-2 text-xs font-medium text-primary-600 hover:text-primary-700">
                        Open →
                      </Link>
                      <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'edit', inspection: i })}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(i)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState
            variant={inspections.length === 0 ? 'empty' : 'no-results'}
            icon="🔍"
            title={inspections.length === 0 ? 'No inspections scheduled' : 'No inspections match this filter'}
            description={
              inspections.length === 0
                ? 'An inspection is a dated, assignable set of checks against one asset. Scheduling one puts it in somebody\u2019s field queue.'
                : 'Try selecting a different status.'
            }
            action={inspections.length === 0 ? <Button onClick={() => setDialog({ mode: 'new' })}>+ New Inspection</Button> : undefined}
          />
        )}
      </div>

      {dialog?.mode === 'new' && <InspectionDialog onClose={() => setDialog(null)} />}
      {dialog?.mode === 'edit' && <InspectionDialog existing={dialog.inspection} onClose={() => setDialog(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Remove ${deleting.title}?`}
          description="It disappears from the field queue. Any results already recorded against it go with it."
          confirmLabel="Remove"
          busy={isPending}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
