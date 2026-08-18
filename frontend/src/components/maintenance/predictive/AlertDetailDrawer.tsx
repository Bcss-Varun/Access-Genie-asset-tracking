import { Link } from 'react-router-dom';
import type { PredictiveAlert, PredictiveAlertDetail } from '@access-genie/shared';
import { Drawer, DrawerRow, DrawerSection } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/primitives';
import { ApiRequestError } from '@/api/client';
import { cn } from '@/lib/utils';
import {
  SEVERITY_PILL,
  STATUS_PILL,
  TYPE_EMOJI,
  confidenceBand,
  formatDate,
  formatDateTime,
  relative,
} from './tokens';

/**
 * One alert, in full.
 *
 * Everything here is the server's answer to `/predictive-alerts/:id/detail` —
 * one request, because the alternative is four from a drawer on a database whose
 * connection pool serialises all four.
 *
 * The sections are ordered the way the decision is made: what is predicted and
 * how sure we are, then the evidence, then what to do, then the machine it is
 * about, then what has already been done — and only then the audit trail.
 */

export function AlertDetailDrawer({
  detail,
  loading,
  error,
  busy,
  onClose,
  onRetry,
  onAcknowledge,
  onCreateWorkOrder,
  onDismiss,
  onReopen,
  onResolve,
}: {
  detail: PredictiveAlertDetail | undefined;
  loading: boolean;
  error: unknown;
  busy: boolean;
  onClose: () => void;
  onRetry: () => void;
  onAcknowledge: (alert: PredictiveAlert) => void;
  onCreateWorkOrder: (alert: PredictiveAlert) => void;
  onDismiss: (alert: PredictiveAlert) => void;
  onReopen: (alert: PredictiveAlert) => void;
  onResolve: (alert: PredictiveAlert) => void;
}) {
  const now = Date.now();

  if (error) {
    return (
      <Drawer title="Predictive alert" icon="⚡" width="xl" onClose={onClose}>
        <ErrorState
          title="Could not load this alert"
          description={error instanceof ApiRequestError ? error.message : 'The request failed.'}
          requestId={error instanceof ApiRequestError ? error.requestId : undefined}
          onRetry={onRetry}
        />
      </Drawer>
    );
  }

  if (loading || !detail) {
    return (
      <Drawer title="Predictive alert" icon="⚡" width="xl" onClose={onClose}>
        <div className="space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Drawer>
    );
  }

  const { alert, asset, workOrders, assetHistory } = detail;
  const band = confidenceBand(alert.confidence);
  const settled = alert.status === 'Dismissed' || alert.status === 'Resolved';

  return (
    <Drawer
      title={alert.title}
      icon={TYPE_EMOJI[alert.type]}
      width="xl"
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', SEVERITY_PILL[alert.severity])}>
            {alert.severity}
          </span>
          <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', STATUS_PILL[alert.status])}>
            {alert.status}
          </span>
          <span className="font-mono text-xs text-slate-400">{alert.id}</span>
          <span className="text-xs text-slate-400">· {alert.type}</span>
        </span>
      }
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {alert.status === 'Open' && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAcknowledge(alert)}>
              Acknowledge
            </Button>
          )}
          {(alert.status === 'Open' || alert.status === 'Acknowledged') && (
            <Button size="sm" disabled={busy} onClick={() => onCreateWorkOrder(alert)}>
              Create Work Order
            </Button>
          )}
          {alert.status === 'Acknowledged' && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onResolve(alert)}>
              Resolve
            </Button>
          )}
          {alert.status === 'Work Order Created' && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onCreateWorkOrder(alert)}>
                Raise follow-up WO
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onResolve(alert)}>
                Resolve
              </Button>
            </>
          )}
          {alert.status === 'Dismissed' && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onReopen(alert)}>
              Reopen
            </Button>
          )}
          {!settled && alert.status !== 'Work Order Created' && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onDismiss(alert)}>
              Dismiss
            </Button>
          )}
        </div>
      }
    >
      {/* ── Confidence ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confidence</span>
          <span className={cn('text-sm font-bold tabular-nums', band.text)}>
            {alert.confidence}% · {band.label}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div className={cn('h-full rounded-full transition-all', band.bar)} style={{ width: `${alert.confidence}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {/* The one line that keeps this module honest: it names what produced
              the score instead of letting every alert imply a model. */}
          {alert.detector ? (
            <>
              Scored by <span className="font-medium text-slate-700">{alert.detector.name}</span>
              {alert.detector.version && ` v${alert.detector.version}`}
              {alert.detector.modelId && ` · model ${alert.detector.modelId}`}
            </>
          ) : (
            <>
              Raised manually by <span className="font-medium text-slate-700">{alert.createdBy}</span> — no model
              produced this score.
            </>
          )}
        </p>
      </div>

      {/* ── Reason ─────────────────────────────────────────────────────────── */}
      <DrawerSection title="Why this was flagged">
        <p className="text-sm leading-relaxed text-slate-700">{alert.reason}</p>
      </DrawerSection>

      {/* ── Signals ────────────────────────────────────────────────────────── */}
      <DrawerSection title={`Signals (${alert.signals.length})`}>
        {alert.signals.length === 0 ? (
          <p className="text-sm text-slate-400">No individual signals were recorded against this alert.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Signal</th>
                  <th className="px-3 py-2">Reading</th>
                  <th className="px-3 py-2">Baseline</th>
                  <th className="px-3 py-2 text-right">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {alert.signals.map((signal, i) => (
                  <tr key={`${signal.label}-${i}`}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{signal.label}</div>
                      {signal.detail && <div className="text-[11px] text-slate-400">{signal.detail}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{signal.value}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">{signal.baseline ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-500">
                      {signal.weight !== undefined ? `${signal.weight}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DrawerSection>

      {/* ── Recommended action ─────────────────────────────────────────────── */}
      <DrawerSection title="Recommended action">
        <div className="rounded-lg border border-primary-100 bg-primary-50 px-3 py-2.5">
          <p className="text-sm text-slate-700">{alert.recommendation.action}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-primary-700">
            <span>Priority {alert.recommendation.priority}</span>
            <span>Due in {alert.recommendation.dueInDays}d</span>
            <span>~{alert.recommendation.estimatedHours}h</span>
            {alert.recommendation.requiredSkill && <span>Skill: {alert.recommendation.requiredSkill}</span>}
          </div>
        </div>
      </DrawerSection>

      {/* ── Timing ─────────────────────────────────────────────────────────── */}
      <DrawerSection title="Timing">
        <div className="divide-y divide-slate-100">
          <DrawerRow label="Detected" value={`${formatDateTime(alert.detectedAt)} (${relative(alert.detectedAt, now)})`} />
          <DrawerRow
            label="Predicted failure"
            value={
              alert.predictedFailureAt
                ? `${formatDate(alert.predictedFailureAt)} (${relative(alert.predictedFailureAt, now)})`
                : 'Not estimated'
            }
          />
          <DrawerRow label="Source" value={alert.source} />
          {alert.acknowledgedAt && (
            <DrawerRow label="Acknowledged" value={`${alert.acknowledgedBy} · ${formatDate(alert.acknowledgedAt)}`} />
          )}
          {alert.dismissedAt && (
            <DrawerRow
              label="Dismissed"
              value={`${alert.dismissedBy} · ${formatDate(alert.dismissedAt)}${alert.dismissedReason ? ` — ${alert.dismissedReason}` : ''}`}
            />
          )}
          {alert.resolvedAt && <DrawerRow label="Resolved" value={`${alert.resolvedBy} · ${formatDate(alert.resolvedAt)}`} />}
        </div>
      </DrawerSection>

      {/* ── Asset ──────────────────────────────────────────────────────────── */}
      <DrawerSection title="Asset">
        {asset ? (
          <div className="divide-y divide-slate-100">
            <DrawerRow
              label="Asset"
              value={
                <Link to={`/assets/${asset.id}`} className="text-primary-600 hover:text-primary-700">
                  {asset.name} ↗
                </Link>
              }
            />
            <DrawerRow label="Category" value={asset.category} />
            <DrawerRow label="Serial" value={<span className="font-mono text-xs">{asset.serialNumber || '—'}</span>} />
            <DrawerRow label="Make / model" value={[asset.manufacturer, asset.model].filter(Boolean).join(' ') || '—'} />
            <DrawerRow label="Location" value={alert.placement?.locationName ?? asset.location} />
            <DrawerRow label="Facility" value={alert.placement?.facilityName ?? '—'} />
            <DrawerRow label="Status" value={asset.status} />
            <DrawerRow label="Lifecycle stage" value={asset.lifecycleStage ?? '—'} />
            <DrawerRow label="Criticality" value={asset.criticality ?? '—'} />
            <DrawerRow
              label="Health score"
              value={asset.healthScore !== undefined ? `${asset.healthScore}/100` : '—'}
            />
          </div>
        ) : (
          // Not an error: an alert about a machine since retired is still worth
          // reading, and 404ing the drawer would hide the alert with the asset.
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            The asset this alert names ({alert.assetId}) is no longer in the registry. The alert is kept as a record.
          </p>
        )}
      </DrawerSection>

      {/* ── Work orders ────────────────────────────────────────────────────── */}
      <DrawerSection title={`Work orders raised (${workOrders.length})`}>
        {workOrders.length === 0 ? (
          <p className="text-sm text-slate-400">No work has been raised from this alert yet.</p>
        ) : (
          <div className="space-y-2">
            {workOrders.map((order) => (
              <Link
                key={order.id}
                to={`/maintenance/${order.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 transition-colors hover:border-primary-300 hover:bg-primary-50/40"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">{order.title}</div>
                  <div className="text-[11px] text-slate-400">
                    <span className="font-mono">{order.id}</span> · {order.priority} · {order.assignedTo}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-medium text-slate-700">{order.status}</div>
                  <div className="text-[11px] text-slate-400">due {formatDate(order.dueDate)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </DrawerSection>

      {/* ── Alert history on this asset ────────────────────────────────────── */}
      <DrawerSection title={`Other alerts on this asset (${assetHistory.length})`}>
        {assetHistory.length === 0 ? (
          <p className="text-sm text-slate-400">This is the only predictive alert ever raised against this asset.</p>
        ) : (
          <div className="space-y-1.5">
            {assetHistory.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-slate-700">{entry.title}</div>
                  <div className="text-[11px] text-slate-400">
                    <span className="font-mono">{entry.id}</span> · {entry.type} · {formatDate(entry.detectedAt)}
                    {entry.workOrderIds.length > 0 && ` · ${entry.workOrderIds.length} WO`}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', SEVERITY_PILL[entry.severity])}>
                    {entry.severity}
                  </span>
                  <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', STATUS_PILL[entry.status])}>
                    {entry.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DrawerSection>

      {/* ── Audit trail ────────────────────────────────────────────────────── */}
      <DrawerSection title="Alert trail">
        <ol className="space-y-2">
          {alert.history.map((event, i) => (
            <li key={i} className="flex gap-3 text-xs">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
              <div className="min-w-0">
                <span className="font-medium text-slate-700">
                  {event.from ? `${event.from} → ${event.to}` : `Raised as ${event.to}`}
                </span>
                <span className="text-slate-400">
                  {' '}
                  · {event.actor} · {formatDateTime(event.at)}
                </span>
                {event.note && <div className="text-slate-500">{event.note}</div>}
              </div>
            </li>
          ))}
        </ol>
      </DrawerSection>
    </Drawer>
  );
}
