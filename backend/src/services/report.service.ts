import {
  REPORT_SOURCES,
  reportSource,
  type ReportDataSource,
  type ReportDefinition,
  type ReportExportFormat,
  type ReportFilterClause,
  type ReportResult,
  type ReportVisualization,
  type SavedReport,
} from '@access-genie/shared';
import { Report, ReportSubscription, nextId, type ReportDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { toCsv, toPdf, toXlsx, type Cell, type Sheet } from '../utils/tabular.js';
import { executeReport, validateDefinition } from './reportQuery.service.js';
import type { ScopeIdentity } from './analyticsScope.service.js';

/**
 * Saved reports — the list, the CRUD, the run and the export.
 *
 * A report record holds a *definition* and never a result. Running one calls
 * the query engine against live collections; exporting one runs it again with
 * the row cap lifted and renders what comes back. There is no cached result
 * set, no nightly materialisation and no "last known figures" — which is why a
 * report and the module it reports on cannot disagree.
 *
 * Two joins happen on read rather than being stored:
 *
 * **Schedule state.** Whether a report has a standing delivery is a fact about
 * `ReportSubscription`. The old `Report.scheduled` boolean was a second copy of
 * it and drifted the moment a schedule was deleted from the other screen, so it
 * is read from the schedule collection here and the stored flag is ignored.
 *
 * **Legacy definitions.** Reports written before the query engine have none.
 * Rather than refusing to open them, a definition is inferred from the category
 * they were filed under — and the report is flagged `legacy` so the screen can
 * say plainly that the shape is a starting point somebody should confirm,
 * rather than presenting a guess as the author's intent.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Legacy reports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A starting definition per legacy category.
 *
 * Each is an honest aggregate over live data — never a reproduction of whatever
 * the old fixed query happened to emit, because that would be claiming to know
 * an intent nobody recorded. The `legacy` flag on the response is what tells
 * the reader this is inferred.
 */
const LEGACY_SHAPES: Record<string, ReportDefinition> = {
  Executive: { source: 'assets', dimensions: ['category'], measures: ['count', 'bookValue'], filters: [], visualization: 'bar' },
  Financial: { source: 'assets', dimensions: ['category'], measures: ['bookValue', 'purchaseValue', 'depreciation'], filters: [], visualization: 'table' },
  Maintenance: { source: 'maintenance', dimensions: ['status'], measures: ['count', 'overdueCount'], filters: [], visualization: 'bar' },
  Compliance: { source: 'inspections', dimensions: ['status'], measures: ['count', 'passRate'], filters: [], visualization: 'table' },
  Utilization: { source: 'assets', dimensions: ['category'], measures: ['avgUtilization', 'count'], filters: [], visualization: 'bar' },
  Asset: { source: 'assets', dimensions: ['status'], measures: ['count'], filters: [], visualization: 'donut' },
  AI: { source: 'assets', dimensions: ['healthStatus'], measures: ['count', 'avgHealth'], filters: [], visualization: 'donut' },
};

const FALLBACK_SHAPE: ReportDefinition = {
  source: 'assets',
  dimensions: ['category'],
  measures: ['count'],
  filters: [],
  visualization: 'table',
};

/** The definition to execute, and whether it was the author's or inferred. */
function effectiveDefinition(doc: ReportDoc): { definition: ReportDefinition; legacy: boolean } {
  if (doc.definition?.source) {
    return {
      definition: {
        source: doc.definition.source as ReportDataSource,
        dimensions: [...(doc.definition.dimensions ?? [])],
        measures: [...(doc.definition.measures ?? [])],
        filters: (doc.definition.filters ?? []) as ReportFilterClause[],
        visualization: (doc.definition.visualization ?? 'table') as ReportVisualization,
        sort: doc.definition.sort,
        limit: doc.definition.limit,
      },
      legacy: false,
    };
  }
  return { definition: LEGACY_SHAPES[doc.category] ?? FALLBACK_SHAPE, legacy: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The one schedule that represents each report in the list.
 *
 * A report can carry several standing instructions — a weekly CSV to operations
 * and a monthly PDF to finance are two different jobs. The list has one
 * "Schedule status" column, so it shows the schedule that will actually fire
 * next: enabled ones first, soonest among those. Ordering purely by `nextRun`
 * would let a paused schedule speak for a report that is, in fact, scheduled.
 */
async function scheduleIndex(reportIds: string[]) {
  const rows = await ReportSubscription.find({ reportId: { $in: reportIds } })
    .sort({ enabled: -1, nextRun: 1 })
    .lean();

  const index = new Map<string, { id: string; nextRun: Date; enabled: boolean }>();
  for (const row of rows) {
    if (!index.has(row.reportId)) {
      index.set(row.reportId, { id: row._id, nextRun: row.nextRun, enabled: row.enabled });
    }
  }
  return index;
}

function toSavedReport(doc: ReportDoc, schedule?: { id: string; nextRun: Date; enabled: boolean }): SavedReport {
  const { definition, legacy } = effectiveDefinition(doc);
  const catalogue = reportSource(definition.source);

  return {
    id: doc._id,
    name: doc.name,
    description: doc.description ?? '',
    category: doc.category,
    persona: doc.persona,
    format: doc.format,
    definition,
    legacy,
    createdBy: doc.createdBy || 'Unknown',
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    lastRun: doc.lastRun?.toISOString(),
    lastRunRows: doc.lastRunRows,
    scheduled: Boolean(schedule?.enabled),
    scheduleId: schedule?.id,
    nextRun: schedule?.enabled ? schedule.nextRun.toISOString() : undefined,
    // The measures the definition actually computes, labelled from the shared
    // catalogue. The stored `metrics` array was free text nobody validated.
    metrics: definition.measures.map(
      (key) => catalogue?.measures.find((m) => m.key === key)?.label ?? key,
    ),
  };
}

export async function listReports(): Promise<SavedReport[]> {
  const docs = await Report.find().sort({ updatedAt: -1 }).lean<ReportDoc[]>();
  if (docs.length === 0) return [];

  const schedules = await scheduleIndex(docs.map((d) => d._id));
  return docs.map((doc) => toSavedReport(doc, schedules.get(doc._id)));
}

export async function getReport(id: string): Promise<SavedReport> {
  const doc = await Report.findById(id).lean<ReportDoc>();
  if (!doc) throw ApiError.notFound('Report');

  const schedules = await scheduleIndex([id]);
  return toSavedReport(doc, schedules.get(id));
}

/** The catalogue the builder renders. Static, but served so both sides agree. */
export function reportCatalogue() {
  return REPORT_SOURCES;
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportInput {
  name: string;
  description?: string;
  category?: string;
  persona?: string;
  definition: ReportDefinition;
}

/**
 * Which persona a report belongs to, derived from its source when the caller
 * does not say. A field nobody fills in is better inferred than left blank and
 * then shown as a column of "—".
 */
const PERSONA_BY_SOURCE: Record<ReportDataSource, string> = {
  assets: 'Asset Manager',
  maintenance: 'Maintenance Manager',
  inspections: 'Compliance Officer',
  transfers: 'Operations',
  workforce: 'Workforce Planner',
  facilities: 'Executive',
};

export async function createReport(input: ReportInput, actor: string): Promise<SavedReport> {
  // Refused here rather than the first time somebody opens it: a report that
  // cannot be executed should never reach the collection.
  validateDefinition(input.definition);

  const now = new Date();
  const doc = await Report.create({
    _id: await nextId('report', 'RPT'),
    name: input.name,
    description: input.description ?? '',
    category: input.category ?? (reportSource(input.definition.source)?.label ?? 'Custom'),
    persona: input.persona ?? PERSONA_BY_SOURCE[input.definition.source],
    format: 'Table',
    definition: input.definition,
    createdBy: actor,
    metrics: input.definition.measures,
    createdAt: now,
    updatedAt: now,
  });

  return toSavedReport(doc.toObject());
}

export async function updateReport(
  id: string,
  patch: Partial<ReportInput>,
  _actor: string,
): Promise<SavedReport> {
  const doc = await Report.findById(id);
  if (!doc) throw ApiError.notFound('Report');

  if (patch.definition) {
    validateDefinition(patch.definition);
    doc.definition = patch.definition;
    doc.metrics = patch.definition.measures;
  }
  if (patch.name !== undefined) doc.name = patch.name;
  if (patch.description !== undefined) doc.description = patch.description;
  if (patch.category !== undefined) doc.category = patch.category;
  if (patch.persona !== undefined) doc.persona = patch.persona;

  await doc.save();

  const schedules = await scheduleIndex([id]);
  return toSavedReport(doc.toObject(), schedules.get(id));
}

/**
 * Copy a report.
 *
 * The copy starts with no run history and no schedule of its own — inheriting
 * either would claim the duplicate had already delivered something.
 */
export async function duplicateReport(id: string, actor: string): Promise<SavedReport> {
  const source = await Report.findById(id).lean<ReportDoc>();
  if (!source) throw ApiError.notFound('Report');

  const { definition } = effectiveDefinition(source);
  const now = new Date();

  const doc = await Report.create({
    _id: await nextId('report', 'RPT'),
    name: `${source.name} (copy)`,
    description: source.description,
    category: source.category,
    persona: source.persona,
    format: source.format,
    definition,
    createdBy: actor,
    metrics: definition.measures,
    createdAt: now,
    updatedAt: now,
  });

  return toSavedReport(doc.toObject());
}

/**
 * Delete a report and the schedules pointing at it.
 *
 * A schedule whose report no longer exists is a delivery that can only fail,
 * so they go together rather than being left as orphans for somebody to find.
 */
export async function deleteReport(id: string): Promise<{ schedulesRemoved: number }> {
  const removed = await Report.findByIdAndDelete(id).lean();
  if (!removed) throw ApiError.notFound('Report');

  const result = await ReportSubscription.deleteMany({ reportId: id });
  return { schedulesRemoved: result.deletedCount ?? 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Running
// ─────────────────────────────────────────────────────────────────────────────

export interface RunOptions {
  facility?: string;
  unlimited?: boolean;
}

/**
 * Run a saved report.
 *
 * The run is stamped on the record so the list can show when it last produced
 * something — but the rows are returned, never stored. Re-running tomorrow
 * queries tomorrow's estate.
 */
export async function runSavedReport(
  identity: ScopeIdentity,
  id: string,
  options: RunOptions = {},
): Promise<{ report: SavedReport; result: ReportResult }> {
  const doc = await Report.findById(id).lean<ReportDoc>();
  if (!doc) throw ApiError.notFound('Report');

  const { definition } = effectiveDefinition(doc);
  const result = await executeReport(identity, definition, options);

  const ranAt = new Date();
  await Report.updateOne({ _id: id }, { $set: { lastRun: ranAt, lastRunRows: result.rowCount } });

  const schedules = await scheduleIndex([id]);
  const report = toSavedReport({ ...doc, lastRun: ranAt, lastRunRows: result.rowCount }, schedules.get(id));

  return { report, result };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportedFile {
  filename: string;
  mime: string;
  body: Buffer;
  rowCount: number;
}

const MIME: Record<ReportExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  json: 'application/json; charset=utf-8',
};

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'report';

/** A number formatted for a cell, or the raw string. */
function cellOf(value: unknown): Cell {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * Turn a result into a file.
 *
 * The grid is exactly what the API returned — same columns, same order, same
 * values — because an export that reshapes the data is a second implementation
 * of the report, and the two will eventually disagree. The caption and meta
 * lines carry the scope, the row count and the timestamp, so a file that has
 * left the building still says what it is a report *of*.
 */
export function renderExport(
  title: string,
  result: ReportResult,
  format: ReportExportFormat,
  extraMeta: string[] = [],
): ExportedFile {
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${slug(title)}-${stamp}.${format}`;

  if (format === 'json') {
    return {
      filename,
      mime: MIME.json,
      body: Buffer.from(JSON.stringify({ title, ...result }, null, 2), 'utf8'),
      rowCount: result.rows.length,
    };
  }

  const sheet: Sheet = {
    title,
    caption: title,
    meta: [
      `Scope: ${result.scope.name}`,
      `Rows: ${result.rows.length}${result.truncated ? ` (of ${result.rowCount})` : ''} · source records: ${result.recordsScanned}`,
      `Generated: ${new Date(result.generatedAt).toISOString().replace('T', ' ').slice(0, 19)} UTC`,
      ...extraMeta,
      ...result.notes,
    ],
    headers: result.columns.map((c) => c.label),
    rows: result.rows.map((row) => result.columns.map((column) => cellOf(row[column.key]))),
  };

  // The totals row belongs in the file: a spreadsheet reader who filters the
  // grid loses it otherwise, and it is the figure most exports exist for.
  const totalKeys = Object.keys(result.totals);
  if (totalKeys.length > 0 && sheet.rows.length > 0) {
    sheet.rows.push(
      result.columns.map((column, index) => {
        if (index === 0) return 'Total';
        return column.key in result.totals ? (result.totals[column.key] as number) : '';
      }),
    );
  }

  if (format === 'csv') {
    return { filename, mime: MIME.csv, body: Buffer.from(toCsv(sheet), 'utf8'), rowCount: result.rows.length };
  }
  if (format === 'xlsx') {
    return { filename, mime: MIME.xlsx, body: toXlsx(sheet), rowCount: result.rows.length };
  }
  return { filename, mime: MIME.pdf, body: toPdf(sheet), rowCount: result.rows.length };
}
