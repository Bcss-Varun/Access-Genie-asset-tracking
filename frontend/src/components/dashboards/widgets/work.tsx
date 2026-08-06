import { Link } from 'react-router-dom';
import type { DashboardWork } from '@access-genie/shared';
import { Badge } from '@/components/ui/primitives';
import { Funnel, TD, WidgetTable } from '@/components/dashboards/DashboardKit';
import { WidgetEmpty, WidgetFrame } from '@/components/dashboards/WidgetFrame';
import { cn, relTime } from '@/lib/utils';
import type { WidgetProps } from './types';

const prioTone = (p: string): 'red' | 'amber' | 'slate' => (p === 'Critical' ? 'red' : p === 'High' ? 'amber' : 'slate');

function WorkRows({ rows }: { rows: DashboardWork[] }) {
  return (
    <WidgetTable
      columns={['Work order', 'Asset', 'Priority', 'Due']}
      rows={rows}
      keyOf={(w) => w.id}
      renderRow={(w) => (
        <>
          <td className={TD}>
            <Link to={`/maintenance/${w.id}`} className="font-medium text-slate-900 hover:text-primary-600">
              {w.id}
            </Link>
            <div className="max-w-[16rem] truncate text-xs text-slate-400">{w.title}</div>
          </td>
          <td className={cn(TD, 'text-slate-600')}>{w.assetName}</td>
          <td className={TD}>
            <Badge tone={prioTone(w.priority)}>{w.priority}</Badge>
          </td>
          <td className={cn(TD, 'text-xs font-medium', w.overdue ? 'text-health-critical' : 'text-slate-500')}>
            {relTime(w.dueDate)}
            {w.overdue && <span className="ml-1 text-[10px] uppercase tracking-wide">overdue</span>}
          </td>
        </>
      )}
    />
  );
}

/**
 * The open work queue, soonest due first.
 *
 * Titled for what it actually contains. The screen this replaced called the
 * same list "Overdue & Urgent Work Orders" while showing everything open — the
 * overdue rows are now marked as such instead of the heading claiming it.
 */
export function WorkQueue({ summary }: WidgetProps) {
  const rows = summary.lists.overdueWork ?? [];
  const overdue = rows.filter((w) => w.overdue).length;

  return (
    <WidgetFrame
      title="Work queue"
      subtitle={overdue ? `${overdue} of ${rows.length} shown are overdue` : 'soonest due first'}
      icon="🔧"
      href="/maintenance"
      linkLabel="Work orders"
    >
      {rows.length === 0 ? <WidgetEmpty>No open work orders in this scope.</WidgetEmpty> : <WorkRows rows={rows} />}
    </WidgetFrame>
  );
}

/** The signed-in person's own queue — the whole dashboard for a field role. */
export function MyWork({ summary }: WidgetProps) {
  const rows = summary.lists.myWork ?? [];

  return (
    <WidgetFrame title="My work" subtitle="assigned to me" icon="🧰" href="/my-work" linkLabel="My queue">
      {rows.length === 0 ? (
        <WidgetEmpty>Nothing is assigned to you right now.</WidgetEmpty>
      ) : (
        <ul className="space-y-2">
          {rows.map((w) => (
            <li key={w.id}>
              <Link
                to={`/maintenance/${w.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-2.5 transition-colors hover:border-primary-300 hover:bg-slate-50/70"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">{w.title}</div>
                  <div className="text-xs text-slate-400">
                    {w.assetName} · {w.status}
                  </div>
                </div>
                <span
                  className={cn(
                    'shrink-0 text-xs font-medium',
                    w.overdue ? 'text-health-critical' : 'text-slate-400',
                  )}
                >
                  {relTime(w.dueDate)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

const PIPELINE_COLORS: Record<string, string> = {
  New: '#ef4444',
  Assigned: '#f59e0b',
  'In Progress': '#6366f1',
  Completed: '#10b981',
};

/** Where the work is: new → assigned → in progress → done. */
export function WoPipeline({ summary }: WidgetProps) {
  const stages = (summary.charts.woPipeline ?? []).map((s) => ({
    label: s.label,
    value: s.value,
    color: PIPELINE_COLORS[s.label] ?? '#94a3b8',
  }));
  const total = stages.reduce((s, x) => s + x.value, 0);

  return (
    <WidgetFrame
      title="Work-order pipeline"
      subtitle={`${total} order${total === 1 ? '' : 's'} in scope`}
      icon="📊"
      href="/maintenance"
      linkLabel="Board"
    >
      {total === 0 ? (
        <WidgetEmpty>No work orders have been raised in this scope.</WidgetEmpty>
      ) : (
        <div className="flex flex-1 flex-col justify-center py-2">
          <Funnel stages={stages} />
        </div>
      )}
    </WidgetFrame>
  );
}
