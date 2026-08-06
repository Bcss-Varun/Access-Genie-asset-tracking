import { Link } from 'react-router-dom';
import { HBars, TD, WidgetTable, riskBar, riskTone } from '@/components/dashboards/DashboardKit';
import { categoryEmoji } from '@/lib/asset-categories';
import { WidgetEmpty, WidgetFrame } from '@/components/dashboards/WidgetFrame';
import { Badge } from '@/components/ui/primitives';
import { allAssets } from '@/lib/dataset';
import { cn, formatMoney, nowMs, relTime } from '@/lib/utils';
import type { WidgetProps } from './types';

const STATUS_COLORS: Record<string, string> = {
  Active: '#10b981',
  Maintenance: '#f59e0b',
  Idle: '#94a3b8',
  Missing: '#ef4444',
  Retired: '#64748b',
  Storage: '#6366f1',
};

/** The assets carrying the most risk, worst first. */
export function TopRisks({ summary }: WidgetProps) {
  const rows = summary.lists.topRisks ?? [];

  return (
    <WidgetFrame title="Top risk assets" icon="⚠️" href="/ai-insights" linkLabel="Risk & health">
      {rows.length === 0 ? (
        <WidgetEmpty>
          No assets in this scope —{' '}
          <Link to="/assets/new" className="font-medium text-primary-600 hover:underline">
            register one
          </Link>
          .
        </WidgetEmpty>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((a) => (
            <li key={a.id}>
              <Link
                to={`/assets/${a.id}`}
                className="flex items-center justify-between gap-3 rounded-lg p-2 transition-colors hover:bg-slate-50"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-base">
                    {categoryEmoji(a.category)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">{a.name}</div>
                    <div className="truncate text-xs text-slate-400">
                      {a.id}
                      {a.location ? ` · ${a.location}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="hidden h-2 w-16 overflow-hidden rounded-full bg-slate-100 sm:block">
                    <span
                      className={cn('block h-full rounded-full', riskBar(a.riskScore ?? 0))}
                      style={{ width: `${a.riskScore ?? 0}%` }}
                    />
                  </span>
                  <span className={cn('text-sm font-semibold tabular-nums', riskTone(a.riskScore ?? 0))}>
                    {a.riskScore ?? 0}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

/** What state the estate is in — active, down, missing, idle. */
export function EstateStatus({ summary }: WidgetProps) {
  const rows = (summary.charts.statusMix ?? []).map((s) => ({
    label: s.status,
    value: s.count,
    color: STATUS_COLORS[s.status] ?? '#94a3b8',
  }));
  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <WidgetFrame
      title="Estate status"
      subtitle={`${total} asset${total === 1 ? '' : 's'} in scope`}
      icon="📦"
      href="/assets"
      linkLabel="Registry"
    >
      {total === 0 ? (
        <WidgetEmpty>No assets in this scope.</WidgetEmpty>
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <HBars data={rows} />
        </div>
      )}
    </WidgetFrame>
  );
}

/** The portfolio's shape by category — count and value together. */
export function CategoryMix({ summary }: WidgetProps) {
  const rows = summary.charts.categoryBreakdown ?? [];

  return (
    <WidgetFrame title="Portfolio by category" icon="🗂️" href="/assets" linkLabel="Registry">
      {rows.length === 0 ? (
        <WidgetEmpty>No assets in this scope.</WidgetEmpty>
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <HBars
            data={rows.map((c) => ({
              label: `${categoryEmoji(c.category)} ${c.category}`,
              value: c.count,
              caption: formatMoney(c.value),
            }))}
          />
        </div>
      )}
    </WidgetFrame>
  );
}

/** Where things physically are, by the location recorded on the asset. */
export function LocationMix() {
  const byLocation = new Map<string, number>();
  for (const a of allAssets) {
    const name = a.location?.name ?? 'Unassigned';
    byLocation.set(name, (byLocation.get(name) ?? 0) + 1);
  }
  const rows = [...byLocation.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return (
    <WidgetFrame title="Where things are" icon="📍" href="/tracking" linkLabel="Live tracking">
      {rows.length === 0 ? (
        <WidgetEmpty>Nothing located in this scope.</WidgetEmpty>
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <HBars data={rows} barClassName="bg-primary-400" />
        </div>
      )}
    </WidgetFrame>
  );
}

const daysTo = (iso?: string) => (iso ? Math.round((Date.parse(iso) - nowMs()) / 86_400_000) : Infinity);

/** Warranties and lifecycle stages about to become someone's problem. */
export function EolWatch() {
  const rows = allAssets
    .map((a) => ({ a, days: daysTo(a.warrantyExpiry) }))
    .filter(({ a, days }) => days <= 90 || a.lifecycleStage === 'EOL Planning')
    .sort((x, y) => x.days - y.days)
    .slice(0, 6);

  return (
    <WidgetFrame
      title="Warranty & end-of-life"
      subtitle="within 90 days"
      icon="♻️"
      href="/lifecycle"
      linkLabel="Lifecycle"
    >
      {rows.length === 0 ? (
        <WidgetEmpty>Nothing expiring in the next 90 days.</WidgetEmpty>
      ) : (
        <WidgetTable
          columns={['Asset', 'Stage', 'Warranty', 'Book value']}
          rows={rows}
          keyOf={({ a }) => a.id}
          renderRow={({ a, days }) => (
            <>
              <td className={TD}>
                <Link to={`/assets/${a.id}`} className="font-medium text-slate-900 hover:text-primary-600">
                  {a.name}
                </Link>
                <div className="text-xs text-slate-400">{a.id}</div>
              </td>
              <td className={TD}>
                <Badge tone={a.lifecycleStage === 'EOL Planning' ? 'red' : 'slate'}>{a.lifecycleStage}</Badge>
              </td>
              <td className={cn(TD, 'text-xs font-medium', days < 0 ? 'text-health-critical' : 'text-amber-600')}>
                {a.warrantyExpiry ? (days < 0 ? `lapsed ${relTime(a.warrantyExpiry)}` : `${days}d left`) : 'not recorded'}
              </td>
              <td className={cn(TD, 'tabular-nums text-slate-700')}>{formatMoney(a.bookValue ?? 0)}</td>
            </>
          )}
        />
      )}
    </WidgetFrame>
  );
}
