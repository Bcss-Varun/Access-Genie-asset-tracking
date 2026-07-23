'use client';

import Link from 'next/link';
import { useSession } from '@/components/providers/SessionProvider';
import { useScope } from '@/components/providers/ScopeProvider';
import { KpiCard, Badge } from '@/components/ui/primitives';
import { mockAssets, mockWorkOrders, mockInsights } from '@/lib/mock-data';
import { relTime } from '@/lib/utils';

const quickActions = [
  { label: 'Asset Registry', href: '/assets', icon: '📦' },
  { label: 'Live Tracking', href: '/tracking', icon: '🗺️' },
  { label: 'Work Orders', href: '/maintenance', icon: '🔧' },
  { label: 'AI Insights', href: '/ai-insights', icon: '✨' },
  { label: 'Dashboards', href: '/dashboards', icon: '📊' },
  { label: 'Ask Copilot', href: '/copilot', icon: '🤖' },
];

const severityTone = { Critical: 'red', Warning: 'amber', Opportunity: 'emerald', Info: 'primary' } as const;

export default function WorkspacePage() {
  const { session } = useSession();
  const { scope } = useScope();
  const firstName = session.user.name.split(' ')[0];

  const openWOs = mockWorkOrders.filter((w) => w.status !== 'Completed');
  const criticalAlerts = mockInsights.filter((i) => i.severity === 'Critical').length;
  const topInsights = mockInsights.slice(0, 3);
  const topWork = openWOs.slice(0, 5);

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight text-slate-900">
          Good morning, {firstName}
        </h1>
        <p className="text-slate-500 mt-1">
          Here&apos;s what&apos;s happening across <span className="font-medium text-slate-700">{scope.name}</span> ·
          viewing as {session.role.name}.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Assets in Scope" value={(scope.assetCount ?? 14205).toLocaleString()} sub={<span>↑ 2.4% vs last month</span>} tone="emerald" />
        <KpiCard label="Open Work Orders" value={openWOs.length} sub={<span>{openWOs.filter((w) => w.priority === 'Critical').length} critical</span>} tone="amber" />
        <KpiCard label="Critical Alerts" value={criticalAlerts} sub={<span>needs attention</span>} tone="red" />
        <KpiCard label="AI Health Score" value={<>92<span className="text-lg text-slate-400">/100</span></>} sub={<span>Optimal state</span>} tone="emerald" accent />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Left: insights + work */}
        <div className="lg:col-span-2 space-y-6">
          <section className="glass-panel rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold font-heading text-slate-800">Top AI Insights</h2>
              <Link href="/ai-insights" className="text-xs font-medium text-primary-600 hover:underline">View all →</Link>
            </div>
            <div className="space-y-3">
              {topInsights.map((ins) => (
                <Link key={ins.id} href="/ai-insights" className="block rounded-lg border border-slate-200 p-4 hover:border-primary-300 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge tone={severityTone[ins.severity]}>{ins.type}</Badge>
                    <span className="text-xs text-slate-400">{ins.confidence}% confidence</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800">{ins.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{ins.summary}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="glass-panel rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold font-heading text-slate-800">Open Work Orders</h2>
              <Link href="/maintenance" className="text-xs font-medium text-primary-600 hover:underline">Go to board →</Link>
            </div>
            <div className="divide-y divide-slate-100">
              {topWork.map((wo) => (
                <Link key={wo.id} href="/maintenance" className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50/60 -mx-2 px-2 rounded-lg transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{wo.title}</div>
                    <div className="text-xs text-slate-400">{wo.assetName} · {wo.assignedTo}</div>
                  </div>
                  <Badge tone={wo.priority === 'Critical' ? 'red' : wo.priority === 'High' ? 'amber' : 'slate'}>{wo.priority}</Badge>
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* Right: quick actions + attention */}
        <div className="space-y-6">
          <section className="glass-panel rounded-xl p-6">
            <h2 className="text-base font-semibold font-heading text-slate-800 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((a) => (
                <Link key={a.href} href={a.href} className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-4 text-center hover:border-primary-300 hover:bg-primary-50/40 transition-colors">
                  <span className="text-xl">{a.icon}</span>
                  <span className="text-xs font-medium text-slate-600">{a.label}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="glass-panel rounded-xl p-6">
            <h2 className="text-base font-semibold font-heading text-slate-800 mb-4">Needs Attention</h2>
            <div className="space-y-2">
              {[...mockAssets].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)).slice(0, 4).map((a) => (
                <Link key={a.id} href={`/assets/${a.id}`} className="flex items-center justify-between gap-2 rounded-lg p-2 hover:bg-slate-50 transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{a.name}</div>
                    <div className="text-xs text-slate-400">{a.location.name} · {relTime(a.telemetry?.lastPing ?? '')}</div>
                  </div>
                  <span className={`text-sm font-bold ${(a.riskScore ?? 0) > 70 ? 'text-health-critical' : (a.riskScore ?? 0) > 40 ? 'text-health-warning' : 'text-health-good'}`}>
                    {a.riskScore ?? 0}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
