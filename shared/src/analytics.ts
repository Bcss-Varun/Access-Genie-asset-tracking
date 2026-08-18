// ─────────────────────────────────────────────────────────────────────────────
// Analytics & Reporting — the contract.
//
// Two things live here and they are deliberately separate:
//
//   1. `AnalyticsDashboard` — the organisation-wide read. One payload, every
//      figure aggregated live from the collections the other modules already
//      write (`Asset`, `WorkOrder`, `Inspection`, `CustodyRecord`,
//      `ScopeNode`). There is no analytics collection and there must not be
//      one: a stored copy of "how many assets are there" is a number that can
//      disagree with the registry, and the whole point of this module is that
//      it cannot.
//
//   2. The report engine — `REPORT_SOURCES` is the catalogue of what can be
//      asked, and `ReportDefinition` is one saved question. The catalogue is
//      shared rather than duplicated because the builder renders the same
//      field list the server executes; a field the UI offers and the server
//      cannot group by is a class of bug this removes by construction.
//
// Where the schema cannot answer something a screen asks for, the server says
// so in `dataGaps` and the figure counts only what exists. Nothing here ever
// invents a number to fill a gap.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScopeLevel } from './platform.js';

// ═════════════════════════════════════════════════════════════════════════════
// Dashboard
// ═════════════════════════════════════════════════════════════════════════════

/** Range presets. `custom` carries explicit `from`/`to`. */
export const ANALYTICS_PERIODS = ['30d', '90d', '6m', '12m', 'ytd', 'all', 'custom'] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export const ANALYTICS_KPI_IDS = [
  'total-assets',
  'total-value',
  'assigned',
  'under-maintenance',
  'due-maintenance',
  'overdue-maintenance',
  'end-of-life',
  'recently-added',
  'transfers',
] as const;
export type AnalyticsKpiId = (typeof ANALYTICS_KPI_IDS)[number];

/** How a figure should be read as a number. */
export type AnalyticsUnit = 'count' | 'currency' | 'percent';

/**
 * A headline figure, and how to read it.
 *
 * `basis` is the honest half of the tile. A **stock** ("how many assets exist")
 * is true as of now and does not move with the date range; a **flow** ("how
 * many were added") is counted over the selected range and does. Publishing
 * which one a number is stops a range selector that correctly leaves a backlog
 * figure alone from looking like a broken filter.
 */
export interface AnalyticsKpi {
  id: AnalyticsKpiId;
  label: string;
  value: number;
  unit: AnalyticsUnit;
  /** One line of context — what the number is counted over. */
  sub: string;
  basis: 'stock' | 'flow';
  tone: 'slate' | 'primary' | 'emerald' | 'amber' | 'red';
}

/** One slice of a distribution — a bar, a donut segment, a table row. */
export interface AnalyticsSlice {
  /** Stable key for filtering/drill-down. */
  key: string;
  label: string;
  value: number;
  /** A second figure on the same slice (value alongside count, say). */
  secondary?: number;
}

/** One bucket on a time series. */
export interface AnalyticsTrendPoint {
  /** ISO `YYYY-MM` or `YYYY-MM-DD` — the bucket's identity. */
  period: string;
  label: string;
  value: number;
  secondary?: number;
}

/** A facility's line in the estate table. */
export interface AnalyticsFacilityRow {
  id: string;
  name: string;
  level: ScopeLevel;
  assets: number;
  value: number;
  active: number;
  underMaintenance: number;
  openWorkOrders: number;
  overdueWorkOrders: number;
  avgHealth: number | null;
}

export interface AnalyticsRecentAsset {
  id: string;
  name: string;
  category: string;
  status: string;
  facility: string;
  custodian: string;
  value: number;
  createdAt: string;
}

export interface AnalyticsTransferRow {
  id: string;
  assetId: string;
  assetName: string;
  action: string;
  holder: string;
  by: string;
  at: string;
}

/** The maintenance slice of the estate read. */
export interface AnalyticsMaintenance {
  open: number;
  overdue: number;
  inProgress: number;
  completedInRange: number;
  dueSoon: number;
  byType: AnalyticsSlice[];
  byStatus: AnalyticsSlice[];
  /** Completed vs raised, bucketed over the range. */
  trend: AnalyticsTrendPoint[];
}

