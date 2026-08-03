import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allAlerts } from '@/lib/dataset';
import type { Alert, AlertStatus } from '@access-genie/shared';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { alertsApi } from '@/api/alerts';
import { useMutate } from '@/api/mutate';
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

const SEVERITIES: Severity[] = ['Critical', 'Warning', 'Info'];
const STATUSES: AlertStatus[] = ['Open', 'Acknowledged', 'Escalated', 'Resolved'];

export default function AlertCenterPage() {
  const { run } = useMutate();
  // Seeded from the dataset, then updated optimistically. `run` re-reads the
  // dataset on success, so the sidebar badge and the dashboards follow.
  const [alerts, setAlerts] = useState<Alert[]>(allAlerts);
  const [sevFilter, setSevFilter] = useState<Severity | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'All'>('All');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const open = alerts.filter((a) => a.status === 'Open').length;
  const critical = alerts.filter((a) => a.severity === 'Critical' && a.status !== 'Resolved').length;
  const escalated = alerts.filter((a) => a.status === 'Escalated').length;
  const resolvedToday = alerts.filter((a) => a.status === 'Resolved').length;

  const visible = useMemo(
    () =>
      alerts.filter(
        (a) =>
          (sevFilter === 'All' || a.severity === sevFilter) &&
          (statusFilter === 'All' || a.status === statusFilter),
      ),
    [alerts, sevFilter, statusFilter],
  );

  function setStatus(id: string, status: AlertStatus, verb: string) {
    const alert = alerts.find((a) => a.id === id);
    const previous = alert?.status;

    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));

    const call =
      status === 'Acknowledged' ? alertsApi.acknowledge(id)
        : status === 'Escalated' ? alertsApi.escalate(id)
          : alertsApi.resolve(id);

    void run(call, {
      success: `Alert ${verb}`,
      successDetail: `${alert?.id} — ${alert?.title}`,
      describe: `${verb.replace(/d$/, '')} that alert`,
      rollback: () =>
        setAlerts((prev) => prev.map((a) => (a.id === id && previous ? { ...a, status: previous } : a))),
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === visible.length ? new Set() : new Set(visible.map((a) => a.id))));
  }

  function bulkAcknowledge() {
    // Only the open ones actually change, so only those are sent.
    const ids = alerts.filter((a) => selected.has(a.id) && a.status === 'Open').map((a) => a.id);
    if (!ids.length) return;

    const before = alerts;
    setAlerts((prev) => prev.map((a) => (ids.includes(a.id) ? { ...a, status: 'Acknowledged' } : a)));
    setSelected(new Set());

    void run(alertsApi.acknowledgeMany(ids), {
      success: `${ids.length} alert${ids.length === 1 ? '' : 's'} acknowledged`,
      describe: 'acknowledge those alerts',
      rollback: () => setAlerts(before),
    });
  }

  const allChecked = visible.length > 0 && selected.size === visible.length;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Alert Center"
        subtitle="Triage, acknowledge and escalate active alerts across your asset fleet."
        breadcrumb={[{ label: 'Alerts', href: '/alerts' }, { label: 'Alert Center' }]}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/alert-rules">
              <Button variant="outline">Alert Rules</Button>
            </Link>
            <Button
              disabled={selected.size === 0}
              onClick={bulkAcknowledge}
            >
              Acknowledge {selected.size > 0 ? `(${selected.size})` : 'selected'}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Open" value={open} sub="Awaiting triage" tone="amber" accent />
        <KpiCard label="Critical" value={critical} sub="Active critical alerts" tone="red" />
        <KpiCard label="Escalated" value={escalated} sub="Sent to on-call" tone="red" />
        <KpiCard label="Resolved today" value={resolvedToday} sub="Closed out" tone="emerald" />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Severity</span>
          {(['All', ...SEVERITIES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSevFilter(s)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                sevFilter === s
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {s !== 'All' && <span className={cn('w-1.5 h-1.5 rounded-full', severityAccent[s])} />}
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</span>
          {(['All', ...STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                statusFilter === s
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          variant="no-results"
          title="No alerts match these filters"
          description="Try clearing the severity or status filters to see more alerts."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSevFilter('All');
                setStatusFilter('All');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="glass-panel rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allChecked}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 accent-primary-600"
                    />
                  </th>
                  <th className="px-4 py-3">Alert</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Raised</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((a) => (
                  <tr key={a.id} className="group hover:bg-slate-50/70">
                    <td className="px-4 py-3 align-top">
                      <input
                        type="checkbox"
                        aria-label={`Select ${a.id}`}
                        checked={selected.has(a.id)}
                        onChange={() => toggleSelect(a.id)}
                        className="h-4 w-4 rounded border-slate-300 accent-primary-600"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-start gap-3">
                        <span className={cn('mt-1 h-8 w-1 shrink-0 rounded-full', severityAccent[a.severity])} />
                        <div className="min-w-0">
                          <Link to={`/alerts/${a.id}`} className="font-medium text-slate-900 hover:text-primary-600">
                            {a.title}
                          </Link>
                          <div className="mt-1 flex items-center gap-2">
                            <Badge tone={severityTone[a.severity]}>{a.severity}</Badge>
                            <span className="font-mono text-xs text-slate-400">{a.id}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-slate-600">{a.type}</td>
                    <td className="px-4 py-3 align-top">
                      {a.assetId ? (
                        <Link to={`/assets/${a.assetId}`} className="text-primary-600 hover:underline">
                          {a.assetName ?? a.assetId}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge tone={statusTone[a.status]}>{a.status}</Badge>
                    </td>
                    <td className="px-4 py-3 align-top text-slate-600">{a.source}</td>
                    <td className="px-4 py-3 align-top whitespace-nowrap text-slate-500">{relTime(a.createdAt)}</td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={a.status === 'Acknowledged' || a.status === 'Resolved'}
                          onClick={() => setStatus(a.id, 'Acknowledged', 'acknowledged')}
                        >
                          Ack
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={a.status === 'Escalated' || a.status === 'Resolved'}
                          onClick={() => setStatus(a.id, 'Escalated', 'escalated')}
                        >
                          Escalate
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={a.status === 'Resolved'}
                          onClick={() => setStatus(a.id, 'Resolved', 'resolved')}
                        >
                          Resolve
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
