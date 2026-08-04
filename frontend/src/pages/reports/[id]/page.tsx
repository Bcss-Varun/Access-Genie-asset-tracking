import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getReport, allAssets } from '@/lib/dataset';
import { UtilizationDowntimeChart, ValueByCategoryDonut } from '@/components/charts/DashboardCharts';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { useMutate } from '@/api/mutate';
import { reportRunApi } from '@/api/configuration';
import { reportsApi } from '@/api/platform';
import { resolveMetric } from '@/lib/report-metrics';
import { formatMoney, relTime } from '@/lib/utils';

const wantsUtilChart = (category: string) => ['Utilization', 'Maintenance', 'AI'].includes(category);

export default function ReportViewerPage() {
  const { id = '' } = useParams();
  const { toast } = useToast();
  const { run, isPending } = useMutate();
  const [running, setRunning] = useState(false);
  const report = getReport(id);

  const rows = useMemo(() => {
    const map = new Map<string, { count: number; value: number; util: number; health: number }>();
    for (const a of allAssets) {
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
          action={<Link to="/reports"><Button variant="outline">← Back to Report Library</Button></Link>}
        />
      </div>
    );
  }

  /** Run it and hand the file over — the same path the library's Run button uses. */
  const runReport = async () => {
    setRunning(true);
    try {
      const result = await run(reportRunApi.run(report.id), { describe: `run “${report.name}”` });
      if (!result) return;

      if (result.rowCount === 0) {
        toast({
          title: 'Nothing to report',
          description: 'It ran against an empty result set — there is no data in this category yet.',
          tone: 'info',
        });
        return;
      }

      await reportRunApi.download(result.job.id);
      toast({
        title: `${report.name} downloaded`,
        description: `${result.rowCount} row${result.rowCount === 1 ? '' : 's'} · ${result.job.format}`,
        tone: 'success',
      });
    } finally {
      setRunning(false);
    }
  };

  const toggleSchedule = () =>
    void run(reportsApi.update(report.id, { scheduled: !report.scheduled }), {
      success: report.scheduled ? 'Schedule removed' : 'Marked as scheduled',
      successDetail: report.scheduled ? undefined : 'Add recipients under Analytics ▸ Subscriptions to have it delivered.',
      describe: 'change that schedule',
    });

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
            <Button variant="outline" disabled={isPending} onClick={() => toggleSchedule()}>
              {report.scheduled ? 'Unschedule' : 'Schedule'}
            </Button>
            <Link to="/subscriptions">
              <Button variant="outline">Subscribe</Button>
            </Link>
            <Button disabled={running} onClick={() => void runReport()}>
              {running ? 'Running…' : 'Run & download'}
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

      {/*
        Each tile is a real query over the estate. A metric this platform does
        not measure says so rather than showing a number — see lib/report-metrics.
      */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {report.metrics.slice(0, 4).map((m) => {
          const resolved = resolveMetric(m);
          return (
            <div key={m} className="glass-panel rounded-xl p-5">
              <div className="mb-1 text-sm font-medium text-slate-500">{m}</div>
              {resolved ? (
                <>
                  <div className="font-heading text-2xl font-bold text-slate-900">{resolved.value}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{resolved.basis}</div>
                </>
              ) : (
                <>
                  <div className="font-heading text-2xl font-bold text-slate-300">—</div>
                  <div className="mt-1 text-[11px] text-slate-400">Not measured by this platform</div>
                </>
              )}
            </div>
          );
        })}
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
          <span className="text-xs text-slate-400">{rows.length} categories · {allAssets.length} assets</span>
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
