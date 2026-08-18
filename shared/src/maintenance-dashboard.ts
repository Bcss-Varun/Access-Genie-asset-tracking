// ─────────────────────────────────────────────────────────────────────────────
// Maintenance Dashboard — the organisation-wide read.
//
// One contract over three collections that already exist: `WorkOrder` (the
// executed side), `PmSchedule` (what is due) and `Inspection` (what was
// checked). Nothing here introduces a store of its own — every number in this
// payload is aggregated from those three plus `Asset` (for facility, category
// and criticality) and `ScopeNode` (for the Org ▸ Facility ▸ Location tree).
//
// Where a figure the screen wants cannot be derived from the current schema,
// the server reports the gap in `dataGaps` rather than inventing a value.
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetCategory, WorkOrderPriority } from './domain.js';
import type { ScopeLevel } from './platform.js';

/** Range presets the dashboard offers. `custom` is `from`+`to`. */
export const MAINTENANCE_PERIODS = ['7d', '30d', '3m', '6m', '1y', 'custom'] as const;
export type MaintenancePeriod = (typeof MAINTENANCE_PERIODS)[number];

/**
 * The unified maintenance taxonomy.
 *
 * Work orders already carry a `type` in exactly these four values; a PM
 * schedule is Preventive by definition of the collection it lives in, and an
 * Inspection record is Inspection. So the taxonomy is not a new invention —
 * it is the one the data already uses, extended over the other two sources.
 */
export const MAINTENANCE_KINDS = ['Corrective', 'Preventive', 'Predictive', 'Inspection'] as const;
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];

/** Which collection a row came from. Drives the drill-down destination. */
export const MAINTENANCE_SOURCES = ['work-order', 'pm-schedule', 'inspection'] as const;
export type MaintenanceSource = (typeof MAINTENANCE_SOURCES)[number];

/**
 * One status vocabulary across the three collections.
 *
 * `WorkOrderStatus`, `InspectionStatus` and "a PM schedule" do not share a
 * vocabulary, so a single status filter needs one. The mapping is total and
 * lossless in the direction that matters — every native status lands in exactly
 * one bucket:
 *
 *   Open        ← WO New, WO Assigned, Inspection Scheduled, every PM schedule
 *   In Progress ← WO In Progress, Inspection In Progress
 *   On Hold     ← WO On Hold
 *   Completed   ← WO Completed, Inspection Passed
 *   Failed      ← Inspection Failed
 *   Cancelled   ← WO Cancelled
 */
export const MAINTENANCE_STATUSES = ['Open', 'In Progress', 'On Hold', 'Completed', 'Failed', 'Cancelled'] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const MAINTENANCE_KPI_IDS = [
  'open',
  'overdue',
  'critical',
  'in-progress',
  'completed',
  'preventive-due',
  'failed-corrective',
] as const;
export type MaintenanceKpiId = (typeof MAINTENANCE_KPI_IDS)[number];

/**
 * A headline figure, and how to read it.
 *
 * `basis` is the honest half of the card. Backlog ("how much is open right
 * now") is a stock and does not move with the date range; activity ("what was
 * completed") is a flow and does. Publishing which one a number is stops the
 * range selector from looking broken when a stock figure sensibly holds still.
 */
export interface MaintenanceKpi {
  id: MaintenanceKpiId;
  label: string;
  value: number;
  basis: 'now' | 'range';
  /** What the total is made of, so a number is explainable without a query. */
  breakdown: { label: string; value: number }[];
  /** Set when part of the intended metric has no field behind it yet. */
  note?: string;
}

export interface MaintenanceTrendPoint {
  /** ISO timestamp of the bucket start — the drill-down key. */
  start: string;
  label: string;
  /** Records created in this bucket. */
  raised: number;
  /** Records that reached Completed/Passed in this bucket. */
  completed: number;
  /** Records whose due date falls in this bucket. */
  due: number;
}

/**
 * One row of the facility league table.
 *
 * A maintenance record carries no facility of its own — it carries an asset,
 * and the asset carries a `location.id` somewhere in the scope tree. The row is
 * therefore the asset's location rolled **up** to the nearest ancestor at
 * `facility` level, which is what makes a work order on a rack on the 5th floor
 * count against the warehouse that contains it.
 */
