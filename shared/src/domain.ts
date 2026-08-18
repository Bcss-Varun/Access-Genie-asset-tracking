// ─────────────────────────────────────────────────────────────────────────────
// Access Genie AI — core domain contract.
// One asset graph: record + location + condition + prediction on one object.
//
// These are the *wire* shapes (what the REST API emits and accepts). Mongoose
// documents in server/src/models mirror them, exposing `id` (never `_id`) and
// ISO-8601 UTC strings for every timestamp.
// ─────────────────────────────────────────────────────────────────────────────

// ── Assets ───────────────────────────────────────────────────────────────────
export const ASSET_STATUSES = ['Active', 'Maintenance', 'Missing', 'End_Of_Life', 'Staging'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_HEALTHS = ['Good', 'Warning', 'Critical'] as const;
export type AssetHealth = (typeof ASSET_HEALTHS)[number];

/**
 * What an asset *reports as* — the one axis every dashboard, filter and report
 * groups by.
 *
 * The five original values described a data centre rather than an IT estate:
 * every phone, monitor, dock, headset, licence and cable in the building landed
 * in "Endpoints" or nowhere, which makes a category filter that cannot answer
 * the question it exists for. These are the kinds of thing an IT team actually
 * buys, tags and writes down.
 *
 * **Append-only.** Each value is stored on `Asset`, `AssetClass` and
 * `TrackingPresence` as a Mongoose enum, so removing or renaming one orphans
 * every document holding it — the document stays, and every subsequent save
 * fails validation on a field nobody touched. Add freely; retire nothing
 * without a migration.
 *
 * The order is the display order everywhere the list is rendered, so related
 * kinds sit together: machines, then the network, then what people carry and
 * plug in, then what runs the building.
 */
export const ASSET_CATEGORIES = [
  'Compute',
  'Storage',
  'Network',
  'Endpoints',
  'Mobile',
  'Peripherals',
  'Accessories',
  'Audio Visual',
  'Security',
  'Software',
  'Infrastructure',
  'Sensors',
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const CRITICALITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export type Criticality = (typeof CRITICALITIES)[number];

/**
 * The cradle-to-grave lifecycle stage — a governed workflow, not a status
 * dropdown. Every asset holds exactly one of these; every change between them
 * is a `LifecycleTransition` (see `./lifecycle`), never a bare field write.
 *
 * **Append-only**, same rule as `ASSET_CATEGORIES`: this is a Mongoose enum on
 * `Asset`, so removing or renaming a value orphans any document holding it.
 *
 * The linear order below is the happy path (`Planning → … → Disposed`).
 * Re-entrant edges (`Maintenance` back to `Assigned / In Service`, etc.) are
 * `LIFECYCLE_FLOW`, not this list.
 */
export const LIFECYCLE_STAGES = [
  'Planning',
  'Procurement',
  'Received',
  'Commissioning',
  'Available',
  'Assigned / In Service',
  'Maintenance',
  'Returned',
  'Retired',
  'Disposed',
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/**
 * Legal next stages from each stage — the graph a `ChangeStageDialog` and
 * `requestStageChange()` both enforce. Mirrors `TRANSFER_FLOW` in
 * `./registry`: forward spine plus the re-entrant loops real fleets need
 * (maintenance and returns don't dead-end).
 */
export const LIFECYCLE_FLOW: Record<LifecycleStage, LifecycleStage[]> = {
  Planning: ['Procurement'],
  Procurement: ['Received'],
  Received: ['Commissioning'],
  Commissioning: ['Available'],
  Available: ['Assigned / In Service', 'Retired'],
  'Assigned / In Service': ['Maintenance', 'Returned', 'Retired'],
  Maintenance: ['Assigned / In Service', 'Retired'],
  Returned: ['Assigned / In Service', 'Available', 'Retired'],
  Retired: ['Disposed'],
  Disposed: [],
};

/**
 * Stages a *manual* transition into may not be applied outright — it opens a
 * `Pending` `LifecycleTransition` instead, per `LIFECYCLE_ROLE_MATRIX`.
 * Automated transitions (`applyLifecycleTransition(..., { automated: true })`)
 * bypass this — a system-raised work order does not wait on itself.
 */
export const LIFECYCLE_APPROVAL_REQUIRED: LifecycleStage[] = ['Maintenance', 'Retired', 'Disposed'];

export const TRACKING_TECHS = ['RFID', 'BLE', 'GPS', 'QR', 'UWB', 'LoRaWAN'] as const;
export type TrackingTech = (typeof TRACKING_TECHS)[number];

export interface AssetLocation {
  id: string;
  name: string;
  building?: string;
  floor?: string;
  zone?: string;
  coordinates?: { lat: number; lng: number };
}

export interface Telemetry {
  temperature?: number;
  humidity?: number;
  vibration?: number;
  batteryLevel?: number;
  lastPing: string;
}

/** A single point in a small time-series (sparklines / mini-charts). */
export interface TrendPoint {
  label: string;
  value: number;
}

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  /**
   * May be empty, because plenty of real assets have no serial.
   *
   * Cables, furniture, tooling and anything bought in bulk arrive with no
   * manufacturer serial at all. It used to be required, and the registration
   * flow papered over that by inventing `INT-<provisional-id>` — a value that
   * looked like a serial, was not one, and (because the provisional id is
   * discarded before the record is saved) did not even match the asset it was
   * attached to.
   *
   * The field is always present; an asset without a serial carries `''`. That
   * keeps the shape of every asset identical, so no reader has to test for the
   * key's existence — only for whether it holds anything. Screens show "—",
   * search skips it, and the uniqueness rule applies only to non-empty values.
   */
  serialNumber: string;
  status: AssetStatus;
  healthScore: number; // 0-100
  healthStatus: AssetHealth;
  location: AssetLocation;
  custodian: string;
  purchaseDate: string;
  purchasePrice: number;
  tags: string[];
  telemetry?: Telemetry;

  manufacturer?: string;
  model?: string;
  criticality?: Criticality;
  riskScore?: number; // 0-100, higher = more at risk
  utilization?: number; // 0-100 % of capacity
  bookValue?: number; // depreciated value, INR
  depreciationMethod?: string;
  warrantyExpiry?: string;
  trackingTech?: TrackingTech;
  /** Physical tag identifier — RFID EPC / BLE MAC / QR payload / UWB anchor. */
  trackingId?: string;
  /**
   * Governed by the lifecycle workflow — never write this directly. It is set
   * by `createAsset` on registration and thereafter only by
   * `applyLifecycleTransition()` (see `./lifecycle`), so every value it has
   * ever held is backed by a `LifecycleTransition` row.
   */
  lifecycleStage: LifecycleStage;
  /** Position on the facility floor-plan, as % (0-100) of the SVG box. */
  mapPosition?: { x: number; y: number };
  healthTrend?: TrendPoint[];

  createdAt: string;
  updatedAt: string;
}

/**
 * Fields a client may send when creating an asset. `lifecycleStage` is
 * excluded, not merely optional — the initial stage is `createAsset`'s call
 * (see `./lifecycle`), not a value a form fills in.
 */
export type AssetCreateInput = Omit<Asset, 'id' | 'createdAt' | 'updatedAt' | 'healthStatus' | 'lifecycleStage'> & {
  id?: string;
  healthStatus?: AssetHealth;
};

export type AssetUpdateInput = Partial<AssetCreateInput>;

// ── Maintenance / Work Orders ────────────────────────────────────────────────
/** `Cancelled` is reachable from every open state — see `ALLOWED_TRANSITIONS` in workOrder.service.ts. */
export const WORK_ORDER_STATUSES = ['New', 'Assigned', 'In Progress', 'On Hold', 'Completed', 'Cancelled'] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const WORK_ORDER_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];

/**
 * Which statuses may follow which.
 *
 * Checked on the server, and read by the board to decide what to *offer* — one
 * definition rather than two, because a client that offers a move the server
 * refuses is a button that fails every time somebody presses it, and the two
 * copies drift the first time a state is added.
 *
 * "Completed → New" is not a workflow, it is a data-entry mistake; reopening
 * closed work should raise a fresh order that carries its own history.
 */
export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  New: ['Assigned', 'In Progress', 'On Hold', 'Cancelled'],
  Assigned: ['In Progress', 'On Hold', 'New', 'Cancelled'],
  'In Progress': ['On Hold', 'Completed', 'Cancelled'],
  'On Hold': ['In Progress', 'Assigned', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

/** The forward move a board card offers as its primary action, if any. */
export function nextWorkOrderStatus(from: WorkOrderStatus): WorkOrderStatus | null {
  const forward: Partial<Record<WorkOrderStatus, WorkOrderStatus>> = {
    New: 'Assigned',
    Assigned: 'In Progress',
    'In Progress': 'Completed',
    'On Hold': 'In Progress',
  };
  return forward[from] ?? null;
}

/** A work order is "open" until it is completed or cancelled. */
export const OPEN_WORK_ORDER_STATUSES: WorkOrderStatus[] = ['New', 'Assigned', 'In Progress', 'On Hold'];

export const WORK_ORDER_TYPES = ['Preventive', 'Corrective', 'Predictive', 'Inspection'] as const;
export type WorkOrderType = (typeof WORK_ORDER_TYPES)[number];

/**
 * Where a work order came from.
 *
 * One model, many origins — a scheduled PM run, a failed inspection and a
 * hand-raised ticket are all the same `WorkOrder` document with a different
 * `source`, not three separate datasets that happen to look alike.
 *
 * **Append-only.** These are Mongoose enum values on documents that already
 * exist; removing one does not remove it from the database, it only makes those
 * records fail validation on the next save. Narrowing what the product *offers*
 * is done with `ACTIVE_WORK_ORDER_SOURCES` below, never by deleting from here.
 */
export const WORK_ORDER_SOURCES = [
  'Manual',
  'Scheduled Maintenance',
  'Predictive Maintenance',
  'Incident',
  'Service Request',
  'Transfer / Deployment',
  'Inspection Failure',
] as const;
export type WorkOrderSource = (typeof WORK_ORDER_SOURCES)[number];

/**
 * The origins this phase supports, and the only ones anything may create.
 *
 * Work orders come from four places: somebody raised one, a preventive schedule
 * fell due, an inspection failed, or a predictive alert was actioned. `Incident`,
 * `Service Request` and `Transfer / Deployment` stay parked — not deleted,
 * because records carrying them exist and must still open, list and filter
 * correctly.
 *
 * The split is enforced in one direction only: **writes are checked against
 * this list, reads are not.** A create or update naming a parked source is
 * refused; a stored one is returned as it is and rendered as legacy. That is
 * what lets the set be narrowed and widened again without a migration in either
 * direction — `Predictive Maintenance` came back that way when the Predictive
 * Alerts module gained a real "Create Work Order" action to raise them from.
 */
export const ACTIVE_WORK_ORDER_SOURCES = [
  'Manual',
  'Scheduled Maintenance',
  'Inspection Failure',
  'Predictive Maintenance',
] as const;
export type ActiveWorkOrderSource = (typeof ACTIVE_WORK_ORDER_SOURCES)[number];

/** Same rule as sources. `Predictive` is selectable again for the same reason. */
export const ACTIVE_WORK_ORDER_TYPES = ['Corrective', 'Preventive', 'Inspection', 'Predictive'] as const;
export type ActiveWorkOrderType = (typeof ACTIVE_WORK_ORDER_TYPES)[number];

export function isActiveWorkOrderSource(source: string | undefined): source is ActiveWorkOrderSource {
  return (ACTIVE_WORK_ORDER_SOURCES as readonly string[]).includes(source ?? '');
}

export function isActiveWorkOrderType(type: string | undefined): type is ActiveWorkOrderType {
  return (ACTIVE_WORK_ORDER_TYPES as readonly string[]).includes(type ?? '');
}

/** What each active source is called on screen. `Scheduled Maintenance` is the
 *  stored value; "Preventive (PM)" is what a planner calls it. */
export const WORK_ORDER_SOURCE_LABELS: Record<ActiveWorkOrderSource, string> = {
  Manual: 'Manual',
  'Scheduled Maintenance': 'Preventive (PM)',
  'Inspection Failure': 'Inspection Failure',
  'Predictive Maintenance': 'Predictive Alert',
};

export interface WoChecklistItem {
  label: string;
  done: boolean;
}
export interface WoPart {
  sku: string;
  name: string;
  qty: number;
  unitCost: number;
}
export interface WoLabor {
  tech: string;
  hours: number;
  note: string;
  at: string;
}
export interface WoComment {
  author: string;
  text: string;
  at: string;
}

/**
 * One entry in a work order's status history.
 *
 * Written by the server on every transition, never by a caller. `from` is null
 * for the opening entry, which records the status the order was created in —
 * so the history is complete from the first moment rather than starting at the
 * first change and leaving the origin to be inferred.
 */
export interface WoStatusEvent {
  from: WorkOrderStatus | null;
  to: WorkOrderStatus;
  at: string;
  actor: string;
  note?: string;
}

/**
 * Where a work order sits in the organisation.
 *
 * Derived on read from the asset's `location`, not stored on the work order.
 * A work order has no facility of its own — it has an asset, and the asset
 * records where it is. Copying that onto the order would freeze it: move the
 * asset to another warehouse and every historic order would still claim the old
 * one, with nothing to detect the drift. Resolving it per read costs a join and
 * is always right.
 */
export interface WorkOrderPlacement {
  facilityId: string | null;
  facilityName: string;
  organizationId: string | null;
  organizationName: string;
  /** The exact node the asset sits in — a floor or a rack, usually. */
  locationId: string | null;
  locationName: string;
}

export interface WorkOrder {
  id: string;
  title: string;
  assetId: string;
  assetName: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  type: WorkOrderType;
  assignedTo: string;
  /** When the work is planned to start. Optional — not every job is booked in. */
  scheduledDate?: string;
  dueDate: string;
  description: string;
  estimatedHours: number;
  /**
   * @deprecated Nothing sets this any more — see `ACTIVE_WORK_ORDER_SOURCES`.
   * Retained so records written before predictive raising was parked still
   * deserialise; treat it as false everywhere.
   */
  aiGenerated?: boolean;
  /** Where the job came from — see `WORK_ORDER_SOURCES`. Absent on older records; treated as `Manual`. */
  source?: WorkOrderSource;
  /** The skill Scheduling & Dispatch matches technicians against. Free text so it is not blocked on a fixed taxonomy. */
  requiredSkill?: string;
  checklist: WoChecklistItem[];
  parts: WoPart[];
  laborLog: WoLabor[];
  comments: WoComment[];
  /** Every status this order has held, oldest first. Server-written. */
  history?: WoStatusEvent[];
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Resolved from the asset on read; absent on endpoints that do not join. */
  placement?: WorkOrderPlacement;
}

export type WorkOrderCreateInput = Omit<
  WorkOrder,
  'id' | 'createdAt' | 'updatedAt' | 'assetName' | 'checklist' | 'parts' | 'laborLog' | 'comments' | 'history' | 'placement'
> & {
  checklist?: WoChecklistItem[];
  parts?: WoPart[];
};

/**
 * The board, one column per status.
 *
 * A column carries both its rows and its **true** `total`, because the two are
 * not the same number: the rows are capped so a column with four hundred open
 * orders does not ship four hundred documents to draw a scrollable list, while
 * the count in the column header has to be the real one. Reporting the capped
 * length as the count is how a board quietly starts under-reporting a backlog.
 */
export interface WorkOrderBoardColumn {
  status: WorkOrderStatus;
  total: number;
  items: WorkOrder[];
}

export interface WorkOrderBoard {
  columns: WorkOrderBoardColumn[];
  /** Matching orders across every column — the same number the list view reports. */
  total: number;
  /** How many rows each column was capped at, so the UI can say "showing 50 of 412". */
  limitPerColumn: number;
}

/**
 * The filter bar's options, built from the records that exist.
 *
 * Facilities and technicians come from the data rather than from a constant:
 * offering a facility nobody has an asset in, or a technician who is not on the
 * roster, produces a filter that can only ever return nothing.
 */
export interface WorkOrderFacets {
  facilities: { id: string; name: string; count: number }[];
  /**
   * Who a work order may be assigned to.
   *
   * `technician` is the Mobile Workforce roster and `user` is an application
   * account — both are assignable, because an estate that has not onboarded a
   * field roster yet must still be able to give somebody a job. `historic` is a
   * name that appears on existing orders and is on neither list any more; it is
   * offered so past assignments stay filterable, and is refused on new ones.
   */
  technicians: { name: string; count: number; kind: 'technician' | 'user' | 'historic' }[];
  sources: { source: WorkOrderSource; label: string; count: number; active: boolean }[];
  types: { type: WorkOrderType; count: number; active: boolean }[];
  statuses: { status: WorkOrderStatus; count: number }[];
  priorities: { priority: WorkOrderPriority; count: number }[];
}

export type WorkOrderUpdateInput = Partial<WorkOrderCreateInput>;

// ── AI intelligence ──────────────────────────────────────────────────────────
export const INSIGHT_TYPES = [
  'Predictive Failure',
  'Utilization',
  'Theft/Security',
  'Cost Optimization',
  'Anomaly',
  'Lifecycle',
] as const;
export type InsightType = (typeof INSIGHT_TYPES)[number];

export const INSIGHT_SEVERITIES = ['Critical', 'Warning', 'Info', 'Opportunity'] as const;
export type InsightSeverity = (typeof INSIGHT_SEVERITIES)[number];

export interface AIInsight {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  summary: string;
  assetId?: string;
  assetName?: string;
  confidence: number; // 0-100
  impactInr?: number;
  impactLabel?: string;
  /** Explainable-AI: the factors driving this score. */
  drivers: string[];
  recommendedAction: string;
  actionLabel: string;
  status: 'open' | 'actioned' | 'dismissed';
  createdAt: string;
}

// ── Tracking ─────────────────────────────────────────────────────────────────
export const ZONE_TYPES = ['warehouse', 'dock', 'office', 'restricted', 'lab', 'yard'] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

/** A rectangular zone on the floor-plan; coords are % of the 0-100 map box. */
export interface MapZone {
  id: string;
  name: string;
  type: ZoneType;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const GEOFENCE_RULES = ['Entry', 'Exit', 'Dwell', 'Restricted'] as const;
export type GeofenceRule = (typeof GEOFENCE_RULES)[number];

export interface Geofence {
  id: string;
  name: string;
  zoneId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rule: GeofenceRule;
  breaches24h: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TrailPoint {
  x: number;
  y: number;
  timestamp: string;
  label?: string;
}

export interface MovementTrail {
  assetId: string;
  assetName: string;
  points: TrailPoint[];
  distanceM: number;
  dwellZones: { zone: string; minutes: number }[];
}

// ── IoT devices ──────────────────────────────────────────────────────────────
export const SENSOR_STATUSES = ['Online', 'Offline', 'Low Battery'] as const;
export type SensorStatus = (typeof SENSOR_STATUSES)[number];

export const SENSOR_KINDS = [
  'RFID Tag',
  'BLE Beacon',
  'UWB Tag',
  'GPS Tracker',
  'QR Label',
  'LoRaWAN Sensor',
  'Environmental',
] as const;
export type SensorKind = (typeof SENSOR_KINDS)[number];

export interface Sensor {
  id: string;
  name: string;
  kind: SensorKind;
  assetId?: string;
  assetName?: string;
  status: SensorStatus;
  /** Passive tags (RFID/QR) carry no battery. */
  batteryLevel?: number;
  signalStrength: number; // 0-100
  firmwareVersion: string;
  gatewayId: string;
  zone?: string;
  lastReading: string;
  /** Identifier printed/encoded on the tag — EPC, MAC, IMEI, QR payload. */
  tagId?: string;
  facility?: string;
  createdAt: string;
  updatedAt: string;
}

export const GATEWAY_STATUSES = ['Online', 'Degraded', 'Offline'] as const;
export type GatewayStatus = (typeof GATEWAY_STATUSES)[number];

export const GATEWAY_KINDS = [
  'RFID Reader',
  'BLE Gateway',
  'LoRaWAN Gateway',
  'UWB Anchor',
  'GPS/LTE Bridge',
  'QR Scan Station',
] as const;
export type GatewayKind = (typeof GATEWAY_KINDS)[number];

export interface Gateway {
  id: string;
  name: string;
  kind: GatewayKind;
  status: GatewayStatus;
  connectedDevices: number;
  firmwareVersion: string;
  uptimePct: number;
  location: string;
  ip?: string;
  lastSeen: string;
}

// ── Activity / chain of custody ──────────────────────────────────────────────
export const ACTIVITY_TYPES = [
  'Movement',
  'Maintenance',
  'Custody',
  'Alert',
  'Registration',
  'Telemetry',
  'Audit',
  'Lifecycle',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface ActivityEvent {
  id: string;
  assetId: string;
  type: ActivityType;
  description: string;
  actor: string;
  timestamp: string;
}

export const CUSTODY_ACTIONS = ['Assigned', 'Checked Out', 'Checked In', 'Transferred'] as const;
export type CustodyAction = (typeof CUSTODY_ACTIONS)[number];

export interface CustodyRecord {
  id: string;
  assetId: string;
  assetName: string;
  holder: string;
  action: CustodyAction;
  at: string;
  by: string;
}

// ── Alerts & notifications ───────────────────────────────────────────────────
export const ALERT_SEVERITIES = ['Critical', 'Warning', 'Info'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ['Open', 'Acknowledged', 'Escalated', 'Resolved'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export interface Alert {
  id: string;
  title: string;
  severity: AlertSeverity;
  type: string;
  assetId?: string;
  assetName?: string;
  status: AlertStatus;
  source: string;
  /** Who owns it — an alert nobody is named against is one nobody works. */
  assignedTo?: string;
  assignedAt?: string;
  /** Set by the acknowledge / resolve transitions. */
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: string;
  severity: AlertSeverity;
  channels: string[];
  enabled: boolean;
  triggered24h: number;
}

export interface Notification {
  id: string;
  userId?: string;
  title: string;
  body: string;
  category: string;
  read: boolean;
  at: string;
}

// ── Compliance & audit ───────────────────────────────────────────────────────
export interface AuditRecord {
  id: string;
  actor: string;
  action: string;
  target: string;
  category: string;
  ip: string;
  timestamp: string;
}

// ── Dashboard aggregates ─────────────────────────────────────────────────────
export interface UtilizationDowntimePoint {
  label: string;
  utilization: number;
  downtime: number;
}

export interface CategoryBreakdown {
  category: AssetCategory;
  count: number;
  value: number;
}

// ── The dashboard ────────────────────────────────────────────────────────────
//
// One screen, composed per role. The contract below is what `GET
// /dashboard/summary?scope=&period=` answers, and it encodes two rules the
// dashboard is built on.
//
// **Stock vs flow.** A flow metric (work orders raised, alerts acknowledged)
// happened *during* a window, so it can be compared with the window before it
// and drawn as a series. A stock metric (how many assets exist, what they are
// worth) is only ever "as of now" — there are no historical snapshots in this
// system, so a trend line for portfolio value would be invented. Flow metrics
// carry `previous`/`series`; stock metrics leave them out, and the tile renders
// the number alone rather than a fabricated sparkline.
//
// **Grants are in the payload, not just the UI.** Every group below is
// optional, and the server omits what the caller's role may not read. A
// Technician's response has no `portfolioValue` key at all, so no client bug
// can surface one.

export const DASHBOARD_PERIODS = ['7d', '30d', '90d', 'fy'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export type MetricUnit = 'count' | 'inr' | 'pct' | 'hours' | 'score';

/**
 * One number on the dashboard.
 *
 * `previous` and `series` are present only for flow metrics — see above. When
 * `value` is `null` the metric has no answer for this scope (an estate with no
 * PM schedules has no compliance percentage), which the tile renders as an
 * em-dash rather than as zero.
 */
export interface Metric {
  value: number | null;
  unit: MetricUnit;
  /** The same metric over the preceding window of equal length. Flow only. */
  previous?: number;
  /** Oldest → newest buckets across the window, for the sparkline. Flow only. */
  series?: number[];
  /** Whether a rise is good news — drives the delta chip's colour, not its sign. */
  higherIsBetter?: boolean;
  /** Free-text qualifier under the value, e.g. "across 14 assets". */
  caption?: string;
}

export const KPI_IDS = [
  'totalAssets', 'portfolioValue', 'bookValue', 'depreciatedValue', 'avgHealth', 'avgUtilization', 'riskIndex',
  'availability', 'missingAssets', 'assetsUnderMaintenance', 'trackedPct', 'movementVolume',
  'openWorkOrders', 'overdueWorkOrders', 'completedWorkOrders', 'mttrHours', 'mtbfDays', 'maintenanceCost', 'pmCompliance',
  'openAlerts', 'criticalAlerts', 'alertResponseMins', 'geofenceBreaches', 'custodyExceptions',
  'assetsAtRisk', 'predictedFailures', 'anomalies24h', 'aiSavings',
  'myOpenWork', 'myDueToday', 'myOverdue', 'myClosedThisPeriod',
] as const;
export type KpiId = (typeof KPI_IDS)[number];

/** Counts behind the "needs you now" strip. Each one deep-links to its queue. */
export interface DashboardTriage {
  criticalAlerts: number;
  overdueWorkOrders: number;
  unassignedWork: number;
  missingAssets: number;
  expiringCerts: number;
}

/** A month of maintenance, split by the kind of work and what it cost. */
export interface MaintenanceMonth {
  label: string;
  preventive: number;
  corrective: number;
  predictive: number;
  inspection: number;
  /** Parts consumed plus labour at the organisation's configured rate, INR. */
  cost: number;
}

/** One row of the lifecycle overview — a count of assets crossing a threshold. */
export interface LifecycleCount {
  key: string;
  label: string;
  count: number;
}

export interface DashboardCharts {
  utilizationDowntime?: UtilizationDowntimePoint[];
  categoryBreakdown?: CategoryBreakdown[];
  statusMix?: { status: AssetStatus; count: number }[];
  riskDistribution?: { label: string; value: number }[];
  woPipeline?: { label: string; value: number }[];
  alertsByType?: { label: string; value: number }[];
  valueByCategory?: { label: string; purchase: number; book: number }[];
  /** Purchase / book / accumulated by month — computed, not stored. See `./depreciation`. */
  valueTrend?: import('./depreciation.js').DepreciationPoint[];
  /** Where the estate physically sits, biggest first. */
  topLocations?: { label: string; value: number }[];
  lifecycle?: LifecycleCount[];
  maintenanceByMonth?: MaintenanceMonth[];
  utilizationBands?: { label: string; value: number }[];
  /** What the estate is doing right now, not what its record says. */
  liveStatus?: { label: string; value: number }[];
  /**
   * Health, utilization and risk over time.
   *
   * The one series on the dashboard that is *remembered* rather than computed:
   * those three scores are materialised and overwritten on every derivation
   * pass, so their history exists only because a daily snapshot captured it.
   * Empty until the scheduler has run on more than one day — the chart says it
   * is collecting rather than drawing a line through a single point.
   */
  scoreHistory?: { at: string; health: number; utilization: number; risk: number }[];
}

export type DashboardRisk = Pick<Asset, 'id' | 'name' | 'category' | 'healthScore' | 'riskScore' | 'status'> & {
  location?: string;
};

/** A work order flattened to what a dashboard row needs — no join, no detail. */
export interface DashboardWork {
  id: string;
  title: string;
  assetId: string;
  assetName: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  assignedTo: string;
  dueDate: string;
  overdue: boolean;
}

export interface DashboardAlert {
  id: string;
  title: string;
  severity: AlertSeverity;
  type: string;
  status: AlertStatus;
  assetName?: string;
  createdAt: string;
}

export interface DashboardLists {
  topRisks?: DashboardRisk[];
  alertsToTriage?: DashboardAlert[];
  overdueWork?: DashboardWork[];
  myWork?: DashboardWork[];
  recentActivity?: ActivityEvent[];
  expiringCerts?: { id: string; name: string; assetName: string; expiresAt: string; daysLeft: number }[];
  /** The assets earning their keep least — the reallocation candidates. */
  underutilized?: { id: string; name: string; utilization: number }[];
}

/** Payload of `GET /dashboard/summary` — everything the dashboard renders. */
export interface DashboardSummary {
  meta: {
    scopeId: string | null;
    scopeName: string;
    period: DashboardPeriod;
    /** The window the flow figures were counted over — what a custom range resolves to. */
    from: string;
    to: string;
    /** Filters in force, echoed back so the client never disagrees with the payload. */
    department: string | null;
    category: AssetCategory | null;
    /**
     * Departments present in the estate in scope, for the filter's options.
     * Empty when nothing has been registered with one — the filter says so
     * rather than offering a list of nothing.
     */
    departments: string[];
    /** When the server computed this. The header reads it as "updated 2m ago". */
    generatedAt: string;
  };
  triage: DashboardTriage;
  kpis: Partial<Record<KpiId, Metric>>;
  charts: DashboardCharts;
  lists: DashboardLists;
}

/**
 * A user's own dashboard composition, stored on their preferences document.
 *
 * The ids are plain strings rather than a union on purpose: which widgets exist
 * is a question about the client build, and a layout saved by one release must
 * not stop a later release from starting up because a widget was renamed. The
 * client resolves the list against its registry and silently drops what it no
 * longer recognises — see `lib/dashboard/resolve.ts`.
 */
export interface DashboardLayout {
  kpis: string[];
  main: string[];
  rail: string[];
}

/** Payload of `GET /tracking/live` — the live map in one round-trip. */
export interface LiveMapPayload {
  zones: MapZone[];
  geofences: Geofence[];
  assets: (Pick<Asset, 'id' | 'name' | 'category' | 'status' | 'healthStatus' | 'trackingTech' | 'trackingId'> & {
    mapPosition: { x: number; y: number };
    zone?: string;
    lastPing?: string;
  })[];
  stats: {
    tracked: number;
    online: number;
    byTech: { tech: string; count: number }[];
    activeGeofences: number;
    breaches24h: number;
  };
}
