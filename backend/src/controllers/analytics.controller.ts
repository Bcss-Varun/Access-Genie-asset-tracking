import type { Request, Response } from 'express';
import { ASSET_CATEGORIES, ASSET_STATUSES, type ReportDefinition } from '@access-genie/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { validatedQuery } from '../middleware/validate.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/audit.service.js';
import { analyticsDashboard } from '../services/analytics.service.js';
import { executeReport } from '../services/reportQuery.service.js';
import {
  createReport,
  deleteReport,
  duplicateReport,
  getReport,
  listReports,
  renderExport,
  reportCatalogue,
  runSavedReport,
  updateReport,
} from '../services/report.service.js';
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  updateSchedule,
} from '../services/reportSchedule.service.js';
import type { ScopeIdentity } from '../services/analyticsScope.service.js';
import type {
  AnalyticsDashboardQueryInput,
  CreateReportInput,
  CreateScheduleInput,
  ExportPreviewInput,
  PreviewReportInput,
  UpdateReportInput,
  UpdateScheduleInput,
} from '../validators/analytics.validator.js';

/**
 * Analytics & Reporting.
 *
 * Every handler here resolves the caller's scope from their session rather than
 * from the request, which is what makes the facility filter a narrowing control
 * rather than a way to ask for somebody else's estate. `identity()` is the one
 * place that reads it, so no route can accidentally skip it.
 */

/** Who is asking, as the scope resolver needs them. */
function identity(req: Request): ScopeIdentity {
  if (!req.auth) throw ApiError.unauthorized();
  return { roleId: req.auth.roleId, homeScopeId: req.auth.user.homeScopeId };
}

const actorOf = (req: Request) => req.auth?.user.name ?? req.auth?.user.email ?? 'Unknown';

/**
 * Turn a CSV parameter into the subset of a vocabulary it names.
 *
 * Unrecognised members are dropped rather than refused, and a parameter naming
 * nothing valid becomes `undefined` — which the service reads as "no filter"
 * rather than as "match none".
 */
function csvSubset<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] | undefined {
  if (!raw) return undefined;
  const wanted = new Set(raw.split(',').map((part) => part.trim()));
  const matched = allowed.filter((value) => wanted.has(value));
  return matched.length > 0 ? matched : undefined;
}

const parseDate = (value?: string) => {
  if (!value) return undefined;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? undefined : at;
};

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<AnalyticsDashboardQueryInput>(res);

  sendData(
    res,
    await analyticsDashboard(identity(req), {
      period: query.period,
      from: parseDate(query.from),
      to: parseDate(query.to),
      facility: query.facility,
      categories: csvSubset(query.category, ASSET_CATEGORIES),
      statuses: csvSubset(query.status, ASSET_STATUSES),
    }),
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────────────────────

/** What the builder may offer — served so the UI cannot advertise a field the engine lacks. */
export const catalogue = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, reportCatalogue());
});

/**
 * Run a definition that has not been saved.
 *
 * This is what makes the builder's preview real: every keystroke that changes a
 * dimension, measure or filter comes back here and re-queries MongoDB. There is
 * no client-side aggregation anywhere downstream of it.
 */
export const preview = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as PreviewReportInput;
  sendData(
    res,
    await executeReport(identity(req), body.definition as ReportDefinition, { facility: body.facility }),
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────────────────────────────────────

export const list = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await listReports());
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await getReport(req.params.id as string));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateReportInput;
  const report = await createReport(
    {
      name: body.name,
      description: body.description,
      category: body.category,
      persona: body.persona,
      definition: body.definition as ReportDefinition,
    },
    actorOf(req),
  );

  recordAudit(req, { action: 'report.create', target: report.id, category: 'Analytics' });
  sendData(res, report, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateReportInput;
  const report = await updateReport(
    req.params.id as string,
    { ...body, definition: body.definition as ReportDefinition | undefined },
    actorOf(req),
  );

  recordAudit(req, { action: 'report.update', target: report.id, category: 'Analytics' });
  sendData(res, report);
});

