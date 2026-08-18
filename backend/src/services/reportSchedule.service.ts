import type { ReportExportFormat, ScheduleFrequency, ScheduledReport } from '@access-genie/shared';
import { Report, ReportSubscription, nextId, type ReportSubscriptionDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Scheduled reports.
 *
 * A schedule is a standing instruction: this saved report, to these people, on
 * this cadence, between these dates. It stores nothing about the *contents* of
 * a delivery — the report is executed fresh at each run, so a schedule created
 * in January delivers March's figures in March.
 *
 * `nextRun` is stored rather than derived on read, and that is deliberate:
 * pausing and resuming should leave a schedule where it was in the calendar
 * rather than restarting it from today. Changing the frequency re-bases it,
 * because a weekly schedule made monthly has no sensible next date under the
 * old cadence.
 *
 * What this does **not** do is claim to have delivered anything. There is no
 * mailer wired into this deployment, so `lastRun` stays absent until a run
 * actually happens and the list shows "Never" rather than a fabricated history.
 * `dueSchedules()` is the query a delivery worker would consume; it is exported
 * and honest about being unconsumed rather than pretending the loop is closed.
 */

const DAY = 86_400_000;

/** How far apart two deliveries are, in days. */
const FREQUENCY_DAYS: Record<ScheduleFrequency, number> = {
  Daily: 1,
  Weekly: 7,
  Monthly: 30,
  Quarterly: 91,
};

/**
 * The next delivery at or after `from`.
 *
 * Walks forward in whole periods from `startDate` rather than adding one period
 * to "now", so a weekly schedule started on a Monday stays on Mondays even if
 * nobody looked at it for a month.
 */
function nextRunFrom(startDate: Date, frequency: ScheduleFrequency, from: Date): Date {
  const step = FREQUENCY_DAYS[frequency] * DAY;
  if (startDate.getTime() >= from.getTime()) return new Date(startDate);

  const elapsed = from.getTime() - startDate.getTime();
  const periods = Math.ceil(elapsed / step);
  return new Date(startDate.getTime() + periods * step);
}

/**
 * `liveNames` maps report id to its current name.
 *
 * The stored `reportName` is a snapshot taken when the schedule was created, and
 * it goes stale the moment somebody renames the report — which is precisely the
 * kind of second copy this module exists to avoid. So the list joins to `Report`
 * and prefers the live name, falling back to the snapshot only when the report
 * is gone (which the cascade on delete should make unreachable, but a fallback
 * that reads the last known name beats one that reads "undefined").
 */
function toScheduledReport(doc: ReportSubscriptionDoc, liveNames?: Map<string, string>): ScheduledReport {
  return {
    id: doc._id,
    reportId: doc.reportId,
    reportName: liveNames?.get(doc.reportId) ?? doc.reportName,
    frequency: doc.cadence,
    format: (doc.format?.toLowerCase() as ReportExportFormat) ?? 'csv',
    recipients: doc.recipients ?? [],
    enabled: doc.enabled,
    startDate: doc.startDate.toISOString(),
    endDate: doc.endDate?.toISOString(),
    nextRun: doc.nextRun.toISOString(),
    lastRun: doc.lastRun?.toISOString(),
    lastRunRows: doc.lastRunRows,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Attach current report names to a set of schedule rows. */
async function withLiveNames(rows: ReportSubscriptionDoc[]): Promise<ScheduledReport[]> {
  if (rows.length === 0) return [];

  const reports = await Report.find({ _id: { $in: rows.map((r) => r.reportId) } })
    .select('_id name')
    .lean<{ _id: string; name: string }[]>();
  const liveNames = new Map(reports.map((r) => [r._id, r.name]));

  // Wrapped rather than passed straight to `.map` — `Array.prototype.map` hands
  // the callback an index as its second argument, which would arrive here as
  // the name map.
  return rows.map((row) => toScheduledReport(row, liveNames));
}

export async function listSchedules(): Promise<ScheduledReport[]> {
  const rows = await ReportSubscription.find().sort({ nextRun: 1 }).lean<ReportSubscriptionDoc[]>();
  return withLiveNames(rows);
}

export interface ScheduleInput {
  reportId: string;
  frequency: ScheduleFrequency;
  format: ReportExportFormat;
  recipients: string[];
  startDate: Date;
  endDate?: Date;
  enabled?: boolean;
}

export async function createSchedule(input: ScheduleInput, actor: string): Promise<ScheduledReport> {
  const report = await Report.findById(input.reportId).lean();
  if (!report) throw ApiError.badRequest(`Report ${input.reportId} does not exist`);

  if (input.endDate && input.endDate <= input.startDate) {
    throw ApiError.badRequest('The end date must be after the start date');
  }

  // One standing instruction per report, per cadence, per person. A second
  // identical one only means the same file arrives twice; a *different* cadence
  // or a different owner is a legitimately different instruction.
  const clash = await ReportSubscription.findOne({
    reportId: input.reportId,
    cadence: input.frequency,
    createdBy: actor,
  }).lean();
  if (clash) throw ApiError.conflict(`You already have a ${input.frequency.toLowerCase()} schedule for ${report.name}`);

  const now = new Date();
  const created = await ReportSubscription.create({
    _id: await nextId('reportSubscription', 'SUB'),
    reportId: input.reportId,
    reportName: report.name,
    cadence: input.frequency,
    format: input.format,
    recipients: input.recipients,
    enabled: input.enabled ?? true,
    startDate: input.startDate,
    endDate: input.endDate,
    nextRun: nextRunFrom(input.startDate, input.frequency, now),
    createdBy: actor,
    createdAt: now,
  });

  return toScheduledReport(created.toObject());
}

export type SchedulePatch = Partial<Omit<ScheduleInput, 'reportId'>>;

export async function updateSchedule(id: string, patch: SchedulePatch): Promise<ScheduledReport> {
  const doc = await ReportSubscription.findById(id);
  if (!doc) throw ApiError.notFound('Schedule');

  if (patch.frequency !== undefined) doc.cadence = patch.frequency;
  if (patch.format !== undefined) doc.format = patch.format;
  if (patch.recipients !== undefined) doc.recipients = patch.recipients;
  if (patch.enabled !== undefined) doc.enabled = patch.enabled;
  if (patch.startDate !== undefined) doc.startDate = patch.startDate;
  if (patch.endDate !== undefined) doc.endDate = patch.endDate;

  if (doc.endDate && doc.endDate <= doc.startDate) {
    throw ApiError.badRequest('The end date must be after the start date');
  }

  // Only a change to the calendar itself moves the next run. Pausing, renaming
  // recipients or switching file format all leave the schedule where it was.
  if (patch.frequency !== undefined || patch.startDate !== undefined) {
    doc.nextRun = nextRunFrom(doc.startDate, doc.cadence, new Date());
  }

  // Heal the denormalized name while we are writing anyway. `listSchedules`
  // joins for it on read, but `dueSchedules` is consumed by a worker that will
  // put this string in a subject line, so the stored copy should not rot.
  const report = await Report.findById(doc.reportId).select('name').lean<{ name: string }>();
  if (report) doc.reportName = report.name;

  await doc.save();
  return toScheduledReport(doc.toObject());
}

export async function deleteSchedule(id: string): Promise<void> {
  const removed = await ReportSubscription.findByIdAndDelete(id).lean();
  if (!removed) throw ApiError.notFound('Schedule');
}

/**
 * Schedules that are due to deliver.
 *
 * The query a delivery worker would run. Nothing in this deployment consumes it
 * yet — there is no mail transport configured — and it is exported rather than
 * inlined so that when one is added, the definition of "due" lives in one place
 * and matches what the screen shows.
 */
export async function dueSchedules(at = new Date()): Promise<ScheduledReport[]> {
  const rows = await ReportSubscription.find({
    enabled: true,
    nextRun: { $lte: at },
    startDate: { $lte: at },
    $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: at } }],
  }).lean<ReportSubscriptionDoc[]>();

  return withLiveNames(rows);
}

/**
 * Record that a schedule delivered, and advance it.
 *
 * Separate from `dueSchedules` so a worker marks a delivery *after* it
 * succeeded — advancing the calendar before the file exists is how a failed
 * run silently becomes a skipped one.
 */
export async function markDelivered(id: string, rowCount: number, at = new Date()): Promise<ScheduledReport> {
  const doc = await ReportSubscription.findById(id);
  if (!doc) throw ApiError.notFound('Schedule');

  doc.lastRun = at;
  doc.lastRunRows = rowCount;
  doc.nextRun = nextRunFrom(doc.startDate, doc.cadence, new Date(at.getTime() + 1));

  // A schedule past its end date has finished rather than paused. Disabling it
  // is what stops it queueing a delivery nobody asked for.
  if (doc.endDate && doc.nextRun > doc.endDate) doc.enabled = false;

  await doc.save();
  return toScheduledReport(doc.toObject());
}
