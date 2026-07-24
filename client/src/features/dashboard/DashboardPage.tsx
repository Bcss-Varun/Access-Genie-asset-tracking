import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/features/auth/AuthProvider';
import { useScope } from '@/components/providers/ScopeProvider';
import { Badge, ErrorState, KpiCard, Skeleton } from '@/components/ui/primitives';
import { ApiRequestError } from '@/lib/api-client';
import type { Tone } from '@/lib/tone';
import { dashboardApi } from './dashboard-api';
import { insightsApi } from '@/features/insights/insights-api';
import { maintenanceApi } from '@/features/maintenance/maintenance-api';

// ─────────────────────────────────────────────────────────────────────────────
// Flagship capabilities — the demo spotlight. Each pillar deep-links to the
// live workflow that demonstrates it.
// ─────────────────────────────────────────────────────────────────────────────
interface Feature {
  title: string;
  blurb: string;
  to: string;
  icon: string;
  accent: string;
  tint: string;
  tags?: { label: string; id: string }[];
}

const FLAGSHIP_FEATURES: Feature[] = [
  {
    title: 'Real-Time Asset Tracking',
    blurb: 'Live RTLS positioning across the floor-plan with multi-technology tag support.',
    to: '/tracking',
    icon: '🛰️',
    accent: '#0ea5e9',
    tint: 'rgba(14,165,233,0.12)',
    tags: [
      { label: 'RFID', id: 'E2801160' },
      { label: 'BLE', id: 'C3:9A:6F' },
      { label: 'GPS', id: '37.77,-122.41' },
      { label: 'QR', id: 'AG-QR-1001' },
      { label: 'UWB', id: 'ANCH-04' },
    ],
  },
  {
    title: 'AI Asset Intelligence & Utilization',
    blurb: 'Ranked, explainable AI insights and utilization analytics across the whole fleet.',
    to: '/ai-insights',
    icon: '✨',
    accent: '#6366f1',
    tint: 'rgba(99,102,241,0.12)',
  },
  {
    title: 'Digital Asset Passport & Lifecycle',
    blurb: 'A complete passport per asset — procurement, service history and end-of-life.',
    to: '/lifecycle',
    icon: '🪪',
    accent: '#10b981',
    tint: 'rgba(16,185,129,0.12)',
  },
  {
    title: 'Predictive Maintenance & Auto Work Orders',
    blurb: 'Failure predictions that auto-generate prioritized work orders before downtime.',
    to: '/maintenance',
    icon: '🔧',
    accent: '#f59e0b',
    tint: 'rgba(245,158,11,0.12)',
  },
  {
    title: 'Security, Geo-fencing & Compliance',
    blurb: 'Geofenced zones, custody exceptions and audit-ready compliance monitoring.',
    to: '/geofences',
    icon: '🛡️',
    accent: '#ef4444',
    tint: 'rgba(239,68,68,0.12)',
  },
  {
    title: 'Mobile Workforce Enablement',
    blurb: 'Field-ops tooling to scan, check in / out and close work from any device.',
    to: '/field-ops',
    icon: '📱',
    accent: '#14b8a6',
    tint: 'rgba(20,184,166,0.12)',
  },
];

const QUICK_ACTIONS = [
  { label: 'Real-Time Tracking', to: '/tracking', icon: '🗺️' },
  { label: 'AI Asset Intelligence', to: '/ai-insights', icon: '✨' },
  { label: 'Digital Passports & Lifecycle', to: '/lifecycle', icon: '♻️' },
  { label: 'Predictive Maintenance', to: '/maintenance', icon: '🔧' },
  { label: 'Security & Compliance', to: '/compliance-reports', icon: '🛡️' },
  { label: 'Mobile Workforce', to: '/field-ops', icon: '📱' },
];

const SEVERITY_TONE: Record<string, Tone> = {
  Critical: 'red',
  Warning: 'amber',
  Opportunity: 'emerald',
  Info: 'primary',
};

