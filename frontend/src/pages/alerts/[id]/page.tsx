import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAlert } from '@/lib/dataset';
import type { Alert, AlertStatus } from '@access-genie/shared';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { FormDialog, Field, Select } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { alertsApi } from '@/api/alerts';
import { allUsers } from '@/lib/rbac';
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

/**
 * What the API returns beyond the shared `Alert` contract: the escalation stamp
 * and the step-by-step trail the service now records (backend models/Alert.ts).
 * Optional, so an alert written before the trail existed still renders.
 */
interface AlertHistoryEntry {
  action: 'raised' | 'acknowledged' | 'escalated' | 'resolved' | 'assigned';
  by: string;
  at: string;
  from?: AlertStatus;
  assignee?: string;
  note?: string;
}
type AlertWithTrail = Alert & { escalatedBy?: string; escalatedAt?: string; history?: AlertHistoryEntry[] };

/**
 * The steps this alert has actually been through.
 *
 * This used to be derived from the current status alone: every step up to the
 * status index was drawn as done, each credited to the same fixture person and
 * stamped with the creation time. So an alert resolved straight from
 * Acknowledged claimed it had been escalated, and every acknowledgement named
 * somebody who never touched it. Now it is the recorded trail, falling back —
 * for alerts older than the trail — to the stamps on the record itself, and
 * never to a name the record does not carry.
 */
function trailOf(alert: AlertWithTrail): AlertHistoryEntry[] {
  if (alert.history?.length) return alert.history;
  const steps: AlertHistoryEntry[] = [{ action: 'raised', by: alert.source, at: alert.createdAt }];
  if (alert.acknowledgedBy && alert.acknowledgedAt) steps.push({ action: 'acknowledged', by: alert.acknowledgedBy, at: alert.acknowledgedAt });
  if (alert.escalatedBy && alert.escalatedAt) steps.push({ action: 'escalated', by: alert.escalatedBy, at: alert.escalatedAt });
  if (alert.assignedTo && alert.assignedAt) steps.push({ action: 'assigned', by: alert.assignedTo, at: alert.assignedAt, assignee: alert.assignedTo });
  if (alert.resolvedBy && alert.resolvedAt) steps.push({ action: 'resolved', by: alert.resolvedBy, at: alert.resolvedAt });
  return steps.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

const STEP_LABEL: Record<AlertHistoryEntry['action'], string> = {
  raised: 'Alert raised',
  acknowledged: 'Acknowledged',
  escalated: 'Escalated to on-call',
  resolved: 'Resolved',
  assigned: 'Assigned',
};

function describeStep(step: AlertHistoryEntry, alert: Alert): string {
  const note = step.note ? ` — "${step.note}"` : '';
  switch (step.action) {
    case 'raised':
      return step.by === alert.source
        ? `${alert.source} triggered "${alert.title}".`
        : `${step.by} raised "${alert.title}" (${alert.source}).`;
    case 'acknowledged':
      return `${step.by} acknowledged the alert.${note}`;
    case 'escalated':
      return `${step.by} escalated the alert.${note}`;
    case 'resolved':
      return `${step.by} resolved the alert.${note}`;
    case 'assigned':
      return `${step.by} assigned it to ${step.assignee ?? 'someone'}.`;
  }
}

function buildTimeline(alert: AlertWithTrail): { label: string; detail: string; ts?: string; done: boolean }[] {
  const rows: { label: string; detail: string; ts?: string; done: boolean }[] = trailOf(alert).map((step) => ({
    label: STEP_LABEL[step.action],
    detail: describeStep(step, alert),
    ts: step.at,
    done: true,
  }));
  // The one step still ahead of an unresolved alert — shown as pending, never as done.
  if (alert.status !== 'Resolved') rows.push({ label: 'Resolved', detail: 'Pending', done: false });
  return rows;
}

export default function AlertDetailPage() {
  const { id = '' } = useParams();
  const { run, isPending } = useMutate();
  const [assigning, setAssigning] = useState(false);
  const [assignee, setAssignee] = useState(allUsers[0]?.name ?? '');

  // Read straight from the hydrated dataset. This used to hold the status in
  // local state and never tell the server, so acknowledging an alert here was
  // undone by a reload — and invisible to the colleague working the same queue.
  const found = getAlert(id);

  if (!found) {
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

  const alert: AlertWithTrail = found;
  const timeline = buildTimeline(alert);

  const act = (next: AlertStatus, verb: string) => {
    const call =
      next === 'Acknowledged'
        ? alertsApi.acknowledge(alert.id)
        : next === 'Escalated'
          ? alertsApi.escalate(alert.id)
          : alertsApi.resolve(alert.id);

    void run(call, {
      success: `Alert ${verb}`,
      successDetail: `${alert.id} — ${alert.title}`,
      describe: `${verb.replace(/ed$/, '')} that alert`,
    });
  };

  const assign = async () => {
    const ok = await run(alertsApi.assign(alert.id, assignee), {
      success: 'Alert assigned',
      successDetail: `${alert.id} is now ${assignee}'s. It has been acknowledged.`,
      describe: 'assign that alert',
    });
    if (ok) setAssigning(false);
  };

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
    // Assigning was stored but never shown, so after "Alert assigned" nobody
    // could tell from the screen whose it was.
    { label: 'Owner', value: alert.assignedTo ?? <span className="text-slate-400">Nobody yet</span> },
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
                disabled={isPending || alert.status === 'Acknowledged' || alert.status === 'Resolved'}
                onClick={() => act('Acknowledged', 'acknowledged')}
              >
                Acknowledge
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={isPending || alert.status === 'Escalated' || alert.status === 'Resolved'}
                onClick={() => act('Escalated', 'escalated')}
              >
                Escalate
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isPending || alert.status === 'Resolved'}
                onClick={() => setAssigning(true)}
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
                      {t.done && t.ts && <span className="text-xs text-slate-400 whitespace-nowrap">{relTime(t.ts)}</span>}
                    </div>
                    <p className="text-sm text-slate-500">{t.done ? t.detail : 'Pending'}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      {assigning && (
        <FormDialog
          icon="👤"
          title={`Assign ${alert.id}`}
          description="Assigning acknowledges it too — somebody taking it on has, by definition, seen it."
          submitLabel="Assign"
          busy={isPending}
          disabled={!assignee}
          onSubmit={() => void assign()}
          onCancel={() => setAssigning(false)}
        >
          <Field label="Owner" required>
            <Select
              autoFocus
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              options={allUsers.map((u) => ({ value: u.name, label: u.name }))}
            />
          </Field>
        </FormDialog>
      )}

    </div>
  );
}
