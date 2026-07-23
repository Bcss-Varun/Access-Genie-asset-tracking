'use client';

import { use } from 'react';
import Link from 'next/link';
import { getPmSchedule, getAssetById } from '@/lib/mock-data';
import type { PmSchedule, PmFrequency } from '@/types/asset';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, relTime, DEMO_NOW } from '@/lib/utils';

// ── token helpers ─────────────────────────────────────────────────────────────
type Tone = 'slate' | 'primary' | 'emerald' | 'amber' | 'red';

const DAY = 86_400_000;

const freqTone = (f: PmFrequency): Tone =>
  f === 'Monthly' ? 'primary'
    : f === 'Quarterly' ? 'emerald'
      : f === 'Semi-Annual' ? 'amber'
        : f === 'Annual' ? 'slate'
          : 'red';

// Nominal cadence in days — used to synthesise deterministic past occurrences.
const freqDays: Record<PmFrequency, number> = {
  Monthly: 30,
  Quarterly: 91,
  'Semi-Annual': 182,
  Annual: 365,
  'Usage-based': 45,
};

const complianceHex = (pct: number): string =>
  pct >= 95 ? '#10b981' : pct >= 80 ? '#f59e0b' : '#ef4444';

const fmtDate = (iso: string): string =>
  new Date(Date.parse(iso)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function dueLabel(iso: string): { text: string; overdue: boolean } {
  const diffDays = Math.round((Date.parse(iso) - DEMO_NOW) / DAY);
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, overdue: true };
  if (diffDays === 0) return { text: 'Due today', overdue: false };
  if (diffDays === 1) return { text: 'Due tomorrow', overdue: false };
  return { text: `in ${diffDays}d`, overdue: false };
}

export default function PmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const pm: PmSchedule | undefined = getPmSchedule(id);

  if (!pm) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <EmptyState
          title="PM schedule not found"
          description={`No preventive-maintenance plan matches "${id}".`}
          action={
            <Link href="/pm">
              <Button variant="primary" size="sm">Back to PM schedules</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const asset = getAssetById(pm.assetId);
  const due = dueLabel(pm.nextDue);
  const interval = freqDays[pm.frequency];

  // Synthetic history — derive 4 deterministic past occurrences by stepping back
  // from the anchored lastDone date at the plan's nominal cadence (no Date.now()).
  const history = Array.from({ length: 4 }, (_, i) => {
    const iso = new Date(Date.parse(pm.lastDone) - i * interval * DAY).toISOString();
    return {
      iso,
      result: i === 0 ? 'Completed' : i === 2 ? 'Completed (late)' : 'Completed',
      tech: pm.assignedTeam,
      hours: pm.estHours,
    };
  });

  const detailRows: { label: string; value: React.ReactNode }[] = [
    {
      label: 'Asset',
      value: asset ? (
        <Link href={`/assets/${pm.assetId}`} className="text-primary-600 hover:underline">
          {pm.assetName}
        </Link>
      ) : (
        <span className="text-slate-500">{pm.assetName}</span>
      ),
    },
    { label: 'Type', value: pm.type },
    {
      label: 'Next due',
      value: (
        <span className={cn('font-medium', due.overdue ? 'text-health-critical' : 'text-slate-800')}>
          {fmtDate(pm.nextDue)} · {due.text}
        </span>
      ),
    },
    { label: 'Last done', value: `${fmtDate(pm.lastDone)} · ${relTime(pm.lastDone)}` },
    { label: 'Est. hours', value: `${pm.estHours}h` },
    { label: 'Assigned team', value: pm.assignedTeam },
  ];

  const generateWo = () =>
    toast({
      title: 'Work order generated',
      description: `${pm.title} — WO created for ${pm.assetName} and assigned to ${pm.assignedTeam}.`,
      tone: 'success',
    });

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={pm.title}
        subtitle={`${pm.id} · Preventive maintenance plan`}
        breadcrumb={[
          { label: 'Maintenance', href: '/maintenance' },
          { label: 'PM', href: '/pm' },
          { label: pm.title },
        ]}
        actions={<Badge tone={freqTone(pm.frequency)} className="text-sm px-3 py-1">{pm.frequency}</Badge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Details card ──────────────────────────────────────────────────────── */}
        <div className="glass-panel rounded-xl p-5 lg:col-span-1 space-y-5">
          <dl className="divide-y divide-slate-100">
            {detailRows.map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-3 py-2.5">
                <dt className="text-sm text-slate-500 shrink-0">{r.label}</dt>
                <dd className="text-sm font-medium text-slate-800 text-right">{r.value}</dd>
              </div>
            ))}
          </dl>

          <div className="pt-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-slate-500">Compliance</span>
              <span className="text-xs font-semibold text-slate-700 tabular-nums">{pm.compliancePct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, pm.compliancePct))}%`, backgroundColor: complianceHex(pm.compliancePct) }}
              />
            </div>
          </div>

          <div className="pt-1">
            <Button variant="primary" size="md" className="w-full" onClick={generateWo}>
              Generate Work Order now
            </Button>
          </div>
        </div>

        {/* ── History ───────────────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel rounded-xl p-5">
            <div className="mb-4">
              <h3 className="font-bold text-lg font-heading text-slate-800">Maintenance History</h3>
              <p className="text-xs text-slate-500 mt-0.5">Recent occurrences of this {pm.frequency.toLowerCase()} plan</p>
            </div>
            <ul className="space-y-3">
              {history.map((h, i) => {
                const late = h.result.includes('late');
                return (
                  <li key={i} className="flex items-start gap-3">
                    <span className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base',
                      late ? 'bg-amber-100' : 'bg-emerald-100',
                    )}>
                      {late ? '⚠️' : '✅'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-800">{h.result}</p>
                        <Badge tone={late ? 'amber' : 'emerald'}>{h.hours}h</Badge>
                      </div>
                      <p className="text-xs text-slate-400">{fmtDate(h.iso)} · {relTime(h.iso)} · {h.tech}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-bold text-lg font-heading text-slate-800 mb-3">Plan Summary</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              This {pm.frequency.toLowerCase()} {pm.type.toLowerCase()} plan covers{' '}
              <span className="font-medium text-slate-800">{pm.assetName}</span> and is owned by the{' '}
              <span className="font-medium text-slate-800">{pm.assignedTeam}</span> team. Each occurrence is
              budgeted at {pm.estHours} hours. Adherence sits at {pm.compliancePct}% over the trailing window
              {due.overdue ? ', and this plan is currently overdue for service.' : `, with the next service ${due.text}.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
