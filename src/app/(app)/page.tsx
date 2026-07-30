'use client';

import Link from 'next/link';
import { useSession } from '@/components/providers/SessionProvider';
import { useScope } from '@/components/providers/ScopeProvider';
import { KpiCard, Badge } from '@/components/ui/primitives';
import { mockAssets, mockWorkOrders, mockInsights } from '@/lib/mock-data';
import { relTime } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Flagship capabilities — the demo spotlight. Each pillar deep-links to the
// live workflow that demonstrates it.
// ─────────────────────────────────────────────────────────────────────────────
type TrackingTag = { label: string; id: string };
type Feature = {
  title: string;
  blurb: string;
  href: string;
  icon: string;
  accent: string;
  tint: string;
  tags?: TrackingTag[];
};

const flagshipFeatures: Feature[] = [
  {
    title: 'Real-Time Asset Tracking',
    blurb: 'Live RTLS positioning across the floor-plan with multi-technology tag support.',
    href: '/tracking',
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
    href: '/ai-insights',
    icon: '✨',
    accent: '#6366f1',
    tint: 'rgba(99,102,241,0.12)',
  },
  {
    title: 'Digital Asset Passport & Lifecycle',
    blurb: 'A complete passport per asset — procurement, service history and end-of-life.',
    href: '/lifecycle',
    icon: '🪪',
    accent: '#10b981',
    tint: 'rgba(16,185,129,0.12)',
  },
  {
    title: 'Predictive Maintenance & Auto Work Orders',
    blurb: 'Failure predictions that auto-generate prioritized work orders before downtime.',
    href: '/maintenance',
    icon: '🔧',
    accent: '#f59e0b',
    tint: 'rgba(245,158,11,0.12)',
  },
  {
    title: 'Security, Geo-fencing & Compliance',
    blurb: 'Geofenced zones, custody exceptions and audit-ready compliance monitoring.',
    href: '/compliance-reports',
    icon: '🛡️',
    accent: '#ef4444',
    tint: 'rgba(239,68,68,0.12)',
  },
  {
    title: 'Mobile Workforce Enablement',
    blurb: 'Field-ops tooling to scan, check in / out and close work from any device.',
    href: '/field-ops',
    icon: '📱',
    accent: '#14b8a6',
    tint: 'rgba(20,184,166,0.12)',
  },
];

const quickActions = [
  { label: 'Asset Tracking', href: '/tracking', icon: '🗺️' },
  { label: 'AI Asset Intelligence', href: '/ai-insights', icon: '✨' },
  { label: 'Digital Passports & Lifecycle', href: '/lifecycle', icon: '♻️' },
  { label: 'Predictive Maintenance', href: '/maintenance', icon: '🔧' },
  { label: 'Security & Compliance', href: '/compliance-reports', icon: '🛡️' },
  { label: 'Mobile Workforce', href: '/field-ops', icon: '📱' },
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

      {/* Flagship capabilities — demo spotlight */}
      <section className="glass-panel rounded-xl p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold font-heading text-slate-800">Flagship Capabilities</h2>
            <p className="text-xs text-slate-500 mt-0.5">The six pillars of Access Genie — jump straight into any live workflow.</p>
          </div>
          <Badge tone="primary">Demo spotlight</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {flagshipFeatures.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white/70 p-4 hover:border-primary-300 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: f.accent }} />
              <div className="flex items-start gap-3 pl-1.5">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl"
                  style={{ backgroundColor: f.tint, color: f.accent }}
                >
                  {f.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-800 leading-snug">{f.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{f.blurb}</p>
                  {f.tags && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {f.tags.map((t) => (
                        <span
                          key={t.label}
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] tracking-wide"
                          style={{ backgroundColor: f.tint, color: f.accent }}
                          title={`${t.label} tag id`}
                        >
                          <span className="font-semibold">{t.label}</span>
                          <span className="font-mono opacity-80">{t.id}</span>
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
