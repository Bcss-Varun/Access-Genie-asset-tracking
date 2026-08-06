import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/primitives';
import { HBars, TD, WidgetTable } from '@/components/dashboards/DashboardKit';
import { WidgetEmpty, WidgetFrame } from '@/components/dashboards/WidgetFrame';
import { cn, relTime } from '@/lib/utils';
import type { WidgetProps } from './types';

const sevTone = (s: string): 'red' | 'amber' | 'slate' => (s === 'Critical' ? 'red' : s === 'Warning' ? 'amber' : 'slate');

const TYPE_COLORS: Record<string, string> = {
  Predictive: '#6366f1',
  Threshold: '#f59e0b',
  Tracking: '#ef4444',
  Geofence: '#f97316',
  Anomaly: '#8b5cf6',
  Device: '#94a3b8',
};

/** Unresolved alerts, most severe first — the operations triage list. */
export function AlertsToTriage({ summary }: WidgetProps) {
  const rows = summary.lists.alertsToTriage ?? [];

  return (
    <WidgetFrame
      title="Alerts to triage"
      subtitle={rows.length ? 'most severe first' : undefined}
      icon="🚨"
      href="/alerts"
      linkLabel="Alert center"
    >
      {rows.length === 0 ? (
        <WidgetEmpty>Nothing unresolved — the estate is quiet.</WidgetEmpty>
      ) : (
        <WidgetTable
          columns={['Alert', 'Severity', 'Status', 'Raised']}
          rows={rows}
          keyOf={(a) => a.id}
          renderRow={(a) => (
            <>
              <td className={TD}>
                <Link to={`/alerts/${a.id}`} className="font-medium text-slate-900 hover:text-primary-600">
                  {a.title}
                </Link>
                <div className="text-xs text-slate-400">{a.assetName ? `${a.assetName} · ${a.type}` : a.type}</div>
              </td>
              <td className={TD}>
                <Badge tone={sevTone(a.severity)}>{a.severity}</Badge>
              </td>
              <td className={cn(TD, 'text-slate-500')}>{a.status}</td>
              <td className={cn(TD, 'text-xs text-slate-400')}>{relTime(a.createdAt)}</td>
            </>
          )}
        />
      )}
    </WidgetFrame>
  );
}

/** What is generating the noise — the shape of the alert stream, not its volume. */
export function AlertsByType({ summary }: WidgetProps) {
  const rows = (summary.charts.alertsByType ?? []).map((t) => ({
    label: t.label,
    value: t.value,
    color: TYPE_COLORS[t.label] ?? '#94a3b8',
  }));

  return (
    <WidgetFrame title="Alerts by type" icon="📶" href="/alert-rules" linkLabel="Rules">
      {rows.length === 0 ? (
        <WidgetEmpty>No alerts have been raised in this scope.</WidgetEmpty>
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <HBars data={rows} />
        </div>
      )}
    </WidgetFrame>
  );
}

/** Certifications lapsing soon — the compliance clock nobody watches until it rings. */
export function ExpiringCerts({ summary }: WidgetProps) {
  const rows = summary.lists.expiringCerts ?? [];

  return (
    <WidgetFrame
      title="Certifications expiring"
      subtitle="next 90 days"
      icon="🎖️"
      href="/certifications"
      linkLabel="Certifications"
    >
      {rows.length === 0 ? (
        <WidgetEmpty>Nothing lapses in the next 90 days.</WidgetEmpty>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-slate-50">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">{c.name}</div>
                <div className="truncate text-xs text-slate-400">{c.assetName}</div>
              </div>
              <span
                className={cn(
                  'shrink-0 text-xs font-semibold tabular-nums',
                  c.daysLeft < 0 ? 'text-health-critical' : c.daysLeft <= 30 ? 'text-amber-600' : 'text-slate-400',
                )}
              >
                {c.daysLeft < 0 ? `lapsed ${Math.abs(c.daysLeft)}d ago` : `${c.daysLeft}d left`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}
