import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ALERT_SEVERITIES, ALERT_STATUSES, type Alert } from '@access-genie/shared';
import { Badge, EmptyState, ErrorState, KpiCard, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { cn, relTime } from '@/lib/format';
import { alertSeverityTone } from '@/lib/tone';
import { alertsApi } from './alerts-api';

const STATUS_TONE = { Open: 'red', Acknowledged: 'amber', Escalated: 'red', Resolved: 'emerald' } as const;

export function AlertsPage() {
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const status = params.get('status') ?? '';
  const severity = params.get('severity') ?? '';
  const page = Number(params.get('page') ?? '1');

  const filters = { page, limit: 25, ...(status ? { status } : {}), ...(severity ? { severity } : {}) };

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['alerts', filters],
    queryFn: () => alertsApi.list(filters),
    placeholderData: keepPreviousData,
  });

  const { data: stats } = useQuery({ queryKey: ['alerts', 'stats'], queryFn: alertsApi.stats });

  /** Every alert action invalidates the list, the counters and the sidebar badge. */
  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['alerts'] });

  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'acknowledge' | 'escalate' | 'resolve' }) => alertsApi[action](id),
    onSuccess: refreshAll,
  });

  const bulkAcknowledge = useMutation({
    mutationFn: (ids: string[]) => alertsApi.acknowledgeMany(ids),
    onSuccess: async () => {
      setSelected(new Set());
      await refreshAll();
    },
  });

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert Center"
        subtitle="Security, custody and condition alerts across the estate."
        actions={
          selected.size > 0 ? (
            <Button size="sm" disabled={bulkAcknowledge.isPending} onClick={() => bulkAcknowledge.mutate([...selected])}>
              Acknowledge {selected.size} selected
            </Button>
          ) : undefined
        }
      />

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Open alerts" value={stats.open} tone={stats.open > 0 ? 'red' : 'emerald'} accent />
          <KpiCard label="Critical" value={stats.critical} tone="red" />
          <KpiCard label="Warning" value={stats.warning} tone="amber" />
          <KpiCard label="Info" value={stats.info} tone="primary" />
        </div>
      )}

      <div className="glass-panel p-3 flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setParam('status', e.target.value)}
          aria-label="Filter by status"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        >
          <option value="">All statuses</option>
          {ALERT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={severity}
          onChange={(e) => setParam('severity', e.target.value)}
          aria-label="Filter by severity"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        >
          <option value="">All severities</option>
          {ALERT_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <Button variant="ghost" size="sm" onClick={() => setParam('status', 'Open,Escalated')}>
          Needs attention
        </Button>

        {(status || severity) && (
          <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
            Clear
          </Button>
        )}
      </div>

      {error ? (
        <ErrorState
          title="Could not load alerts"
          description={error instanceof ApiRequestError ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : isPending ? (
        <TableSkeleton rows={8} columns={4} />
      ) : data.items.length === 0 ? (
        <div className="glass-panel">
          <EmptyState icon="✅" title="Nothing to action" description="No alerts match this view." />
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {data.items.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                checked={selected.has(alert.id)}
                onToggle={() => toggle(alert.id)}
                busy={transition.isPending}
                onAction={(action) => transition.mutate({ id: alert.id, action })}
              />
            ))}
          </ul>

          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span>{data.meta.total} alerts</span>
            <span className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!data.meta.hasPrev} onClick={() => setParam('page', String(page - 1))}>
                Previous
              </Button>
              <span className="tabular-nums">
                {data.meta.page} / {data.meta.totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={!data.meta.hasNext} onClick={() => setParam('page', String(page + 1))}>
                Next
              </Button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertRow({
  alert,
  checked,
  onToggle,
  onAction,
  busy,
}: {
  alert: Alert;
  checked: boolean;
  onToggle: () => void;
  onAction: (action: 'acknowledge' | 'escalate' | 'resolve') => void;
  busy: boolean;
}) {
  const resolved = alert.status === 'Resolved';

  return (
    <li className={cn('px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors', resolved && 'opacity-60')}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={resolved}
        aria-label={`Select ${alert.title}`}
        className="mt-1.5 rounded border-slate-300 text-primary-600 focus:ring-primary-400"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={alertSeverityTone[alert.severity]}>{alert.severity}</Badge>
          <Badge tone={STATUS_TONE[alert.status]}>{alert.status}</Badge>
          <span className="text-[11px] text-slate-400">{alert.type}</span>
        </div>

        <p className="text-sm font-medium text-slate-800 mt-1.5">{alert.title}</p>

        <p className="text-[11px] text-slate-400 mt-0.5">
          {alert.assetId && (
            <>
              <Link to={`/assets/${alert.assetId}`} className="hover:text-primary-600">
                {alert.assetName ?? alert.assetId}
              </Link>
              {' · '}
            </>
          )}
          {alert.source} · raised {relTime(alert.createdAt)}
          {alert.acknowledgedBy && ` · acknowledged by ${alert.acknowledgedBy}`}
          {alert.resolvedBy && ` · resolved by ${alert.resolvedBy}`}
        </p>
      </div>

      {/* Only the transitions the server will actually accept are offered. */}
      {!resolved && (
        <div className="flex items-center gap-1.5 shrink-0">
          {alert.status !== 'Acknowledged' && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onAction('acknowledge')}>
              Acknowledge
            </Button>
          )}
          {alert.status !== 'Escalated' && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onAction('escalate')}>
              Escalate
            </Button>
          )}
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onAction('resolve')}>
            Resolve
          </Button>
        </div>
      )}
    </li>
  );
}
