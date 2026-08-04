import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allPmSchedules } from '@/lib/dataset';
import type { PmSchedule, PmFrequency } from '@access-genie/shared';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PmScheduleDialog } from '@/components/maintenance/PmScheduleDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { useMutate } from '@/api/mutate';
import { pmApi } from '@/api/maintenance';
import { cn, nowMs } from '@/lib/utils';

// ── token helpers ─────────────────────────────────────────────────────────────
type Tone = 'slate' | 'primary' | 'emerald' | 'amber' | 'red';

const DAY = 86_400_000;

const freqTone = (f: PmFrequency): Tone =>
  f === 'Monthly' ? 'primary'
    : f === 'Quarterly' ? 'emerald'
      : f === 'Semi-Annual' ? 'amber'
        : f === 'Annual' ? 'slate'
          : 'red';

const complianceHex = (pct: number): string =>
  pct >= 95 ? '#10b981' : pct >= 80 ? '#f59e0b' : '#ef4444';

// Due-date label — relTime clamps the future to "0s ago", so we compute both directions here.
function dueLabel(iso: string): { text: string; overdue: boolean } {
  const diffDays = Math.round((Date.parse(iso) - nowMs()) / DAY);
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, overdue: true };
  if (diffDays === 0) return { text: 'Due today', overdue: false };
  if (diffDays === 1) return { text: 'Due tomorrow', overdue: false };
  return { text: `in ${diffDays}d`, overdue: false };
}

// ── compliance meter ──────────────────────────────────────────────────────────
function ComplianceBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[7rem]">
      <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: complianceHex(pct) }}
        />
      </div>
      <span className="text-xs font-medium text-slate-600 tabular-nums w-9 text-right">{pct}%</span>
    </div>
  );
}

const FREQUENCIES: PmFrequency[] = ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'Usage-based'];

