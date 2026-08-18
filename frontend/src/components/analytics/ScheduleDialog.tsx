import { useState, type FormEvent } from 'react';
import {
  REPORT_EXPORT_FORMATS,
  SCHEDULE_FREQUENCIES,
  type ReportExportFormat,
  type SavedReport,
  type ScheduleFrequency,
  type ScheduledReport,
} from '@access-genie/shared';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

/**
 * Create or edit a standing delivery.
 *
 * Recipients are typed as a comma- or newline-separated list rather than
 * through a chip editor, because the realistic input is a distribution list
 * somebody pastes. They are validated server-side as addresses; a malformed one
 * comes back naming which entry it was.
 *
 * The report cannot be changed on an existing schedule. A schedule *is* the
 * pairing of a report with a cadence, so repointing one at a different report
 * would silently change what a set of recipients has been receiving.
 */
export function ScheduleDialog({
  reports,
  existing,
  presetReportId,
  busy,
  onSubmit,
  onCancel,
}: {
  reports: SavedReport[];
  existing?: ScheduledReport;
  presetReportId?: string;
  busy: boolean;
  onSubmit: (values: {
    reportId: string;
    frequency: ScheduleFrequency;
    format: ReportExportFormat;
    recipients: string[];
    startDate: string;
    endDate?: string;
    enabled: boolean;
  }) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const [reportId, setReportId] = useState(existing?.reportId ?? presetReportId ?? reports[0]?.id ?? '');
  const [frequency, setFrequency] = useState<ScheduleFrequency>(existing?.frequency ?? 'Weekly');
  const [format, setFormat] = useState<ReportExportFormat>(existing?.format ?? 'csv');
  const [recipients, setRecipients] = useState((existing?.recipients ?? []).join(', '));
  const [startDate, setStartDate] = useState(existing?.startDate?.slice(0, 10) ?? today);
  const [endDate, setEndDate] = useState(existing?.endDate?.slice(0, 10) ?? '');
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);

  const parsedRecipients = recipients
    .split(/[,\n;]/)
    .map((value) => value.trim())
    .filter(Boolean);

  const valid = Boolean(reportId) && parsedRecipients.length > 0 && Boolean(startDate);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    onSubmit({
      reportId,
      frequency,
      format,
      recipients: parsedRecipients,
      startDate,
      endDate: endDate || undefined,
      enabled,
    });
  };

  const field = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200';
  const labelClass = 'mb-1 block text-xs font-semibold text-slate-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h2 className="font-heading text-lg font-semibold text-slate-900">
          {existing ? 'Edit schedule' : 'Schedule a report'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          The report is executed fresh at each delivery, so recipients always receive current figures.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className={labelClass} htmlFor="schedule-report">
              Report
            </label>
            <select
              id="schedule-report"
              className={cn(field, existing && 'bg-slate-50 text-slate-500')}
              value={reportId}
              disabled={Boolean(existing)}
              onChange={(e) => setReportId(e.target.value)}
            >
              {reports.length === 0 && <option value="">No saved reports yet</option>}
              {reports.map((report) => (
                <option key={report.id} value={report.id}>
                  {report.name}
                </option>
              ))}
            </select>
            {existing && (
              <p className="mt-1 text-[11px] text-slate-400">
                A schedule is tied to its report. Delete this one and create another to point at a different report.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="schedule-frequency">
                Frequency
              </label>
              <select
                id="schedule-frequency"
                className={field}
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
              >
                {SCHEDULE_FREQUENCIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="schedule-format">
                File format
              </label>
              <select
                id="schedule-format"
                className={field}
                value={format}
                onChange={(e) => setFormat(e.target.value as ReportExportFormat)}
              >
                {REPORT_EXPORT_FORMATS.map((value) => (
                  <option key={value} value={value}>
                    {value === 'xlsx' ? 'Excel (xlsx)' : value.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="schedule-start">
                Start date
              </label>
              <input
                id="schedule-start"
                type="date"
                className={field}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="schedule-end">
                End date <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="schedule-end"
                type="date"
                className={field}
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="schedule-recipients">
              Recipients
            </label>
            <textarea
              id="schedule-recipients"
              className={cn(field, 'min-h-[72px] resize-y')}
              placeholder="ops@example.com, finance@example.com"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              {parsedRecipients.length} recipient{parsedRecipients.length === 1 ? '' : 's'} · separate with commas or
              new lines
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            Active — a paused schedule keeps its place in the calendar
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid || busy}>
            {busy ? 'Saving…' : existing ? 'Save changes' : 'Create schedule'}
          </Button>
        </div>
      </form>
    </div>
  );
}
