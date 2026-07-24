import { mockCycleCounts } from '@/lib/mock-data';
import type { CycleCountStatus } from '@/types/asset';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { relTime } from '@/lib/utils';

const statusTone = (s: CycleCountStatus): 'emerald' | 'amber' | 'red' | 'slate' =>
  s === 'Reconciled' ? 'emerald' : s === 'In Progress' ? 'amber' : s === 'Variance' ? 'red' : 'slate';

export default function CycleCountsPage() {
  const { toast } = useToast();
  const counts = mockCycleCounts;

  const has = (s: CycleCountStatus) => counts.filter((c) => c.status === s).length;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Cycle Counts"
        subtitle="Rolling physical inventory counts and reconciliation across locations."
        breadcrumb={[{ label: 'Compliance' }, { label: 'Cycle Counts' }]}
        actions={
          <Button onClick={() => toast({ title: 'New cycle count', description: 'Count scheduler opened (demo).', tone: 'info' })}>
            + New Cycle Count
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Scheduled" value={has('Scheduled')} tone="slate" sub="Not yet started" />
        <KpiCard label="In Progress" value={has('In Progress')} tone="amber" sub="Being counted" />
        <KpiCard label="Reconciled" value={has('Reconciled')} tone="emerald" sub="Closed & matched" />
        <KpiCard label="Variance" value={has('Variance')} tone="red" sub="Discrepancy found" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {counts.map((c) => {
          const pct = c.expected > 0 ? Math.round((c.counted / c.expected) * 100) : 0;
          const variance = c.counted - c.expected;
          const barColor = c.status === 'Variance' ? 'bg-red-500' : c.status === 'Reconciled' ? 'bg-emerald-500' : 'bg-primary-500';
          return (
            <div key={c.id} className="glass-panel rounded-xl p-5 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-heading font-semibold text-slate-900 truncate">{c.location}</h3>
                  <div className="text-[11px] font-mono text-slate-400">{c.id}</div>
                </div>
                <Badge tone={statusTone(c.status)}>{c.status}</Badge>
              </div>

              <div className="mt-4">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-slate-500">Counted</span>
                  <span className="tabular-nums font-medium text-slate-800">
                    {c.counted.toLocaleString()} / {c.expected.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-slate-400">{pct}% counted</span>
                  <span className={variance === 0 ? 'text-slate-400' : variance < 0 ? 'text-red-600 font-medium' : 'text-amber-600 font-medium'}>
                    {variance === 0 ? 'No variance' : `${variance > 0 ? '+' : ''}${variance} vs expected`}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>{c.assignedTo}</span>
                <span>{relTime(c.date)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
