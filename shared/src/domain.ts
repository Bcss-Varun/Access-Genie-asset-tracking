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
  lifecycleStage?: string;
  /** Position on the facility floor-plan, as % (0-100) of the SVG box. */
  mapPosition?: { x: number; y: number };
  healthTrend?: TrendPoint[];

  createdAt: string;
  updatedAt: string;
}

/** Fields a client may send when creating an asset. */
export type AssetCreateInput = Omit<Asset, 'id' | 'createdAt' | 'updatedAt' | 'healthStatus'> & {
  id?: string;
  healthStatus?: AssetHealth;
};

export type AssetUpdateInput = Partial<AssetCreateInput>;

// ── Maintenance / Work Orders ────────────────────────────────────────────────
export const WORK_ORDER_STATUSES = ['New', 'Assigned', 'In Progress', 'On Hold', 'Completed'] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const WORK_ORDER_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];

export const WORK_ORDER_TYPES = ['Preventive', 'Corrective', 'Predictive', 'Inspection'] as const;
export type WorkOrderType = (typeof WORK_ORDER_TYPES)[number];

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

export interface WorkOrder {
  id: string;
  title: string;
  assetId: string;
  assetName: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  type: WorkOrderType;
  assignedTo: string;
  dueDate: string;
  description: string;
  estimatedHours: number;
  /** True when the predictive engine raised this work order, not a human. */
  aiGenerated?: boolean;
  checklist: WoChecklistItem[];
  parts: WoPart[];
  laborLog: WoLabor[];
  comments: WoComment[];
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkOrderCreateInput = Omit<
  WorkOrder,
  'id' | 'createdAt' | 'updatedAt' | 'assetName' | 'checklist' | 'parts' | 'laborLog' | 'comments'
> & {
  checklist?: WoChecklistItem[];
  parts?: WoPart[];
};

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

// ── Inventory & parts ────────────────────────────────────────────────────────
export type AbcClass = 'A' | 'B' | 'C';

export interface Part {
  id: string;
  sku: string;
  name: string;
  category: string;
  onHand: number;
  reorderPoint: number;
  unitCost: number;
  warehouseId: string;
  bin: string;
  abcClass: AbcClass;
  supplierId: string;
  leadTimeDays: number;
}

export interface Warehouse {
  id: string;
  name: string;
  location: string;
  binCount: number;
  skuCount: number;
  valueInr: number;
}

export interface Supplier {
  id: string;
  name: string;
  category: string;
  leadTimeDays: number;
  rating: number; // 0-5
  contact: string;
  onTimePct: number;
}

export const PO_STATUSES = ['Draft', 'Approved', 'Sent', 'Received', 'Cancelled'] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export interface PoLine {
  sku: string;
  name: string;
  qty: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  status: PoStatus;
  expectedAt: string;
  total: number;
  lines: PoLine[];
  createdAt: string;
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
  'stockValue', 'stockouts', 'belowReorder', 'fillRate',
  'myOpenWork', 'myDueToday', 'myOverdue', 'myClosedThisPeriod',
] as const;
export type KpiId = (typeof KPI_IDS)[number];

/** Counts behind the "needs you now" strip. Each one deep-links to its queue. */
export interface DashboardTriage {
  criticalAlerts: number;
  overdueWorkOrders: number;
  unassignedWork: number;
  missingAssets: number;
  stockouts: number;
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
  abcAnalysis?: { label: string; value: number; caption: string }[];
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
