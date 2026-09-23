import { Link, useParams } from 'react-router-dom';
import { getPmSchedule, getAssetById, allWorkOrders } from '@/lib/dataset';
import type { PmSchedule, PmFrequency } from '@access-genie/shared';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { cn, relTime, formatDate, nowMs } from '@/lib/utils';

// ── token helpers ─────────────────────────────────────────────────────────────
type Tone = 'slate' | 'primary' | 'emerald' | 'amber' | 'red';

const DAY = 86_400_000;

const freqTone = (f: PmFrequency): Tone =>
  f === 'Monthly' ? 'primary'
    : f === 'Quarterly' ? 'emerald'
      : f === 'Semi-Annual' ? 'amber'
        : f === 'Annual' ? 'slate'
          : 'red';

const fmtDate = formatDate;

function dueLabel(iso: string): { text: string; overdue: boolean } {
  const diffDays = Math.round((Date.parse(iso) - nowMs()) / DAY);
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, overdue: true };
  if (diffDays === 0) return { text: 'Due today', overdue: false };
  if (diffDays === 1) return { text: 'Due tomorrow', overdue: false };
  return { text: `in ${diffDays}d`, overdue: false };
}

export default function PmDetailPage() {
  const { id = '' } = useParams();
  const pm: PmSchedule | undefined = getPmSchedule(id);

  if (!pm) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <EmptyState
          title="PM schedule not found"
          description={`No preventive-maintenance plan matches "${id}".`}
          action={
            <Link to="/pm">
              <Button variant="primary" size="sm">Back to PM schedules</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const asset = getAssetById(pm.assetId);
  const due = dueLabel(pm.nextDue);
  const history = allWorkOrders.filter(w => w.assetId === pm.assetId && w.status === 'Completed'
    && w.description?.includes(`schedule ${pm.id}`) && w.completedAt)
    .sort((a, b) => Date.parse(b.completedAt!) - Date.parse(a.completedAt!))
    .map(w => ({ iso: w.completedAt!, result: 'Completed', tech: w.assignedTo,
      hours: w.laborLog.reduce((total, entry) => total + entry.hours, 0) }));

  const detailRows: { label: string; value: React.ReactNode }[] = [
    {
      label: 'Asset',
      value: asset ? (
        <Link to={`/assets/${pm.assetId}`} className="text-primary-600 hover:underline">
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
    { label: 'Last done', value: history[0] ? `${fmtDate(history[0].iso)} · ${relTime(history[0].iso)}` : 'No recorded completion' },
    { label: 'Est. hours', value: `${pm.estHours}h` },
    { label: 'Assigned team', value: pm.assignedTeam },
  ];

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

          <p className="text-xs text-slate-500">Occurrence compliance is unavailable until completed work is linked to scheduled occurrences.</p>

          <div className="pt-1">
            <Link to={`/work-orders?create=1&pmId=${encodeURIComponent(pm.id)}`}><Button variant="primary" size="md" className="w-full">Create Work Order</Button></Link>
          </div>
        </div>

        {/* ── History ───────────────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel rounded-xl p-5">
            <div className="mb-4">
              <h3 className="font-bold text-lg font-heading text-slate-800">Maintenance History</h3>
              <p className="text-xs text-slate-500 mt-0.5">Recent occurrences of this {pm.frequency.toLowerCase()} plan</p>
            </div>
            {history.length === 0 && <p className="text-sm text-slate-500">No completed work orders recorded for this plan.</p>}
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
              budgeted at {pm.estHours} hours
              {due.overdue ? ', and this plan is currently overdue for service.' : `, with the next service ${due.text}.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