export interface FacilityPerformanceRow {
  facilityId: string;
  facilityName: string;
  level: ScopeLevel | 'unassigned';
  /** Assets sitting anywhere beneath this facility. */
  assets: number;
  open: number;
  overdue: number;
  critical: number;
  inProgress: number;
  completed: number;
  /** open + overdue-weighted score the table sorts by. Derived, not stored. */
  attentionScore: number;
}

export interface MaintenanceTypeSlice {
  kind: MaintenanceKind;
  total: number;
  open: number;
  overdue: number;
  completed: number;
  /** Which collections contributed, so the segment is traceable. */
  sources: { source: MaintenanceSource; count: number }[];
}

/** A single maintenance record, flattened to the shape every list here renders. */
export interface MaintenanceItem {
  id: string;
  source: MaintenanceSource;
  title: string;
  assetId: string;
  assetName: string;
  /** `null` when the asset's location is not in the scope tree. */
  facilityId: string | null;
  facilityName: string;
  kind: MaintenanceKind;
  /** Only work orders carry a priority — see `dataGaps`. */
  priority: WorkOrderPriority | null;
  status: MaintenanceStatus;
  /** The native status, kept so the row reads the same as the module it links to. */
  nativeStatus: string;
  dueDate: string | null;
  completedAt: string | null;
  overdue: boolean;
  /** Positive when past due, negative when still ahead of it. */
  daysOverdue: number;
  assignedTo: string;
  /** Route into the existing detail screen for this record. */
  href: string;
}

export interface MaintenanceActivityEntry {
  id: string;
  at: string;
  actor: string;
  description: string;
  source: MaintenanceSource;
  recordId: string;
  assetId: string;
  assetName: string;
  facilityName: string;
  href: string;
}

/** The cascading Organisation ▸ Facility ▸ Location selectors, from real nodes. */
export interface MaintenanceFilterOptions {
  organizations: { id: string; name: string }[];
  facilities: { id: string; name: string; organizationId: string | null }[];
  locations: { id: string; name: string; facilityId: string | null; level: ScopeLevel }[];
  categories: AssetCategory[];
}

/**
 * A figure the screen asks for that the schema cannot currently answer in full.
 *
 * Surfacing these is deliberate: a dashboard that quietly substitutes a
 * plausible number for a missing field is worse than one that says which field
 * is missing.
 */
export interface MaintenanceDataGap {
  metric: string;
  missing: string;
}

export interface MaintenanceDashboardRange {
  period: MaintenancePeriod;
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
}

export interface MaintenanceDashboard {
  generatedAt: string;
  range: MaintenanceDashboardRange;
  /** Records in scope after filtering — the denominator behind every figure. */
  totals: { workOrders: number; pmSchedules: number; inspections: number; assets: number };
  kpis: MaintenanceKpi[];
  trend: MaintenanceTrendPoint[];
  facilities: FacilityPerformanceRow[];
  typeBreakdown: MaintenanceTypeSlice[];
  criticalAttention: MaintenanceItem[];
  upcoming: MaintenanceItem[];
  recentActivity: MaintenanceActivityEntry[];
  dataGaps: MaintenanceDataGap[];
  options: MaintenanceFilterOptions;
}

/** Query accepted by `GET /maintenance-dashboard`. All fields optional. */
export interface MaintenanceDashboardQuery {
  period?: MaintenancePeriod;
  from?: string;
  to?: string;
  /** Scope-node ids. The deepest one supplied wins. */
  organization?: string;
  facility?: string;
  location?: string;
  /** CSV of `MaintenanceKind`. */
  type?: string;
  /** CSV of `WorkOrderPriority`. */
  priority?: string;
  /** CSV of `MaintenanceStatus`. */
  status?: string;
  /** CSV of `AssetCategory`. */
  category?: string;
  assetId?: string;
  /** `true` narrows to records already past their due date. */
  overdue?: boolean;
}