/** A selectable node in the facility filter. */
export interface AnalyticsScopeOption {
  id: string;
  name: string;
  level: ScopeLevel;
  /** Depth below the permitted root — drives indentation in the picker. */
  depth: number;
  assetCount: number;
}

/** Everything the filter bar needs to render itself, from live data. */
export interface AnalyticsFilterOptions {
  facilities: AnalyticsScopeOption[];
  categories: string[];
  statuses: string[];
}

/**
 * The whole Analytics Dashboard in one payload.
 *
 * One request rather than eight, because every section is a different cut of
 * the same collections and separate endpoints would let them disagree with
 * each other mid-refresh.
 */
export interface AnalyticsDashboard {
  generatedAt: string;
  /** The slice actually aggregated — after permissions, not what was asked for. */
  scope: {
    id: string;
    name: string;
    level: ScopeLevel;
    /** True when this is the widest slice the caller may see. */
    isRoot: boolean;
  };
  range: { from: string; to: string; label: string };
  kpis: AnalyticsKpi[];
  assetsByStatus: AnalyticsSlice[];
  assetsByCategory: AnalyticsSlice[];
  assetsByLifecycle: AnalyticsSlice[];
  assetsByFacility: AnalyticsFacilityRow[];
  /** Book value by category — the "where is the money" cut. */
  valueByCategory: AnalyticsSlice[];
  /** Assets added per bucket over the range. */
  additions: AnalyticsTrendPoint[];
  maintenance: AnalyticsMaintenance;
  transfers: {
    total: number;
    trend: AnalyticsTrendPoint[];
    recent: AnalyticsTransferRow[];
  };
  recentAssets: AnalyticsRecentAsset[];
  filterOptions: AnalyticsFilterOptions;
  /** Figures the current schema cannot produce, stated rather than faked. */
  dataGaps: string[];
}

// ═════════════════════════════════════════════════════════════════════════════
// Report engine
// ═════════════════════════════════════════════════════════════════════════════

export const REPORT_DATA_SOURCES = [
  'assets',
  'maintenance',
  'inspections',
  'transfers',
  'workforce',
  'facilities',
] as const;
export type ReportDataSource = (typeof REPORT_DATA_SOURCES)[number];

/** How a value is formatted, and which filter control it gets. */
export type ReportFieldType = 'string' | 'number' | 'currency' | 'percent' | 'date' | 'boolean';

export interface ReportFieldDef {
  key: string;
  label: string;
  type: ReportFieldType;
  /** Shown under the field in the builder. */
  hint?: string;
  /** Fixed vocabulary — renders a select rather than a text box. */
  options?: readonly string[];
}

export const REPORT_FILTER_OPERATORS = ['eq', 'ne', 'in', 'gt', 'gte', 'lt', 'lte', 'between', 'contains'] as const;
export type ReportFilterOperator = (typeof REPORT_FILTER_OPERATORS)[number];

export interface ReportFilterClause {
  field: string;
  op: ReportFilterOperator;
  /** A scalar, or two values for `between`, or a list for `in`. */
  value: string | number | boolean | (string | number)[];
}

export const REPORT_VISUALIZATIONS = ['table', 'bar', 'line', 'pie', 'donut'] as const;
export type ReportVisualization = (typeof REPORT_VISUALIZATIONS)[number];

/**
 * One saved question.
 *
 * What is stored is the *definition*, never the numbers: reopening a report
 * re-runs it against today's data rather than replaying the figures from the
 * day it was built. That is the difference between a report and a screenshot.
 */
export interface ReportDefinition {
  source: ReportDataSource;
  /** Group-by fields, in order. Empty means a single total row. */
  dimensions: string[];
  /** At least one; the first drives the chart. */
  measures: string[];
  filters: ReportFilterClause[];
  visualization: ReportVisualization;
  /** Measure or dimension key; prefix `-` for descending. */
  sort?: string;
  /** Row cap for the preview and the chart. Exports are not capped by this. */
  limit?: number;
}

/** What one data source offers. Rendered by the builder, executed by the server. */
export interface ReportSourceDef {
  id: ReportDataSource;
  label: string;
  description: string;
  /** Which collection the rows come from — shown so the user knows what they are counting. */
  basis: string;
  dimensions: ReportFieldDef[];
  measures: ReportFieldDef[];
  /** Fields that can be filtered on. A subset of the dimensions plus a few numerics/dates. */
  filters: ReportFieldDef[];
  /** Sensible starting definition when this source is picked. */
  defaults: { dimensions: string[]; measures: string[] };
}

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportFieldType;
  kind: 'dimension' | 'measure';
}

