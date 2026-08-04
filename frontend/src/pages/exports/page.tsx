// ─────────────────────────────────────────────────────────────────────────────
// Exports — export history + new-export request form. Deterministic history.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { allReports, allExportJobs } from '@/lib/dataset';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { useMutate } from '@/api/mutate';
import { reportRunApi } from '@/api/configuration';
import { relTime } from '@/lib/utils';

/**
 * The export centre.
 *
 * Generating used to write a `Queued` row that nothing ever picked up, and
 * "Download" raised a success toast without a file. Both are real now: the
 * server queries the estate, renders it and stores the file inside the request,
 * so a row appears already complete and its download is the actual bytes.
 *
 * The format choice is CSV or JSON. PDF and Excel are not offered because
 * nothing here can produce them — a button that hands you a CSV named `.pdf`
 * is worse than one that is not there.
 */

const FORMATS = ['CSV', 'JSON'];
const fmtSize = (kb: number) => (kb === 0 ? '—' : kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`);

export default function ExportsPage() {
  const { toast } = useToast();
  const { run, isPending } = useMutate();

  // Read inside the component: a module-scope copy never sees the refetch that
  // follows a run, so a new export would not appear until reload.
  const exportHistory = allExportJobs;

  // `allReports[0]` is undefined until a report exists, so the initial value is
  // the empty option the picker renders in that case — not a report id.
  const [reportId, setReportId] = useState(allReports[0]?.id ?? '');
  const [format, setFormat] = useState('CSV');
  const [downloading, setDownloading] = useState<string | null>(null);

  const readyCount = exportHistory.filter((e) => e.status === 'Complete' || e.status === 'Ready').length;
  const emptyCount = exportHistory.filter((e) => e.status === 'Empty').length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const report = allReports.find((r) => r.id === reportId);
    if (!report) {
      toast({ title: 'Pick a report', description: 'Choose which report to export.', tone: 'error' });
      return;
    }

    const result = await run(reportRunApi.run(report.id, format), { describe: 'generate that export' });
    if (!result) return;

    if (result.rowCount === 0) {
      toast({
        title: 'Nothing to export',
        description: `“${report.name}” ran against an empty result set — the row is recorded, but there is no data yet.`,
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
  };

  const download = async (id: string, name: string) => {
    setDownloading(id);
    try {
      await reportRunApi.download(id);
    } catch {
      // A row from before exports produced files has no artifact to fetch.
      toast({
        title: 'No file for this export',
        description: `“${name}” has no stored output — re-run the report to produce one.`,
        tone: 'error',
      });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Exports"
        subtitle="Generate and download report exports across formats."
        breadcrumb={[{ label: 'Analytics', href: '/dashboards' }, { label: 'Exports' }]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Exports" value={exportHistory.length} sub="Everything generated" tone="primary" accent />
        <KpiCard label="With data" value={readyCount} sub="Available to download" tone="emerald" />
        <KpiCard label="Empty" value={emptyCount} sub="Ran with no matching rows" tone="amber" />
        <KpiCard label="Formats" value={FORMATS.length} sub="CSV · JSON" tone="slate" />
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
            <Button type="submit" disabled={isPending || allReports.length === 0} className="w-full">
              {isPending ? 'Generating…' : 'Generate & download'}
            </Button>
            <p className="text-xs text-slate-400">
              Runs against live data and downloads immediately. A copy stays in the history below.
            </p>
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
                      <Badge tone={e.status === 'Empty' ? 'amber' : e.status === 'Failed' ? 'red' : 'emerald'}>{e.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={e.status === 'Empty' || downloading === e.id}
                        title={e.status === 'Empty' ? 'This export produced no rows' : undefined}
                        onClick={() => void download(e.id, e.report)}
                      >
                        {downloading === e.id ? 'Fetching…' : 'Download'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {exportHistory.length === 0 && (
              <EmptyState
                icon="📤"
                title="Nothing exported yet"
                description="Generate one on the left — it runs against live data and the file downloads straight away."
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
