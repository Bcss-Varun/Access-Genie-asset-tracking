import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/features/auth/AuthProvider';
import { EmptyState, ErrorState, HealthBar, KpiCard, PageHeader, Skeleton } from '@/components/ui/primitives';
import { LinkButton } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { formatMoney, pluralize, relTime } from '@/lib/format';
import { dashboardApi } from './dashboard-api';
import { UtilizationChart } from './UtilizationChart';
import { CategoryChart } from './CategoryChart';

export function DashboardPage() {
  const session = useSession();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: dashboardApi.summary,
  });

  if (error) {
    return (
      <ErrorState
        title="Could not load your workspace"
        description={error instanceof ApiRequestError ? error.message : undefined}
        requestId={error instanceof ApiRequestError ? error.requestId : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good to see you, ${session.user.name.split(' ')[0]}`}
        subtitle={`${session.role.name} · ${session.user.title}`}
        actions={
          <>
            <LinkButton to="/tracking" variant="secondary" size="sm">
              🗺️ Live map
            </LinkButton>
            <LinkButton to="/assets/new" size="sm">
              ➕ Register asset
            </LinkButton>
          </>
        }
      />

      {/* ── KPI row ─────────────────────────────────────────────────────── */}
      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[104px]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Tracked assets"
            value={data.kpis.totalAssets.toLocaleString('en-IN')}
            sub={`${data.kpis.trackedPct}% bonded to a physical tag`}
            tone="primary"
            accent
          />
          <KpiCard
            label="Portfolio value"
            value={formatMoney(data.kpis.portfolioValue)}
            sub={`Avg health ${data.kpis.avgHealth} · utilization ${data.kpis.avgUtilization}%`}
          />
          <KpiCard
            label="Open work orders"
            value={data.kpis.openWorkOrders}
            sub={data.kpis.overdueWorkOrders > 0 ? `${data.kpis.overdueWorkOrders} overdue` : 'None overdue'}
            tone={data.kpis.overdueWorkOrders > 0 ? 'amber' : 'emerald'}
          />
          <KpiCard
            label="Open alerts"
            value={data.kpis.openAlerts}
            sub={
              data.kpis.missingAssets > 0
                ? `${pluralize(data.kpis.missingAssets, 'asset')} reported missing`
                : 'No assets missing'
            }
            tone={data.kpis.openAlerts > 0 ? 'red' : 'emerald'}
          />
        </div>
      )}

      {/* ── Charts ──────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass-panel p-5 lg:col-span-2">
          <h2 className="font-heading text-base font-semibold text-slate-800">Utilization vs. downtime</h2>
          <p className="text-xs text-slate-500 mt-0.5">Fleet average utilization against logged maintenance hours.</p>
          {isPending ? <Skeleton className="h-56 mt-4" /> : <UtilizationChart points={data.utilizationDowntime} />}
        </div>

        <div className="glass-panel p-5">
          <h2 className="font-heading text-base font-semibold text-slate-800">Portfolio mix</h2>
          <p className="text-xs text-slate-500 mt-0.5">Assets and value by category.</p>
          {isPending ? <Skeleton className="h-56 mt-4" /> : <CategoryChart breakdown={data.categoryBreakdown} />}
        </div>
      </div>

      {/* ── Risk + activity ─────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass-panel overflow-hidden">
          <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h2 className="font-heading text-base font-semibold text-slate-800">Highest risk assets</h2>
              <p className="text-xs text-slate-500 mt-0.5">Ranked by the predictive risk score.</p>
            </div>
            <Link to="/assets?sort=-riskScore" className="text-xs font-medium text-primary-600 hover:text-primary-700">
              View all
            </Link>
          </header>

          {isPending ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : data.topRisks.length === 0 ? (
            <EmptyState icon="✅" title="No assets at risk" description="Every asset is scoring within tolerance." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.topRisks.map((asset) => (
                <li key={asset.id}>
                  <Link to={`/assets/${asset.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800 truncate">{asset.name}</span>
                      <span className="block text-[11px] text-slate-400">
                        {asset.id} · {asset.category}
                      </span>
                    </span>
                    <HealthBar score={asset.healthScore} />
                    <span className="text-xs font-semibold text-health-critical tabular-nums w-12 text-right">
                      risk {asset.riskScore ?? '—'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass-panel overflow-hidden">
          <header className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-heading text-base font-semibold text-slate-800">Recent activity</h2>
            <p className="text-xs text-slate-500 mt-0.5">The asset graph's event stream, newest first.</p>
          </header>

          {isPending ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          ) : data.recentActivity.length === 0 ? (
            <EmptyState icon="🕓" title="No activity yet" description="Events appear here as assets move and change." />
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto">
              {data.recentActivity.map((event) => (
                <li key={event.id} className="px-5 py-3 flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary-400 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-700">{event.description}</span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">
                      <Link to={`/assets/${event.assetId}`} className="hover:text-primary-600">
                        {event.assetId}
                      </Link>
                      {' · '}
                      {event.actor} · {relTime(event.timestamp)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
