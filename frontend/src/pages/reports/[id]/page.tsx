import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ReportExportFormat, ReportResult, ScheduleFrequency } from '@access-genie/shared';
import {
  exportApi,
  reportsApi,
  schedulesApi,
  useAnalyticsDashboard,
  useRefreshAnalytics,
  useReport,
  useReports,
  EMPTY_ANALYTICS_FILTERS,
} from '@/api/analytics';
import { useMutate } from '@/api/mutate';
import { ApiRequestError } from '@/api/client';
import { Badge, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FacilityPicker } from '@/components/analytics/AnalyticsFilters';
import { ExportMenu } from '@/components/analytics/ExportMenu';
import { ReportResultView } from '@/components/analytics/ReportResultView';
import { ScheduleDialog } from '@/components/analytics/ScheduleDialog';
import { formatDateTime, relTime } from '@/lib/utils';

/**
 * One report: what it asks, and what the answer is right now.
 *
 * The result is fetched by *running* the report rather than by reading a stored
 * one, so opening this page is always a fresh query. The facility selector at
 * the top re-runs it against a different slice — the same report, a different
 * scope, which is the question a Super Admin actually has ("and what does this
 * look like at Hyderabad?").
 */
export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const report = useReport(id);
  const allReports = useReports();
  const refresh = useRefreshAnalytics();
  const { run: mutate, isPending } = useMutate();

  // Borrowed from the dashboard read purely for its facility list, which the
  // server has already narrowed to what this session may see.
  const scopes = useAnalyticsDashboard(EMPTY_ANALYTICS_FILTERS);

  // A list, not a single id: a report may be run against several facilities at
  // once, and the engine unions them the same way the dashboard filter does.
  const [facilities, setFacilities] = useState<string[]>([]);
  const facility = facilities.length > 0 ? facilities.join(',') : undefined;
  /* Bumped to force a re-run. Setting the scope to the value it already holds
     would not change state, so "Re-run" needs something that actually does. */
  const [nonce, setNonce] = useState(0);
  const rerun = () => setNonce((n) => n + 1);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  /*
   * Run on open, and again whenever the scope changes.
   *
   * Deliberately not a React Query hook: running a report is a POST that stamps
   * `lastRun` on the record, so it is an action with an effect, not a cacheable
   * read that may be replayed whenever a window regains focus.
   */
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    setRunning(true);
    setError(null);
    reportsApi
      .run(id, facility)
      .then((response) => {
        if (!cancelled) setResult(response.result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiRequestError ? err.message : 'The report could not be run.');
      })
      .finally(() => {
        if (!cancelled) setRunning(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, facility, nonce]);

  const definition = report.data?.definition;
  const summary = useMemo(() => {
    if (!definition) return '';
    const parts = [
      `Source: ${definition.source}`,
      definition.dimensions.length > 0 ? `grouped by ${definition.dimensions.join(', ')}` : 'no grouping',
      `measuring ${definition.measures.join(', ')}`,
    ];
    if (definition.filters.length > 0) parts.push(`${definition.filters.length} filter(s)`);
    return parts.join(' · ');
  }, [definition]);

  const remove = async () => {
    if (!id) return;
    const done = await mutate(reportsApi.remove(id), {
      success: 'Report deleted',
      describe: 'delete that report',
      refresh,
    });
    if (done) navigate('/reports');
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
      describe: 'create that schedule',
      refresh,
    }).then((created) => {
      if (created) setScheduling(false);
    });

  if (report.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Report" breadcrumb={[{ label: 'Reports', href: '/reports' }]} />
        <ErrorState
          title="Report not found"
          description={report.error instanceof ApiRequestError ? report.error.message : undefined}
          onRetry={() => void report.refetch()}
        />
      </div>
    );
  }

  const data = report.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title={data?.name ?? 'Report'}
        subtitle={data?.description || 'A saved question, executed against live data every time it is opened.'}
        breadcrumb={[
          { label: 'Analytics', href: '/analytics' },
          { label: 'Reports', href: '/reports' },
          { label: data?.name ?? 'Report' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setScheduling(true)} disabled={!data}>
              Schedule
            </Button>
            <ExportMenu
              disabled={!result || result.rows.length === 0}
              onExport={(format) => exportApi.saved(id as string, format, facility)}
            />
            <Link to={`/reports/builder?report=${id}`}>
              <Button variant="outline">Edit</Button>
            </Link>
            <Button
              variant="ghost"
              onClick={() => setDeleting(true)}
              disabled={isPending}
              className="text-health-critical"
            >
              Delete
            </Button>
          </div>
        }
      />

      {data?.legacy && (
        <div className="glass-panel border-l-4 border-l-amber-400 p-4">
          <p className="text-sm font-medium text-slate-800">This report predates the report builder.</p>
          <p className="mt-1 text-xs text-slate-500">
            Its shape was inferred from the "{data.category}" category it was filed under, because no definition was
            recorded. The figures below are real, but the grouping is a guess —{' '}
            <Link to={`/reports/builder?report=${id}`} className="font-medium text-primary-600 hover:text-primary-700">
              open it in the builder
            </Link>{' '}
            to confirm or change it.
          </p>
        </div>
      )}

      <div className="glass-panel flex flex-wrap items-center gap-3 p-3">
        <span className="text-xs font-medium text-slate-500">Run against</span>
        <FacilityPicker
          nodes={scopes.data?.filterOptions.facilities ?? []}
          selected={facilities}
          onChange={setFacilities}
        />

        <Button variant="outline" size="sm" onClick={rerun} disabled={running}>
          {running ? 'Running…' : 'Re-run'}
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          {data && <span>Created by {data.createdBy}</span>}
          {data?.lastRun && <span title={formatDateTime(data.lastRun)}>Last run {relTime(data.lastRun)}</span>}
          {data?.scheduled ? (
            <Badge tone="emerald">Scheduled</Badge>
          ) : data?.scheduleId ? (
            <Badge tone="slate">Schedule paused</Badge>
          ) : null}
        </div>
      </div>

      {summary && <p className="px-1 text-xs text-slate-400">{summary}</p>}

      <section className="glass-panel p-5">
        {error ? (
          <ErrorState title="This report could not be run" description={error} onRetry={rerun} />
        ) : running && !result ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : result ? (
          <ReportResultView result={result} />
        ) : (
          <Skeleton className="h-64 rounded-lg" />
        )}
      </section>

      {deleting && (
        <ConfirmDialog
          title={`Delete "${data?.name ?? 'this report'}"?`}
          description="The report definition is removed permanently, along with any scheduled deliveries of it."
          busy={isPending}
          onConfirm={() => void remove()}
          onCancel={() => setDeleting(false)}
        />
      )}

      {scheduling && data && (
        <ScheduleDialog
          reports={allReports.data ?? [data]}
          presetReportId={data.id}
          busy={isPending}
          onSubmit={createSchedule}
          onCancel={() => setScheduling(false)}
        />
      )}
    </div>
  );
}