export const duplicate = asyncHandler(async (req: Request, res: Response) => {
  const report = await duplicateReport(req.params.id as string, actorOf(req));
  recordAudit(req, {
    action: 'report.duplicate',
    target: report.id,
    category: 'Analytics',
    metadata: { from: req.params.id },
  });
  sendData(res, report, 201);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { schedulesRemoved } = await deleteReport(id);

  recordAudit(req, { action: 'report.delete', target: id, category: 'Analytics', metadata: { schedulesRemoved } });
  sendData(res, { id, schedulesRemoved });
});

/** Run a saved report and return the rows. Nothing is stored but the timestamp. */
export const run = asyncHandler(async (req: Request, res: Response) => {
  const { report, result } = await runSavedReport(identity(req), req.params.id as string, {
    facility: (req.body as { facility?: string } | undefined)?.facility,
  });

  recordAudit(req, {
    action: 'report.run',
    target: report.id,
    category: 'Analytics',
    metadata: { rows: result.rowCount, scope: result.scope.id },
  });

  sendData(res, { report, result });
});

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

/** Stream a rendered file. One place, so every export sets the same headers. */
function sendFile(res: Response, file: { filename: string; mime: string; body: Buffer }): void {
  res.setHeader('Content-Type', file.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Content-Length', String(file.body.length));
  // The filename carries the run date, so a cached copy would be a file from a
  // different day under today's name.
  res.setHeader('Cache-Control', 'no-store');
  res.end(file.body);
}

/**
 * Export a saved report.
 *
 * Runs the report again with the row cap lifted, so the file holds every row
 * rather than the page the screen happened to be showing.
 */
export const exportReport = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<{ format: 'csv' | 'xlsx' | 'pdf' | 'json'; facility?: string }>(res);
  const { report, result } = await runSavedReport(identity(req), req.params.id as string, {
    facility: query.facility,
    unlimited: true,
  });

  const file = renderExport(report.name, result, query.format, [`Report: ${report.id} — ${report.description}`.trim()]);

  recordAudit(req, {
    action: 'report.export',
    target: report.id,
    category: 'Analytics',
    metadata: { format: query.format, rows: file.rowCount },
  });

  sendFile(res, file);
});

/**
 * Export straight from the builder, before anything has been saved.
 *
 * The same engine and the same renderer as a saved report — there is no second
 * path that could produce different numbers.
 */
export const exportPreview = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as ExportPreviewInput;
  const result = await executeReport(identity(req), body.definition as ReportDefinition, {
    facility: body.facility,
    unlimited: true,
  });

  const file = renderExport(body.title, result, body.format, ['Unsaved report, exported from the builder']);

  recordAudit(req, {
    action: 'report.export_preview',
    target: body.definition.source,
    category: 'Analytics',
    metadata: { format: body.format, rows: file.rowCount },
  });

  sendFile(res, file);
});

// ─────────────────────────────────────────────────────────────────────────────
// Schedules
// ─────────────────────────────────────────────────────────────────────────────

export const listScheduled = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await listSchedules());
});

export const createScheduled = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateScheduleInput;
  const schedule = await createSchedule(
    {
      reportId: body.reportId,
      frequency: body.frequency,
      format: body.format,
      recipients: body.recipients,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      enabled: body.enabled,
    },
    actorOf(req),
  );

  recordAudit(req, { action: 'report_schedule.create', target: schedule.id, category: 'Analytics' });
  sendData(res, schedule, 201);
});

export const updateScheduled = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateScheduleInput;
  const schedule = await updateSchedule(req.params.id as string, {
    frequency: body.frequency,
    format: body.format,
    recipients: body.recipients,
    enabled: body.enabled,
    startDate: body.startDate ? new Date(body.startDate) : undefined,
    endDate: body.endDate ? new Date(body.endDate) : undefined,
  });

  recordAudit(req, { action: 'report_schedule.update', target: schedule.id, category: 'Analytics' });
  sendData(res, schedule);
});

export const removeScheduled = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await deleteSchedule(id);

  recordAudit(req, { action: 'report_schedule.delete', target: id, category: 'Analytics' });
  sendData(res, { id });
});
