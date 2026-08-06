import { Link } from 'react-router-dom';
import { WidgetEmpty, WidgetFrame } from '@/components/dashboards/WidgetFrame';
import { relTime } from '@/lib/utils';
import type { WidgetProps } from './types';

const ACTIVITY_ICON: Record<string, string> = {
  Movement: '🚚',
  Maintenance: '🔧',
  Custody: '🔗',
  Alert: '🚨',
  Inspection: '🔎',
  Registration: '➕',
};

/** What the estate has been doing — the append-only activity feed, newest first. */
export function RecentActivity({ summary }: WidgetProps) {
  const rows = summary.lists.recentActivity ?? [];

  return (
    <WidgetFrame title="Recent activity" icon="🕒" href="/audit-log" linkLabel="Audit log">
      {rows.length === 0 ? (
        <WidgetEmpty>Nothing has happened in this scope yet.</WidgetEmpty>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((event) => (
            <li key={event.id}>
              <Link
                to={event.assetId ? `/assets/${event.assetId}` : '/audit-log'}
                className="flex items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-slate-50"
              >
                <span className="mt-0.5 text-sm" aria-hidden>
                  {ACTIVITY_ICON[event.type] ?? '•'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs text-slate-600">{event.description}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {event.actor} · {relTime(event.timestamp)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}
