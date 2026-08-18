import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ReportExportFormat, SavedReport, ScheduleFrequency } from '@access-genie/shared';
import { exportApi, reportsApi, schedulesApi, useRefreshAnalytics, useReports } from '@/api/analytics';
import { useMutate } from '@/api/mutate';
import { ApiRequestError } from '@/api/client';
import { Badge, EmptyState, ErrorState, MetricCard, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Dropdown, MenuItem } from '@/components/ui/Dropdown';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ExportMenu } from '@/components/analytics/ExportMenu';
import { ScheduleDialog } from '@/components/analytics/ScheduleDialog';
import { cn, formatDate, relTime } from '@/lib/utils';

/**
 * Reports — every saved report, and everything you can do with one.
 *
 * A report here is a saved *question*, not a stored answer. "Run" executes its
 * definition against the live collections and shows what comes back; "Export"
 * runs the same query with the row cap lifted and streams a file. Neither reads
 * anything cached, which is why the figures in a file somebody downloaded and
 * the figures on this screen can never be from different days.
 */
export default function ReportsPage() {
  const navigate = useNavigate();
  const reports = useReports();
  const refresh = useRefreshAnalytics();
  const { run: mutate, isPending } = useMutate();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [deleting, setDeleting] = useState<SavedReport | null>(null);
  const [scheduling, setScheduling] = useState<SavedReport | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  // Memoised because `?? []` is a new array on every render, which would
  // make every useMemo keyed on it recompute each time.
  const rows = useMemo(() => reports.data ?? [], [reports.data]);

  const categories = useMemo(() => ['All', ...Array.from(new Set(rows.map((r) => r.category))).sort()], [rows]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter(
      (report) =>
        (category === 'All' || report.category === category) &&
        (needle === '' ||
          report.name.toLowerCase().includes(needle) ||
          report.description.toLowerCase().includes(needle) ||
          report.createdBy.toLowerCase().includes(needle)),
    );
  }, [rows, category, search]);

  const kpis = useMemo(
    () => ({
      total: rows.length,
      scheduled: rows.filter((r) => r.scheduled).length,
      neverRun: rows.filter((r) => !r.lastRun).length,
      legacy: rows.filter((r) => r.legacy).length,
    }),
    [rows],
  );

  /** Run a report and show the result on its own page — the "View" action. */
  const runReport = async (report: SavedReport) => {
    setRunning(report.id);
    const result = await mutate(reportsApi.run(report.id), {
      describe: `run "${report.name}"`,
      refresh,
    });
    setRunning(null);
    if (result) navigate(`/reports/${report.id}`);
  };

  const duplicate = (report: SavedReport) =>
    void mutate(reportsApi.duplicate(report.id), {
      success: 'Report duplicated',
      successDetail: `A copy of "${report.name}" is in the list.`,
      describe: 'duplicate that report',
      refresh,
    });

  const confirmDelete = async () => {
    if (!deleting) return;
    const result = await mutate(reportsApi.remove(deleting.id), {
      success: 'Report deleted',
      successDetail:
        deleting.scheduled || (deleting.scheduleId ?? '') !== ''
          ? 'Its schedules were removed with it — a delivery whose report is gone can only fail.'
          : undefined,
      describe: 'delete that report',
      refresh,
    });
    if (result) setDeleting(null);
  };

  const createSchedule = (values: {
    reportId: string;
    frequency: ScheduleFrequency;
    format: ReportExportFormat;
    recipients: string[];
    startDate: string;
    endDate?: string;
    enabled: boolean;
  }) =>
    void mutate(schedulesApi.create(values), {
      success: 'Schedule created',
      successDetail: `Delivering ${values.frequency.toLowerCase()} to ${values.recipients.length} recipient${
        values.recipients.length === 1 ? '' : 's'
      }.`,
      describe: 'create that schedule',
      refresh,
    }).then((created) => {
      if (created) setScheduling(null);
    });

  if (reports.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" subtitle="Saved reports across the asset estate." />
        <ErrorState
          title="Could not load reports"
          description={reports.error instanceof ApiRequestError ? reports.error.message : undefined}
          onRetry={() => void reports.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle="Saved questions about the estate. Running one queries live data — nothing here stores a copy of the answer."
        breadcrumb={[{ label: 'Analytics', href: '/analytics' }, { label: 'Reports' }]}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/reports/schedules">
              <Button variant="outline">Scheduled reports</Button>
            </Link>
            <Link to="/reports/builder">
              <Button>＋ New report</Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard icon="📄" label="Saved reports" value={kpis.total} tone="primary" />
        <MetricCard
          icon="📮"
          label="On a schedule"
          value={kpis.scheduled}
          sub={kpis.scheduled === 0 ? 'None scheduled yet' : 'Delivering automatically'}
          tone="emerald"
        />
        <MetricCard
          icon="⏳"
          label="Never run"
          value={kpis.neverRun}
          sub={kpis.neverRun === 0 ? 'All have been run' : 'No output produced yet'}
          tone={kpis.neverRun > 0 ? 'amber' : 'slate'}
        />
        <MetricCard
          icon="🕰️"
          label="Need review"
          value={kpis.legacy}
          sub={kpis.legacy === 0 ? 'All definitions confirmed' : 'Shape inferred from category'}
          tone={kpis.legacy > 0 ? 'amber' : 'slate'}
        />
      </div>

      <div className="glass-panel flex flex-wrap items-center gap-2 p-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reports…"
          className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200"
        />
        {categories.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setCategory(value)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              category === value
                ? 'border-primary-500 bg-primary-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {value}
          </button>
        ))}
      </div>

      {reports.isLoading ? (
        <div className="glass-panel p-4">
          <TableSkeleton rows={5} columns={7} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel">
          <EmptyState
            variant={rows.length === 0 ? 'empty' : 'no-results'}
            icon="📊"
            title={rows.length === 0 ? 'No reports yet' : 'No reports match'}
            description={
              rows.length === 0
                ? 'A report is a saved question about the estate — pick a data source, group it, measure it. Running one queries live data and can be exported or scheduled.'
                : 'Try another category or clear the search.'
            }
            action={
              rows.length === 0 ? (
                <Link to="/reports/builder">
                  <Button>Build your first report</Button>
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="glass-panel overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                {['Report', 'Data source', 'Created by', 'Last updated', 'Schedule', 'Last generated', ''].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((report) => (
                <tr key={report.id} className="hover:bg-slate-50">
                  <td className="max-w-[280px] px-4 py-3">
                    <Link
                      to={`/reports/${report.id}`}
                      className="font-medium text-slate-900 hover:text-primary-600"
                    >
                      {report.name}
                    </Link>
                    {report.description && (
                      <p className="mt-0.5 truncate text-xs text-slate-500">{report.description}</p>
                    )}
                    {report.legacy && (
                      <Badge tone="amber" className="mt-1">
                        Shape inferred — open in builder
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-700 capitalize">{report.definition?.source ?? '—'}</span>
                    <p className="text-[11px] text-slate-400">{report.metrics.slice(0, 2).join(', ')}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{report.createdBy}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <span title={formatDate(report.updatedAt)}>{relTime(report.updatedAt)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {report.scheduled ? (
                      <span className="flex flex-col">
                        <Badge tone="emerald">Scheduled</Badge>
                        <span className="mt-0.5 text-[11px] text-slate-400">
                          next {report.nextRun ? formatDate(report.nextRun) : '—'}
                        </span>
                      </span>
                    ) : report.scheduleId ? (
                      <Badge tone="slate">Paused</Badge>
                    ) : (
                      <span className="text-xs text-slate-400">Not scheduled</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {report.lastRun ? (
                      <span className="flex flex-col">
                        <span title={formatDate(report.lastRun)}>{relTime(report.lastRun)}</span>
                        <span className="text-[11px] text-slate-400">
                          {report.lastRunRows ?? 0} row{report.lastRunRows === 1 ? '' : 's'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={running === report.id || isPending}
                        onClick={() => void runReport(report)}
                      >
                        {running === report.id ? 'Running…' : 'Run'}
                      </Button>
                      <ExportMenu onExport={(format) => exportApi.saved(report.id, format)} />
                      <Dropdown
                        ariaLabel={`Actions for ${report.name}`}
                        trigger={({ toggle }) => (
                          <Button variant="ghost" size="sm" onClick={toggle} aria-label="More actions">
                            ⋯
                          </Button>
                        )}
                      >
                        {({ close }) => (
                          <>
                            <MenuItem
                              onClick={() => {
                                close();
                                navigate(`/reports/${report.id}`);
                              }}
                            >
                              View
                            </MenuItem>
                            <MenuItem
                              onClick={() => {
                                close();
                                navigate(`/reports/builder?report=${report.id}`);
                              }}
                            >
                              Edit in builder
                            </MenuItem>
                            <MenuItem
                              onClick={() => {
                                close();
                                duplicate(report);
                              }}
                            >
                              Duplicate
                            </MenuItem>
                            <MenuItem
                              onClick={() => {
                                close();
                                setScheduling(report);
                              }}
                            >
                              Schedule…
                            </MenuItem>
                            <MenuItem
                              className="text-health-critical"
                              onClick={() => {
                                close();
                                setDeleting(report);
                              }}
                            >
                              Delete
                            </MenuItem>
                          </>
                        )}
                      </Dropdown>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          description={
            <>
              The report definition is removed permanently.
              {deleting.scheduleId && ' Its scheduled deliveries are removed with it.'}
            </>
          }
          busy={isPending}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}

      {scheduling && (
        <ScheduleDialog
          reports={rows}
          presetReportId={scheduling.id}
          busy={isPending}
          onSubmit={createSchedule}
          onCancel={() => setScheduling(null)}
        />
      )}
    </div>
  );
}
