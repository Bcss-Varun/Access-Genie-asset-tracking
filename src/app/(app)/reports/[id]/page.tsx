'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { getReport, mockAssets } from '@/lib/mock-data';
import { UtilizationDowntimeChart, ValueByCategoryDonut } from '@/components/charts/DashboardCharts';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { formatMoney, relTime } from '@/lib/utils';

// Deterministic display value for a metric name (stable across renders/builds).
function metricValue(name: string, seed: number): string {
  const n = name.toLowerCase();
  const h = Array.from(name).reduce((a, c) => a + c.charCodeAt(0), seed);
  if (n.includes('value') || n.includes('tco') || n.includes('exposure') || n.includes('savings') || n.includes('$'))
    return formatMoney(120_000 + (h % 90) * 41_000);
  if (n.includes('%') || n.includes('utilization') || n.includes('compliance') || n.includes('coverage'))
    return `${62 + (h % 34)}%`;
  if (n.includes('mttr')) return `${2 + (h % 6)}.${h % 10}h`;
  if (n.includes('mtbf')) return `${180 + (h % 120)}h`;
  if (n.includes('index')) return `${(h % 100)}`;
  if (n.includes('age')) return `${4 + (h % 20)}d`;
  return `${12 + (h % 240)}`;
}

const wantsUtilChart = (category: string) => ['Utilization', 'Maintenance', 'AI'].includes(category);

export default function ReportViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const report = getReport(id);

  const rows = useMemo(() => {
    const map = new Map<string, { count: number; value: number; util: number; health: number }>();
    for (const a of mockAssets) {
      const cur = map.get(a.category) ?? { count: 0, value: 0, util: 0, health: 0 };
      cur.count += 1;
      cur.value += a.bookValue ?? 0;
      cur.util += a.utilization ?? 0;
      cur.health += a.healthScore;
      map.set(a.category, cur);
    }
    return Array.from(map.entries())
      .map(([category, v]) => ({
        category,
        count: v.count,
        value: v.value,
        util: Math.round(v.util / v.count),
        health: Math.round(v.health / v.count),
      }))
      .sort((a, b) => b.value - a.value);
  }, []);

  if (!report) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <EmptyState
          icon="📄"
          title="Report not found"
          description={`No report with id “${id}” exists in this session.`}
          action={<Link href="/reports"><Button variant="outline">← Back to Report Library</Button></Link>}
        />
      </div>
    );
  }

  const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';
  const td = 'px-4 py-3.5';

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={report.name}
        subtitle={`${report.description}`}
        breadcrumb={[
          { label: 'Analytics', href: '/reports' },
          { label: 'Reports', href: '/reports' },
          { label: report.name },
        ]}
        actions={
          <>
            <Button variant="outline" onClick={() => toast({ title: 'Export started', description: `Generating ${report.format} of “${report.name}”…`, tone: 'info' })}>
              Export
            </Button>
            <Button variant="outline" onClick={() => toast({ title: 'Schedule updated', description: `“${report.name}” will run automatically.`, tone: 'success' })}>
              Schedule
            </Button>
            <Button onClick={() => toast({ title: 'Subscribed', description: `You’ll receive “${report.name}” by email.`, tone: 'success' })}>
              Subscribe
            </Button>
          </>
        }
      />

      <div className="glass-panel rounded-xl p-4 flex flex-wrap items-center gap-3 text-sm">
        <Badge tone="primary">{report.category}</Badge>
        <span className="text-slate-500">{report.format}</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-500">{report.persona}</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-500">Last run {relTime(report.lastRun)}</span>
        {report.scheduled && <Badge tone="emerald" className="ml-auto">Scheduled</Badge>}
      </div>

      {/* KPI tiles from the report's metrics (capped at 4) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {report.metrics.slice(0, 4).map((m, i) => (
          <div key={m} className="glass-panel rounded-xl p-5">
            <div className="text-sm font-medium text-slate-500 mb-1">{m}</div>
            <div className="text-2xl font-bold font-heading text-slate-900">{metricValue(m, i * 7 + 3)}</div>
          </div>
        ))}
      </div>

      {/* Rendered chart body */}
      <div className="glass-panel rounded-xl p-5">
        <h2 className="text-base font-semibold text-slate-800 mb-4">
          {wantsUtilChart(report.category) ? 'Utilization & Downtime Trend' : 'Portfolio Value by Category'}
        </h2>
        {wantsUtilChart(report.category) ? <UtilizationDowntimeChart /> : <ValueByCategoryDonut />}
      </div>

      {/* Data table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Breakdown by Category</h2>
          <span className="text-xs text-slate-400">{rows.length} categories · {mockAssets.length} assets</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className={th}>Category</th>
                <th className={th}>Assets</th>
                <th className={th}>Book Value</th>
                <th className={th}>Avg Utilization</th>
                <th className={th}>Avg Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.category} className="hover:bg-slate-50 transition-colors">
                  <td className={td}><span className="font-medium text-slate-900">{r.category}</span></td>
                  <td className={td}>{r.count}</td>
                  <td className={td}>{formatMoney(r.value)}</td>
                  <td className={td}>{r.util}%</td>
                  <td className={td}>{r.health}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
