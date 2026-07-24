import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAlert } from '@/lib/mock-data';
import type { Alert, AlertStatus } from '@/types/asset';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, relTime } from '@/lib/utils';

type Severity = Alert['severity'];
type Tone = 'slate' | 'primary' | 'emerald' | 'amber' | 'red';

const severityTone: Record<Severity, Tone> = { Critical: 'red', Warning: 'amber', Info: 'primary' };
const severityAccent: Record<Severity, string> = {
  Critical: 'bg-red-500',
  Warning: 'bg-amber-500',
  Info: 'bg-primary-500',
};
const statusTone: Record<AlertStatus, Tone> = {
  Open: 'amber',
  Acknowledged: 'primary',
  Escalated: 'red',
  Resolved: 'emerald',
};

// Deterministic lifecycle timeline derived from the alert's current status.
function buildTimeline(alert: Alert): { label: string; detail: string; ts: string; done: boolean }[] {
  const order: AlertStatus[] = ['Open', 'Acknowledged', 'Escalated', 'Resolved'];
  const idx = order.indexOf(alert.status);
  return [
    {
      label: 'Alert raised',
      detail: `${alert.source} triggered "${alert.title}".`,
      ts: alert.createdAt,
      done: true,
    },
    {
      label: 'Acknowledged',
      detail: 'Sneha Iyer acknowledged the alert.',
      ts: alert.createdAt,
      done: idx >= 1,
    },
    {
      label: 'Escalated to on-call',
      detail: 'Routed to Tier 2 (Facilities on-call).',
      ts: alert.createdAt,
      done: idx >= 2,
    },
    {
      label: 'Resolved',
      detail: 'Root cause addressed and alert closed.',
      ts: alert.createdAt,
      done: idx >= 3,
    },
  ];
}

export default function AlertDetailPage() {
  const { id = '' } = useParams();
  const { toast } = useToast();
  const found = getAlert(id);
  const [status, setStatusState] = useState<AlertStatus | null>(found ? found.status : null);

  if (!found || status === null) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <EmptyState
          title="Alert not found"
          description={`No alert matches "${id}".`}
          action={
            <Link to="/alerts">
              <Button variant="primary" size="sm">Back to Alert Center</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const alert: Alert = { ...found, status };
  const timeline = buildTimeline(alert);

  function act(next: AlertStatus, verb: string) {
    setStatusState(next);
    toast({ title: `Alert ${verb}`, description: `${alert.id} — ${alert.title}`, tone: 'success' });
  }

  const detailRows: { label: string; value: React.ReactNode }[] = [
    { label: 'Alert ID', value: <span className="font-mono text-xs">{alert.id}</span> },
    { label: 'Type', value: alert.type },
    { label: 'Source', value: alert.source },
    { label: 'Severity', value: <Badge tone={severityTone[alert.severity]}>{alert.severity}</Badge> },
    { label: 'Status', value: <Badge tone={statusTone[alert.status]}>{alert.status}</Badge> },
    {
      label: 'Asset',
      value: alert.assetId ? (
        <Link to={`/assets/${alert.assetId}`} className="text-primary-600 hover:underline">
          {alert.assetName ?? alert.assetId}
        </Link>
      ) : (
        <span className="text-slate-400">Unassigned</span>
      ),
    },
    { label: 'Raised', value: relTime(alert.createdAt) },
  ];

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={alert.title}
        subtitle={`${alert.type} · ${alert.source}`}
        breadcrumb={[{ label: 'Alerts', href: '/alerts' }, { label: alert.id }]}
        actions={
          <span className="inline-flex items-center gap-2">
            <Badge tone={severityTone[alert.severity]} className="text-sm px-3 py-1">{alert.severity}</Badge>
            <Badge tone={statusTone[alert.status]} className="text-sm px-3 py-1">{alert.status}</Badge>
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Details card */}
        <div className="glass-panel rounded-xl p-5 lg:col-span-1 space-y-5">
          <div className="flex items-center gap-3">
            <span className={cn('h-11 w-1.5 rounded-full', severityAccent[alert.severity])} />
            <div>
              <div className="font-bold font-heading text-slate-800">{alert.severity} alert</div>
              <div className="text-xs text-slate-400">Raised {relTime(alert.createdAt)}</div>
            </div>
          </div>

          <dl className="divide-y divide-slate-100">
            {detailRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-sm text-slate-500">{r.label}</dt>
                <dd className="text-sm font-medium text-slate-800 text-right">{r.value}</dd>
              </div>
            ))}
          </dl>

          {alert.assetId && (
            <Link to={`/assets/${alert.assetId}`}>
              <Button variant="outline" size="sm" className="w-full">View related asset →</Button>
            </Link>
          )}
        </div>

        {/* Timeline + actions */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel rounded-xl p-5">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Response actions</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={alert.status === 'Acknowledged' || alert.status === 'Resolved'}
                onClick={() => act('Acknowledged', 'acknowledged')}
              >
                Acknowledge
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={alert.status === 'Escalated' || alert.status === 'Resolved'}
                onClick={() => act('Escalated', 'escalated')}
              >
                Escalate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast({ title: 'Alert assigned', description: `${alert.id} assigned to Arjun Menon.`, tone: 'info' })}
              >
                Assign
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={alert.status === 'Resolved'}
                onClick={() => act('Resolved', 'resolved')}
              >
                Resolve
              </Button>
            </div>
          </div>

          <div className="glass-panel rounded-xl p-5">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Lifecycle timeline</h3>
            <ol className="relative space-y-5">
              {timeline.map((t, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center pt-1">
                    <span
                      className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        t.done ? 'bg-primary-500' : 'bg-slate-300',
                      )}
                    />
                    {i < timeline.length - 1 && (
                      <span className={cn('mt-1 w-px flex-1 min-h-[1.75rem]', t.done ? 'bg-primary-200' : 'bg-slate-200')} />
                    )}
                  </div>
                  <div className={cn('min-w-0 flex-1 pb-1', !t.done && 'opacity-50')}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">{t.label}</p>
                      {t.done && <span className="text-xs text-slate-400 whitespace-nowrap">{relTime(t.ts)}</span>}
                    </div>
                    <p className="text-sm text-slate-500">{t.done ? t.detail : 'Pending'}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