export type ReportCell = string | number | null;
export type ReportRow = Record<string, ReportCell>;

/** The result of executing a definition. Always live, never cached. */
export interface ReportResult {
  columns: ReportColumn[];
  rows: ReportRow[];
  /** Column totals for the numeric columns, where a total is meaningful. */
  totals: Record<string, number>;
  /** Rows before `limit` was applied. */
  rowCount: number;
  truncated: boolean;
  generatedAt: string;
  source: ReportDataSource;
  visualization: ReportVisualization;
  /** The scope the rows were actually drawn from, after permissions. */
  scope: { id: string; name: string };
  /** Records the source held before grouping — the honest denominator. */
  recordsScanned: number;
  notes: string[];
}

// ── Saved reports ────────────────────────────────────────────────────────────

export const REPORT_EXPORT_FORMATS = ['csv', 'xlsx', 'pdf', 'json'] as const;
export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number];

/**
 * A report as the Reports list shows it.
 *
 * Extends the original `Report` record rather than replacing it: the same
 * collection, with a `definition` that makes it executable. A report saved
 * before this existed has no definition and is reported as such instead of
 * being silently run as something else.
 */
export interface SavedReport {
  id: string;
  name: string;
  description: string;
  category: string;
  persona: string;
  /** Legacy display format. The export format is chosen at run time now. */
  format: string;
  definition?: ReportDefinition;
  /** Present only on reports built before the query engine — read-only. */
  legacy: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastRun?: string;
  lastRunRows?: number;
  /** Live from the schedule collection — never stored twice. */
  scheduled: boolean;
  scheduleId?: string;
  nextRun?: string;
  metrics: string[];
}

// ── Scheduled reports ────────────────────────────────────────────────────────

export const SCHEDULE_FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Quarterly'] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

/** A standing instruction to deliver a saved report. */
export interface ScheduledReport {
  id: string;
  reportId: string;
  reportName: string;
  frequency: ScheduleFrequency;
  format: ReportExportFormat;
  recipients: string[];
  enabled: boolean;
  startDate: string;
  endDate?: string;
  nextRun: string;
  lastRun?: string;
  /** Rows in the last delivery. Absent until it has actually run. */
  lastRunRows?: number;
  createdBy: string;
  createdAt: string;
}

// ── The catalogue ────────────────────────────────────────────────────────────
//
// What every source offers. This is the single list the builder renders and the
// server executes — see `backend/src/services/reportQuery.service.ts`, which
// maps each key below to a Mongo expression. A key that appears here without a
// mapping there is a build-time failure, not a silently empty column.
//
// Keys are stable identifiers and are what a saved definition stores. Labels
// are display text and may be reworded freely.

const FACILITY_HINT = 'Rolled up to the nearest facility in the location tree.';

