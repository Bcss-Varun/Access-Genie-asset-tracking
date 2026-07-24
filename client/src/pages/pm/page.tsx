import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mockPmSchedules } from '@/lib/mock-data';
import type { PmSchedule, PmFrequency } from '@/types/asset';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, DEMO_NOW } from '@/lib/utils';

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
  const diffDays = Math.round((Date.parse(iso) - DEMO_NOW) / DAY);
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
  const [freqs, setFreqs] = useState<Set<PmFrequency>>(new Set());

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const total = mockPmSchedules.length;
  const dueSoon = mockPmSchedules.filter((p) => {
    const d = Date.parse(p.nextDue) - DEMO_NOW;
    return d >= 0 && d <= 7 * DAY;
  }).length;
  const overdue = mockPmSchedules.filter((p) => Date.parse(p.nextDue) < DEMO_NOW).length;
  const avgCompliance = Math.round(
    mockPmSchedules.reduce((sum, p) => sum + p.compliancePct, 0) / (total || 1),
  );

  // ── filtered rows ─────────────────────────────────────────────────────────────
  const rows = useMemo(
    () => mockPmSchedules.filter((p) => freqs.size === 0 || freqs.has(p.frequency)),
    [freqs],
  );

  const toggleFreq = (f: PmFrequency) =>
    setFreqs((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const generateWo = (p: PmSchedule) =>
    toast({
      title: 'Work order generated',
      description: `${p.title} — WO created for ${p.assetName} and assigned to ${p.assignedTeam}.`,
      tone: 'success',
    });

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
          <Button
            variant="primary"
            size="md"
            onClick={() =>
              toast({ title: 'New PM schedule', description: 'The PM plan builder is not part of this demo.', tone: 'info' })
            }
          >
            New PM Schedule
          </Button>
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
                      <Button variant="outline" size="sm" onClick={() => generateWo(p)}>
                        Generate WO
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <EmptyState
            variant="no-results"
            title="No PM plans match"
            description="Try a different frequency filter."
            action={
              <Button variant="outline" size="sm" onClick={() => setFreqs(new Set())}>
                Reset filters
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