export default function PmSchedulesPage() {
  const { toast } = useToast();
  const { run, isPending } = useMutate();
  const [freqs, setFreqs] = useState<Set<PmFrequency>>(new Set());
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'edit'; pm: PmSchedule } | null>(null);
  const [deleting, setDeleting] = useState<PmSchedule | null>(null);

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const total = allPmSchedules.length;
  const dueSoon = allPmSchedules.filter((p) => {
    const d = Date.parse(p.nextDue) - nowMs();
    return d >= 0 && d <= 7 * DAY;
  }).length;
  const overdue = allPmSchedules.filter((p) => Date.parse(p.nextDue) < nowMs()).length;
  const avgCompliance = Math.round(
    allPmSchedules.reduce((sum, p) => sum + p.compliancePct, 0) / (total || 1),
  );

  // ── filtered rows ─────────────────────────────────────────────────────────────
  const rows = useMemo(
    () => allPmSchedules.filter((p) => freqs.size === 0 || freqs.has(p.frequency)),
    [freqs],
  );

  const toggleFreq = (f: PmFrequency) =>
    setFreqs((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  /**
   * Raise everything that has fallen due.
   *
   * One button for the whole programme rather than one per row: the automation
   * is idempotent — a schedule with an order already open is advanced without
   * raising a second — so "generate for this one" would either duplicate work
   * or quietly do nothing, and neither reads honestly on a row.
   */
  const runAutomation = async () => {
    const result = await run(pmApi.runAutomation(), { describe: 'run the maintenance automation' });
    if (!result) return;

    const raised = result.pmRaised + result.conditionRaised;
    toast({
      title: raised > 0 ? `${raised} work order${raised === 1 ? '' : 's'} raised` : 'Nothing was due',
      description:
        raised > 0
          ? `${result.pmRaised} from schedules, ${result.conditionRaised} from asset condition · ${result.schedulesAdvanced} schedule${result.schedulesAdvanced === 1 ? '' : 's'} rolled forward.`
          : 'No schedule has fallen due and no asset is below the health floor.',
      tone: raised > 0 ? 'success' : 'info',
    });
  };

  const remove = async () => {
    if (!deleting) return;
    await run(pmApi.remove(deleting.id), {
      success: 'Schedule deleted',
      successDetail: `${deleting.title} — work orders already raised from it are unaffected.`,
      describe: 'delete that schedule',
    });
    setDeleting(null);
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Preventive Maintenance"
        subtitle="Scheduled PM plans across the asset fleet — compliance, cadence and upcoming work."
        breadcrumb={[
          { label: 'Maintenance', href: '/maintenance' },
          { label: 'Preventive (PM)' },
        ]}
        actions={
          <>
            <Button variant="outline" disabled={isPending} onClick={() => void runAutomation()}>
              {isPending ? 'Running…' : 'Raise due work'}
            </Button>
            <Button variant="primary" onClick={() => setDialog({ mode: 'new' })}>
              New PM Schedule
            </Button>
          </>
        }
      />

      {/* ── KPI row ─────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total PM Plans" value={total} sub="Active schedules" accent />
        <KpiCard label="Due Soon" value={dueSoon} sub="Next 7 days" tone="amber" />
        <KpiCard label="Overdue" value={overdue} sub="Past next-due date" tone="red" />
        <KpiCard label="Avg Compliance" value={`${avgCompliance}%`} sub="Fleet PM adherence" tone="emerald" />
      </div>

      {/* ── Frequency filter chips ──────────────────────────────────────────────── */}
      <div className="glass-panel rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 mr-1">Frequency</span>
          {FREQUENCIES.map((f) => {
            const on = freqs.has(f);
            return (
              <button
                key={f}
                onClick={() => toggleFreq(f)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  on
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                )}
              >
                {f}
              </button>
            );
          })}
          {freqs.size > 0 && (
            <button
              onClick={() => setFreqs(new Set())}
              className="text-xs font-medium text-slate-400 hover:text-slate-700 ml-1"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Schedules table ─────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">PM Plan</th>
                <th className="px-4 py-3 font-semibold">Asset</th>
                <th className="px-4 py-3 font-semibold">Frequency</th>
                <th className="px-4 py-3 font-semibold">Next Due</th>
                <th className="px-4 py-3 font-semibold">Compliance</th>
                <th className="px-4 py-3 font-semibold">Assigned Team</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const due = dueLabel(p.nextDue);
                return (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/pm/${p.id}`} className="font-medium text-slate-800 hover:text-primary-600">
                        {p.title}
                      </Link>
                      <div className="text-xs text-slate-400">{p.id} · {p.type} · {p.estHours}h</div>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/assets/${p.assetId}`} className="text-primary-600 hover:underline">
                        {p.assetName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={freqTone(p.frequency)}>{p.frequency}</Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={cn('font-medium', due.overdue ? 'text-health-critical' : 'text-slate-700')}>
                        {due.text}
                      </span>
                    </td>
                    <td className="px-4 py-3"><ComplianceBar pct={p.compliancePct} /></td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.assignedTeam}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setDialog({ mode: 'edit', pm: p })}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(p)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <EmptyState
            variant={allPmSchedules.length === 0 ? 'empty' : 'no-results'}
            icon="🗓️"
            title={allPmSchedules.length === 0 ? 'No preventive schedules yet' : 'No PM plans match'}
            description={
              allPmSchedules.length === 0
                ? 'A schedule is what makes maintenance happen without anyone remembering to ask. Without one, every work order is a reaction to something already broken.'
                : 'Try a different frequency filter.'
            }
            action={
              allPmSchedules.length === 0 ? (
                <Button onClick={() => setDialog({ mode: 'new' })}>New PM Schedule</Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setFreqs(new Set())}>
                  Reset filters
                </Button>
              )
            }
          />
        )}
      </div>

      {dialog?.mode === 'new' && <PmScheduleDialog onClose={() => setDialog(null)} />}
      {dialog?.mode === 'edit' && <PmScheduleDialog existing={dialog.pm} onClose={() => setDialog(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.title}?`}
          description="No further work will be raised for this asset on this cadence. Work orders already raised from it stay in the queue."
          busy={isPending}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