export const REPORT_SOURCES: readonly ReportSourceDef[] = [
  {
    id: 'assets',
    label: 'Assets',
    description: 'The registry — every asset, where it is, what it cost and what condition it is in.',
    basis: 'One row per asset.',
    dimensions: [
      { key: 'category', label: 'Category', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'lifecycleStage', label: 'Lifecycle stage', type: 'string' },
      { key: 'facility', label: 'Facility', type: 'string', hint: FACILITY_HINT },
      { key: 'location', label: 'Location', type: 'string', hint: 'The exact node the asset sits in.' },
      { key: 'building', label: 'Building', type: 'string' },
      { key: 'custodian', label: 'Custodian', type: 'string' },
      { key: 'criticality', label: 'Criticality', type: 'string' },
      { key: 'healthStatus', label: 'Health band', type: 'string' },
      { key: 'manufacturer', label: 'Manufacturer', type: 'string' },
      { key: 'purchaseMonth', label: 'Purchase month', type: 'string' },
      { key: 'purchaseYear', label: 'Purchase year', type: 'string' },
    ],
    measures: [
      { key: 'count', label: 'Asset count', type: 'number' },
      { key: 'bookValue', label: 'Book value', type: 'currency', hint: 'Falls back to purchase price where no book value is held.' },
      { key: 'purchaseValue', label: 'Purchase value', type: 'currency' },
      { key: 'depreciation', label: 'Accumulated depreciation', type: 'currency', hint: 'Purchase price less book value.' },
      { key: 'avgPurchasePrice', label: 'Average purchase price', type: 'currency' },
      { key: 'avgHealth', label: 'Average health', type: 'number' },
      { key: 'avgUtilization', label: 'Average utilization', type: 'percent' },
      { key: 'avgRisk', label: 'Average risk', type: 'number' },
      { key: 'avgAgeYears', label: 'Average age (years)', type: 'number' },
    ],
    filters: [
      { key: 'category', label: 'Category', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'lifecycleStage', label: 'Lifecycle stage', type: 'string' },
      { key: 'facility', label: 'Facility', type: 'string', hint: FACILITY_HINT },
      { key: 'custodian', label: 'Custodian', type: 'string' },
      { key: 'criticality', label: 'Criticality', type: 'string' },
      { key: 'healthStatus', label: 'Health band', type: 'string' },
      { key: 'manufacturer', label: 'Manufacturer', type: 'string' },
      { key: 'purchaseDate', label: 'Purchase date', type: 'date' },
      { key: 'purchasePrice', label: 'Purchase price', type: 'currency' },
      { key: 'healthScore', label: 'Health score', type: 'number' },
    ],
    defaults: { dimensions: ['category'], measures: ['count', 'bookValue'] },
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    description: 'Work orders — what is open, what is late, what was completed and at what cost.',
    basis: 'One row per work order, joined to its asset for facility and category.',
    dimensions: [
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'type', label: 'Type', type: 'string' },
      { key: 'priority', label: 'Priority', type: 'string' },
      { key: 'assignedTo', label: 'Assigned to', type: 'string' },
      { key: 'source', label: 'Raised by', type: 'string' },
      { key: 'assetCategory', label: 'Asset category', type: 'string' },
      { key: 'facility', label: 'Facility', type: 'string', hint: FACILITY_HINT },
      { key: 'dueMonth', label: 'Due month', type: 'string' },
      { key: 'completedMonth', label: 'Completed month', type: 'string' },
    ],
    measures: [
      { key: 'count', label: 'Work orders', type: 'number' },
      { key: 'openCount', label: 'Open', type: 'number' },
      { key: 'overdueCount', label: 'Overdue', type: 'number' },
      { key: 'completedCount', label: 'Completed', type: 'number' },
      { key: 'estimatedHours', label: 'Estimated hours', type: 'number' },
      { key: 'laborHours', label: 'Logged labour hours', type: 'number' },
      { key: 'partsCost', label: 'Parts cost', type: 'currency' },
      { key: 'avgDaysToComplete', label: 'Avg days to complete', type: 'number', hint: 'Completed orders only.' },
    ],
    filters: [
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'type', label: 'Type', type: 'string' },
      { key: 'priority', label: 'Priority', type: 'string' },
      { key: 'assignedTo', label: 'Assigned to', type: 'string' },
      { key: 'facility', label: 'Facility', type: 'string', hint: FACILITY_HINT },
      { key: 'assetCategory', label: 'Asset category', type: 'string' },
      { key: 'dueDate', label: 'Due date', type: 'date' },
      { key: 'completedAt', label: 'Completed date', type: 'date' },
    ],
    defaults: { dimensions: ['status'], measures: ['count'] },
  },
  {
    id: 'inspections',
    label: 'Inspections',
    description: 'Inspection records — coverage, outcomes and what failed.',
    basis: 'One row per inspection record, joined to its asset.',
    dimensions: [
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'type', label: 'Type', type: 'string' },
      { key: 'templateName', label: 'Template', type: 'string' },
      { key: 'assignedTo', label: 'Assigned to', type: 'string' },
      { key: 'assetCategory', label: 'Asset category', type: 'string' },
      { key: 'facility', label: 'Facility', type: 'string', hint: FACILITY_HINT },
      { key: 'scheduledMonth', label: 'Scheduled month', type: 'string' },
    ],
    measures: [
      { key: 'count', label: 'Inspections', type: 'number' },
      { key: 'completedCount', label: 'Completed', type: 'number' },
      { key: 'passedCheckpoints', label: 'Checkpoints passed', type: 'number' },
      { key: 'failedCheckpoints', label: 'Checkpoints failed', type: 'number' },
      { key: 'passRate', label: 'Checkpoint pass rate', type: 'percent', hint: 'Passed ÷ (passed + failed).' },
    ],
    filters: [
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'type', label: 'Type', type: 'string' },
      { key: 'assignedTo', label: 'Assigned to', type: 'string' },
      { key: 'facility', label: 'Facility', type: 'string', hint: FACILITY_HINT },
      { key: 'assetCategory', label: 'Asset category', type: 'string' },
      { key: 'scheduledFor', label: 'Scheduled date', type: 'date' },
    ],
    defaults: { dimensions: ['status'], measures: ['count'] },
  },
  {
    id: 'transfers',
    label: 'Transfers & custody',
    description: 'The custody chain — who moved what, when, and between whom.',
    basis: 'One row per custody event, joined to its asset.',
    dimensions: [
      { key: 'action', label: 'Action', type: 'string' },
      { key: 'holder', label: 'New holder', type: 'string' },
      { key: 'by', label: 'Actioned by', type: 'string' },
      { key: 'assetCategory', label: 'Asset category', type: 'string' },
      { key: 'facility', label: 'Facility', type: 'string', hint: FACILITY_HINT },
      { key: 'month', label: 'Month', type: 'string' },
    ],
    measures: [
      { key: 'count', label: 'Movements', type: 'number' },
      { key: 'assetsMoved', label: 'Distinct assets', type: 'number' },
    ],
    filters: [
      { key: 'action', label: 'Action', type: 'string' },
      { key: 'holder', label: 'New holder', type: 'string' },
      { key: 'by', label: 'Actioned by', type: 'string' },
      { key: 'facility', label: 'Facility', type: 'string', hint: FACILITY_HINT },
      { key: 'assetCategory', label: 'Asset category', type: 'string' },
      { key: 'at', label: 'Date', type: 'date' },
    ],
    defaults: { dimensions: ['action'], measures: ['count'] },
  },
  {
    id: 'workforce',
    label: 'Workforce',
    description: 'The technician roster and the work currently on it.',
    basis: 'One row per technician. Open work is joined by assignee name.',
    dimensions: [
      { key: 'department', label: 'Department', type: 'string' },
      { key: 'title', label: 'Title', type: 'string' },
      { key: 'shift', label: 'Shift', type: 'string' },
      { key: 'facility', label: 'Facility', type: 'string', hint: FACILITY_HINT },
      { key: 'active', label: 'Active', type: 'boolean' },
    ],
    measures: [
      { key: 'count', label: 'Technicians', type: 'number' },
      { key: 'activeCount', label: 'Active', type: 'number' },
      { key: 'openWorkOrders', label: 'Open work orders', type: 'number', hint: 'Joined on assignee name.' },
    ],
    filters: [
      { key: 'department', label: 'Department', type: 'string' },
      { key: 'facility', label: 'Facility', type: 'string', hint: FACILITY_HINT },
      { key: 'active', label: 'Active', type: 'boolean' },
    ],
    defaults: { dimensions: ['department'], measures: ['count', 'openWorkOrders'] },
  },
  {
    id: 'facilities',
    label: 'Facilities',
    description: 'The estate by site — how many assets each holds and what they are worth.',
    basis: 'One row per facility in the location tree, including those holding no assets.',
    dimensions: [
      { key: 'facility', label: 'Facility', type: 'string' },
      { key: 'parent', label: 'Parent', type: 'string', hint: 'The region or organisation above it.' },
      { key: 'level', label: 'Level', type: 'string' },
    ],
    measures: [
      { key: 'assetCount', label: 'Assets', type: 'number' },
      { key: 'assetValue', label: 'Asset value', type: 'currency' },
      { key: 'activeCount', label: 'Active assets', type: 'number' },
      { key: 'maintenanceCount', label: 'Under maintenance', type: 'number' },
      { key: 'avgHealth', label: 'Average health', type: 'number' },
    ],
    filters: [
      { key: 'facility', label: 'Facility', type: 'string' },
      { key: 'level', label: 'Level', type: 'string' },
    ],
    defaults: { dimensions: ['facility'], measures: ['assetCount', 'assetValue'] },
  },
];

/** Look one source up by id. */
export function reportSource(id: ReportDataSource): ReportSourceDef | undefined {
  return REPORT_SOURCES.find((s) => s.id === id);
}
