import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReportExportFormat, ScheduleFrequency, ScheduledReport } from '@access-genie/shared';
import { schedulesApi, useRefreshAnalytics, useReports, useSchedules } from '@/api/analytics';
import { useMutate } from '@/api/mutate';
import { ApiRequestError } from '@/api/client';
import { Badge, EmptyState, ErrorState, MetricCard, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ScheduleDialog } from '@/components/analytics/ScheduleDialog';
import { formatDate, relTime } from '@/lib/utils';

/**
 * Scheduled Reports — standing instructions to deliver a saved report.
 *
 * What this screen does *not* do is claim a delivery history it does not have.
 * There is no mail transport configured in this deployment, so "Last run" reads
 * "Never" until something actually runs, rather than being seeded with
 * plausible dates. The schedule records — cadence, window, recipients, next
 * run — are real and persist; the delivery step is the piece a worker will
 * consume (`dueSchedules()` on the server is the query it will run).
 */
export default function ScheduledReportsPage() {
  const schedules = useSchedules();
  const reports = useReports();
  const refresh = useRefreshAnalytics();
  const { run: mutate, isPending } = useMutate();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ScheduledReport | null>(null);
  const [deleting, setDeleting] = useState<ScheduledReport | null>(null);

  // See the note in Reports: `?? []` is a fresh array each render.
  const rows = useMemo(() => schedules.data ?? [], [schedules.data]);
  const savedReports = reports.data ?? [];

  const kpis = useMemo(() => {
    const now = Date.now();
    return {
      total: rows.length,
      active: rows.filter((s) => s.enabled).length,
      dueThisWeek: rows.filter((s) => s.enabled && Date.parse(s.nextRun) - now < 7 * 86_400_000).length,
      recipients: new Set(rows.flatMap((s) => s.recipients)).size,
    };
  }, [rows]);

  const submit = (values: {
    reportId: string;
    frequency: ScheduleFrequency;
    format: ReportExportFormat;
    recipients: string[];
    startDate: string;
    endDate?: string;
    enabled: boolean;
  }) => {
    const request = editing
      ? schedulesApi.update(editing.id, {
          frequency: values.frequency,
          format: values.format,
          recipients: values.recipients,
          startDate: values.startDate,
          endDate: values.endDate,
          enabled: values.enabled,
        })
      : schedulesApi.create(values);

    void mutate(request, {
      success: editing ? 'Schedule updated' : 'Schedule created',
      describe: editing ? 'update that schedule' : 'create that schedule',
      refresh,
    }).then((done) => {
      if (done) {
        setCreating(false);
        setEditing(null);
      }
    });
  };

  const toggle = (schedule: ScheduledReport) =>
    void mutate(schedulesApi.update(schedule.id, { enabled: !schedule.enabled }), {
      success: schedule.enabled ? 'Schedule paused' : 'Schedule resumed',
      successDetail: schedule.enabled
        ? 'It keeps its place in the calendar — resuming does not restart it from today.'
        : `Next delivery ${formatDate(schedule.nextRun)}.`,
      describe: 'change that schedule',
      refresh,
    });

  const confirmDelete = () => {
    if (!deleting) return;
    void mutate(schedulesApi.remove(deleting.id), {
      success: 'Schedule deleted',
      describe: 'delete that schedule',
      refresh,
    }).then((done) => {
      if (done) setDeleting(null);
    });
  };

  if (schedules.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Scheduled Reports" subtitle="Standing deliveries of saved reports." />
        <ErrorState
          title="Could not load schedules"
          description={schedules.error instanceof ApiRequestError ? schedules.error.message : undefined}
          onRetry={() => void schedules.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Scheduled Reports"
        subtitle="Standing instructions to deliver a saved report. Each delivery runs the report fresh, so recipients get current figures."
        breadcrumb={[
          { label: 'Analytics', href: '/analytics' },
          { label: 'Reports', href: '/reports' },
          { label: 'Scheduled' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/reports">
              <Button variant="outline">All reports</Button>
            </Link>
            <Button onClick={() => setCreating(true)} disabled={savedReports.length === 0}>
              ＋ New schedule
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard icon="📮" label="Schedules" value={kpis.total} tone="primary" />
        <MetricCard
          icon="▶️"
          label="Active"
          value={kpis.active}
          sub={kpis.total - kpis.active > 0 ? `${kpis.total - kpis.active} paused` : 'None paused'}
          tone="emerald"
        />
        <MetricCard
          icon="📅"
          label="Due this week"
          value={kpis.dueThisWeek}
          sub={kpis.dueThisWeek === 0 ? 'Nothing due in 7 days' : 'Next 7 days'}
          tone={kpis.dueThisWeek > 0 ? 'amber' : 'slate'}
        />
        <MetricCard icon="✉️" label="Recipients" value={kpis.recipients} sub="Distinct addresses" tone="slate" />
      </div>

      {schedules.isLoading ? (
        <div className="glass-panel p-4">
          <TableSkeleton rows={4} columns={7} />
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-panel">
          <EmptyState
            icon="📮"
            title="No scheduled reports"
            description={
              savedReports.length === 0
                ? 'Save a report first — a schedule is a standing delivery of one, so there has to be something to deliver.'
                : 'Pick a saved report, a cadence and some recipients, and it will be delivered automatically.'
            }
            action={
              savedReports.length === 0 ? (
                <Link to="/reports/builder">
                  <Button>Build a report</Button>
                </Link>
              ) : (
                <Button onClick={() => setCreating(true)}>Schedule a report</Button>
              )
            }
          />
        </div>
      ) : (
        <div className="glass-panel overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                {['Report', 'Recipients', 'Frequency', 'Window', 'Next run', 'Last run', 'Status', ''].map((heading) => (
                  <th
                    key={heading}
                    className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((schedule) => (
                <tr key={schedule.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/reports/${schedule.reportId}`}
                      className="font-medium text-slate-900 hover:text-primary-600"
                    >
                      {schedule.reportName}
                    </Link>
                    <p className="text-[11px] uppercase text-slate-400">{schedule.format}</p>
                  </td>
                  <td className="max-w-[220px] px-4 py-3">
                    <span className="block truncate text-slate-700" title={schedule.recipients.join(', ')}>
                      {schedule.recipients[0]}
                    </span>
                    {schedule.recipients.length > 1 && (
                      <span className="text-[11px] text-slate-400">+{schedule.recipients.length - 1} more</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{schedule.frequency}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="text-xs">
                      {formatDate(schedule.startDate)}
                      {schedule.endDate ? ` → ${formatDate(schedule.endDate)}` : ' → open'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {schedule.enabled ? (
                      <span className="flex flex-col">
                        <span>{formatDate(schedule.nextRun)}</span>
                        <span className="text-[11px] text-slate-400">{relTime(schedule.nextRun)}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Paused</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {schedule.lastRun ? (
                      <span className="flex flex-col">
                        <span>{formatDate(schedule.lastRun)}</span>
                        <span className="text-[11px] text-slate-400">
                          {schedule.lastRunRows ?? 0} row{schedule.lastRunRows === 1 ? '' : 's'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={schedule.enabled ? 'emerald' : 'slate'}>{schedule.enabled ? 'Active' : 'Paused'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="ghost" size="sm" disabled={isPending} onClick={() => toggle(schedule)}>
                        {schedule.enabled ? 'Pause' : 'Resume'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setEditing(schedule)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-health-critical"
                        onClick={() => setDeleting(schedule)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="px-1 text-xs text-slate-400">
        Deliveries are recorded only when they actually happen — a schedule that has never run shows "Never" rather
        than a placeholder history.
      </p>

      {(creating || editing) && (
        <ScheduleDialog
          reports={savedReports}
          existing={editing ?? undefined}
          busy={isPending}
          onSubmit={submit}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete the ${deleting.frequency.toLowerCase()} schedule for "${deleting.reportName}"?`}
          description="The report itself is not affected — only this standing delivery is removed."
          busy={isPending}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