/** Greeting that matches the wall clock rather than always saying "morning". */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The workspace home.
 *
 * Same layout as the prototype, but every figure is read from the API rather
 * than from a fixture: the KPIs, the insight feed, the work-order queue and the
 * risk list all reflect the live database, so an asset registered a minute ago
 * is counted here.
 */
export function DashboardPage() {
  const session = useSession();
  const { scope } = useScope();
  const firstName = session.user.name.split(' ')[0];

  const summaryQuery = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: dashboardApi.summary });
  const insightsQuery = useQuery({ queryKey: ['insights', { limit: 3 }], queryFn: () => insightsApi.list({ limit: 3 }) });
  const insightStatsQuery = useQuery({ queryKey: ['insights', 'stats'], queryFn: insightsApi.stats });
  const workQuery = useQuery({
    queryKey: ['work-orders', { open: true, limit: 5 }],
    queryFn: () => maintenanceApi.list({ status: 'New,Assigned,In Progress,On Hold', limit: 5, sort: 'dueDate' }),
  });

  if (summaryQuery.error) {
    return (
      <ErrorState
        title="Could not load your workspace"
        description={summaryQuery.error instanceof ApiRequestError ? summaryQuery.error.message : undefined}
        requestId={summaryQuery.error instanceof ApiRequestError ? summaryQuery.error.requestId : undefined}
        onRetry={() => void summaryQuery.refetch()}
      />
    );
  }

  const kpis = summaryQuery.data?.kpis;
  const criticalInsights = insightStatsQuery.data?.critical ?? 0;
  // "Assets in scope" follows the scope switcher; the org node carries the
  // rolled-up count, which is what a scoped view should show.
  const assetsInScope = scope.assetCount ?? kpis?.totalAssets ?? 0;

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight text-slate-900">
          {greeting()}, {firstName}
        </h1>
        <p className="text-slate-500 mt-1">
          Here&apos;s what&apos;s happening across <span className="font-medium text-slate-700">{scope.name}</span> ·
          viewing as {session.role.name}.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryQuery.isPending ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px]" />)
        ) : (
          <>
            <KpiCard
              label="Assets in Scope"
              value={assetsInScope.toLocaleString('en-IN')}
              sub={<span>{kpis?.trackedPct ?? 0}% bonded to a tag</span>}
              tone="emerald"
            />
            <KpiCard
              label="Open Work Orders"
              value={kpis?.openWorkOrders ?? 0}
              sub={<span>{kpis?.overdueWorkOrders ?? 0} overdue</span>}
              tone="amber"
            />
            <KpiCard
              label="Critical Alerts"
              value={kpis?.openAlerts ?? 0}
              sub={<span>{criticalInsights} critical AI findings</span>}
              tone="red"
            />
            <KpiCard
              label="AI Health Score"
              value={
                <>
                  {kpis?.avgHealth ?? 0}
                  <span className="text-lg text-slate-400">/100</span>
                </>
              }
              sub={<span>{(kpis?.avgHealth ?? 0) >= 85 ? 'Optimal state' : 'Attention advised'}</span>}
              tone={(kpis?.avgHealth ?? 0) >= 85 ? 'emerald' : 'amber'}
              accent
            />
          </>
        )}
      </div>

      {/* Flagship capabilities — demo spotlight */}
      <section className="glass-panel rounded-xl p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold font-heading text-slate-800">Flagship Capabilities</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              The six pillars of Access Genie — jump straight into any live workflow.
            </p>
          </div>
          <Badge tone="primary">Demo spotlight</Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {FLAGSHIP_FEATURES.map((feature) => (
            <Link
              key={feature.to}
              to={feature.to}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white/70 p-4 hover:border-primary-300 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: feature.accent }} />
              <div className="flex items-start gap-3 pl-1.5">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl"
                  style={{ backgroundColor: feature.tint, color: feature.accent }}
                >
                  {feature.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-800 leading-snug">{feature.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{feature.blurb}</p>

                  {feature.tags && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {feature.tags.map((tag) => (
                        <span
                          key={tag.label}
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] tracking-wide"
                          style={{ backgroundColor: feature.tint, color: feature.accent }}
                          title={`${tag.label} tag id`}
                        >
                          <span className="font-semibold">{tag.label}</span>
                          <span className="font-mono opacity-80">{tag.id}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-400 group-hover:text-primary-600 transition-colors">
                    Explore <span aria-hidden>→</span>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Left: insights + work */}
        <div className="lg:col-span-2 space-y-6">
          <section className="glass-panel rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold font-heading text-slate-800">Top AI Insights</h2>
              <Link to="/ai-insights" className="text-xs font-medium text-primary-600 hover:underline">
                View all →
              </Link>
            </div>

            <div className="space-y-3">
              {insightsQuery.isPending ? (
                Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20" />)
              ) : insightsQuery.data?.items.length ? (
                insightsQuery.data.items.map((insight) => (
                  <Link
                    key={insight.id}
                    to="/ai-insights"
                    className="block rounded-lg border border-slate-200 p-4 hover:border-primary-300 hover:bg-slate-50/60 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone={SEVERITY_TONE[insight.severity] ?? 'slate'}>{insight.type}</Badge>
                      <span className="text-xs text-slate-400">{insight.confidence}% confidence</span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800">{insight.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{insight.summary}</p>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-slate-400 py-6 text-center">No open insights — the models have nothing outstanding.</p>
              )}
            </div>
          </section>

          <section className="glass-panel rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold font-heading text-slate-800">Open Work Orders</h2>
              <Link to="/maintenance" className="text-xs font-medium text-primary-600 hover:underline">
                Go to board →
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {workQuery.isPending ? (
                Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10 my-2" />)
              ) : workQuery.data?.items.length ? (
                workQuery.data.items.map((wo) => (
                  <Link
                    key={wo.id}
                    to={`/maintenance/${wo.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50/60 -mx-2 px-2 rounded-lg transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{wo.title}</div>
                      <div className="text-xs text-slate-400">
                        {wo.assetName} · {wo.assignedTo}
                      </div>
                    </div>
                    <Badge tone={wo.priority === 'Critical' ? 'red' : wo.priority === 'High' ? 'amber' : 'slate'}>
                      {wo.priority}
                    </Badge>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-slate-400 py-6 text-center">Nothing open — the board is clear.</p>
              )}
            </div>
          </section>
        </div>

        {/* Right: quick actions + attention */}
        <div className="space-y-6">
          <section className="glass-panel rounded-xl p-6">
            <h2 className="text-base font-semibold font-heading text-slate-800 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-4 text-center hover:border-primary-300 hover:bg-primary-50/40 transition-colors"
                >
                  <span className="text-xl">{action.icon}</span>
                  <span className="text-xs font-medium text-slate-600">{action.label}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="glass-panel rounded-xl p-6">
            <h2 className="text-base font-semibold font-heading text-slate-800 mb-4">Needs Attention</h2>
            <div className="space-y-2">
              {summaryQuery.isPending ? (
                Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12" />)
              ) : summaryQuery.data?.topRisks.length ? (
                summaryQuery.data.topRisks.slice(0, 4).map((asset) => (
                  <Link
                    key={asset.id}
                    to={`/assets/${asset.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg p-2 hover:bg-slate-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{asset.name}</div>
                      <div className="text-xs text-slate-400">
                        {asset.category} · health {asset.healthScore}
                      </div>
                    </div>
                    <span
                      className={
                        (asset.riskScore ?? 0) > 70
                          ? 'text-sm font-bold text-health-critical'
                          : (asset.riskScore ?? 0) > 40
                            ? 'text-sm font-bold text-health-warning'
                            : 'text-sm font-bold text-health-good'
                      }
                    >
                      {asset.riskScore ?? 0}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-slate-400 py-6 text-center">Nothing at risk right now.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
