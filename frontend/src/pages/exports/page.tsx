// ─────────────────────────────────────────────────────────────────────────────
// Exports — export history + new-export request form. Deterministic history.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { allReports, allExportJobs } from '@/lib/dataset';
import { PageHeader, Badge, KpiCard } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { exportsApi } from '@/api/platform';
import { useMutate } from '@/api/mutate';
import { useSession } from '@/api/auth';
import { relTime, } from '@/lib/utils';

const exportHistory = allExportJobs;
const FORMATS = ['PDF', 'Excel', 'CSV', 'JSON'];
const fmtSize = (kb: number) => (kb === 0 ? '—' : kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`);

export default function ExportsPage() {
  const { toast } = useToast();
  const { run, isPending } = useMutate();
  const { user } = useSession();
  // `allReports[0]` is undefined until a report exists, so the initial value is
  // the empty option the picker renders in that case — not a report id.
  const [reportId, setReportId] = useState(allReports[0]?.id ?? '');
  const [format, setFormat] = useState('PDF');

  const readyCount = exportHistory.filter((e) => e.status === 'Ready').length;
  const processingCount = exportHistory.filter((e) => e.status === 'Processing').length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const report = allReports.find((r) => r.id === reportId);
    if (!report) {
      toast({ title: 'Pick a report', description: 'Choose which report to export.', tone: 'error' });
      return;
    }

    // The job row is created queued and the pipeline owns it from there, which
    // is why the history below is read from the server rather than appended to.
    await run(exportsApi.create({ report: report.name, format, requestedBy: user.name }), {
      success: 'Export queued',
      successDetail: `${report.name} → ${format}. It will appear in history when ready.`,
      describe: 'queue that export',
    });
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Exports"
        subtitle="Generate and download report exports across formats."
        breadcrumb={[{ label: 'Analytics', href: '/dashboards' }, { label: 'Exports' }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Exports" value={exportHistory.length} sub="Last 3 days" tone="primary" accent />
        <KpiCard label="Ready" value={readyCount} sub="Available to download" tone="emerald" />
        <KpiCard label="Processing" value={processingCount} sub="In the queue" tone="amber" />
        <KpiCard label="Formats" value={FORMATS.length} sub="PDF · Excel · CSV · JSON" tone="slate" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* New export form */}
        <div className="glass-panel rounded-xl p-5 lg:col-span-1">
          <h2 className="text-base font-semibold text-slate-800 mb-4">New Export</h2>
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Report</label>
              <select
                value={reportId}
                onChange={(e) => setReportId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {allReports.length === 0
                  ? <option value="">No reports to export yet</option>
                  : allReports.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Format</label>
              <div className="grid grid-cols-2 gap-2">
                {FORMATS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={
                      'rounded-lg border px-3 py-2 text-sm font-medium transition-colors ' +
                      (format === f ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50')
                    }
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={isPending || allReports.length === 0} className="w-full">Generate Export</Button>
          </form>
        </div>

        {/* History table */}
        <div className="glass-panel rounded-xl overflow-hidden lg:col-span-2">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-800">Recent Exports</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">Report</th>
                  <th className="px-5 py-2.5">Format</th>
                  <th className="px-5 py-2.5">Requested By</th>
                  <th className="px-5 py-2.5">When</th>
                  <th className="px-5 py-2.5">Size</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {exportHistory.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">{e.report}</div>
                      <div className="text-xs text-slate-400">{e.id}</div>
                    </td>
                    <td className="px-5 py-3"><Badge tone="slate">{e.format}</Badge></td>
                    <td className="px-5 py-3 text-slate-600">{e.requestedBy}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{relTime(e.at)}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-500">{fmtSize(e.sizeKb)}</td>
                    <td className="px-5 py-3">
                      {e.status === 'Ready' ? <Badge tone="emerald">Ready</Badge> : <Badge tone="amber">Processing</Badge>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={e.status !== 'Ready'}
                        onClick={() => toast({ title: 'Download started', description: `${e.report} (${e.format})`, tone: 'success' })}
                      >
                        Download
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
