// ─────────────────────────────────────────────────────────────────────────────
// The reference dataset the screens read.
//
// Every binding here starts empty and is filled by `hydrate()` when
// `GET /api/v1/dataset` resolves — see api/dataset.ts, which calls it inside the
// query function, and <DatasetProvider>, which holds the first render until it
// has. A screen therefore reads the same collections it always did, with the
// same names, but the values come from MongoDB.
//
// Why module bindings rather than a hook: these collections are cross-cutting
// (an asset profile reads six of them; a dashboard reads four) and are read from
// helper functions as much as from components. A module binding lets both do so
// without threading a context through every helper, and ES module live bindings
// mean a re-hydration is visible everywhere at once.
//
// The one rule that follows from that: never derive from these at *module*
// scope in a screen. A value computed at import time is computed once and never
// refreshed. Derive inside the component, where it re-runs on every render.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ActivityEvent,
  AIInsight,
  Alert,
  AlertRule,
  AnomalyEvent,
  ApprovalWorkflow,
  ChecklistTemplate,
  ReportSubscription,
  OrgSettings,
  Asset,
  AssetDoc,
  AssetGroup,
  AuditRecord,
  Certification,
  CustodyRecord,
  CycleCount,
  ForecastSeries,
  Gateway,
  Geofence,
  Inspection,
  Integration,
  LifecycleTransition,
  MapZone,
  MovementTrail,
  Notification,
  Part,
  PmSchedule,
  PurchaseOrder,
  Report,
  Sensor,
  SensorKind,
  Supplier,
  TrendPoint,
  AiModel,
  Warehouse,
  UtilizationDowntimePoint,
  CategoryBreakdown,
  WorkOrder,
  WoChecklistItem,
  WoComment,
  WoLabor,
  WoPart,
  PublicUser,
  ScopeNode,
  Transfer,
  Reservation,
  Team,
  ApiKey,
  Webhook,
  Passkey,
  Backup,
  Invoice,
  ExportJob,
  SupportTicket,
  EscalationPolicy,
  OnCallShift,
  ComplianceFramework,
  RetentionPolicy,
  ReportPack,
  ReceivedPoLine,
  PendingScan,
  HelpArticle,
  HelpCategory,
  UnknownDetection,
} from '@access-genie/shared';

import { hydrateDirectory } from './rbac';

/** The wire shape of `GET /dataset`. */
export interface Dataset {
  assets: Asset[];
  groups: AssetGroup[];
  documents: AssetDoc[];
  activity: ActivityEvent[];
  custody: CustodyRecord[];
  lifecycleTransitions: LifecycleTransition[];
  workOrders: WorkOrder[];
  pmSchedules: PmSchedule[];
  inspections: Inspection[];
  insights: AIInsight[];
  aiModels: AiModel[];
  forecasts: ForecastSeries[];
  anomalies: AnomalyEvent[];
  alerts: Alert[];
  alertRules: AlertRule[];
  notifications: Notification[];
  auditLog: AuditRecord[];
  zones: MapZone[];
  sensors: Sensor[];
  gateways: Gateway[];
  geofences: Geofence[];
  trails: MovementTrail[];
  parts: Part[];
  warehouses: Warehouse[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  reports: Report[];
  cycleCounts: CycleCount[];
  certifications: Certification[];
  integrations: Integration[];
  workflows: ApprovalWorkflow[];
  /** Fleet-wide aggregates the charts read — computed server-side over the whole estate. */
  utilizationDowntime: UtilizationDowntimePoint[];
  categoryBreakdown: CategoryBreakdown[];
  /** The people directory and location tree — see lib/rbac.ts. */
  transfers: Transfer[];
  reservations: Reservation[];
  teams: Team[];
  apiKeys: ApiKey[];
  webhooks: Webhook[];
  passkeys: Passkey[];
  backups: Backup[];
  invoices: Invoice[];
  exportJobs: ExportJob[];
  supportTickets: SupportTicket[];
  escalationPolicies: EscalationPolicy[];
  onCallShifts: OnCallShift[];
  complianceFrameworks: ComplianceFramework[];
  retentionPolicies: RetentionPolicy[];
  reportPacks: ReportPack[];
  poLines: ReceivedPoLine[];
  pendingScans: PendingScan[];
  helpArticles: HelpArticle[];
  helpCategories: HelpCategory[];
  unknownTagReads: UnknownDetection[];
  checklistTemplates: ChecklistTemplate[];
  reportSubscriptions: ReportSubscription[];
  /** A singleton, not a list — the tenant's own identity and formatting. */
  orgSettings: OrgSettings;
  users: PublicUser[];
  scopeTree: ScopeNode | null;
  observedAt: string;
}

// ── Collections ──────────────────────────────────────────────────────────────
export let allAssets: Asset[] = [];
export let allGroups: AssetGroup[] = [];
export let allDocs: AssetDoc[] = [];
export let allActivity: ActivityEvent[] = [];
export let allCustody: CustodyRecord[] = [];
export let allLifecycleTransitions: LifecycleTransition[] = [];
export let allWorkOrders: WorkOrder[] = [];
export let allPmSchedules: PmSchedule[] = [];
export let allInspections: Inspection[] = [];
export let allInsights: AIInsight[] = [];
export let allModels: AiModel[] = [];
export let allForecasts: ForecastSeries[] = [];
export let allAnomalies: AnomalyEvent[] = [];
export let allAlerts: Alert[] = [];
export let allAlertRules: AlertRule[] = [];
export let allNotifications: Notification[] = [];
export let allAuditLog: AuditRecord[] = [];
export let allZones: MapZone[] = [];
export let allSensors: Sensor[] = [];
export let allGateways: Gateway[] = [];
export let allGeofences: Geofence[] = [];
export let allTrails: MovementTrail[] = [];
export let allParts: Part[] = [];
export let allWarehouses: Warehouse[] = [];
export let allSuppliers: Supplier[] = [];
export let allPurchaseOrders: PurchaseOrder[] = [];
export let allReports: Report[] = [];
export let allCycleCounts: CycleCount[] = [];
export let allCertifications: Certification[] = [];
export let allIntegrations: Integration[] = [];
export let allWorkflows: ApprovalWorkflow[] = [];
export let allTransfers: Transfer[] = [];
export let allReservations: Reservation[] = [];
export let allTeams: Team[] = [];
export let allApiKeys: ApiKey[] = [];
export let allWebhooks: Webhook[] = [];
export let allPasskeys: Passkey[] = [];
export let allBackups: Backup[] = [];
export let allInvoices: Invoice[] = [];
export let allExportJobs: ExportJob[] = [];
export let allSupportTickets: SupportTicket[] = [];
export let allEscalationPolicies: EscalationPolicy[] = [];
export let allOnCallShifts: OnCallShift[] = [];
export let allComplianceFrameworks: ComplianceFramework[] = [];
export let allRetentionPolicies: RetentionPolicy[] = [];
export let allReportPacks: ReportPack[] = [];
export let allPoLines: ReceivedPoLine[] = [];
export let allPendingScans: PendingScan[] = [];
export let allHelpArticles: HelpArticle[] = [];
export let allHelpCategories: HelpCategory[] = [];
export let allUnknownTagReads: UnknownDetection[] = [];
export let allChecklistTemplates: ChecklistTemplate[] = [];
export let allReportSubscriptions: ReportSubscription[] = [];

/**
 * The organisation's own record.
 *
 * A value rather than a list, and given defaults so a screen rendering before
 * hydration shows the product's own name instead of an empty header.
 */
export let orgSettings: OrgSettings = {
  id: 'ORG',
  name: 'Access Genie',
  legalName: '',
  logoEmoji: '🧞',
  primaryColor: '#4f46e5',
  accentColor: '#0ea5e9',
  loginMessage: '',
  supportEmail: '',
  laborRatePerHour: 850,
  timezone: 'Asia/Kolkata',
  dateFormat: 'DD MMM YYYY',
  currency: 'INR',
  updatedAt: new Date().toISOString(),
};

// Aggregates over the whole estate, not just the slices above — see the API's
// dataset service for why they are computed there rather than reduced here.
export let utilizationDowntimeSeries: UtilizationDowntimePoint[] = [];
export let categoryBreakdown: CategoryBreakdown[] = [];

/** When the server assembled this snapshot — the clock "3 min ago" is relative to. */
export let observedAt: string = new Date().toISOString();

/** Whether a payload has been received. Screens should never render before it has. */
export let isHydrated = false;

/** Replace the dataset. Called once per fetch, from the query function. */
export function hydrate(next: Dataset): void {
  allAssets = next.assets ?? [];
  allGroups = next.groups ?? [];
  allDocs = next.documents ?? [];
  allActivity = next.activity ?? [];
  allCustody = next.custody ?? [];
  allLifecycleTransitions = next.lifecycleTransitions ?? [];
  allWorkOrders = next.workOrders ?? [];
  allPmSchedules = next.pmSchedules ?? [];
  allInspections = next.inspections ?? [];
  allInsights = next.insights ?? [];
  allModels = next.aiModels ?? [];
  allForecasts = next.forecasts ?? [];
  allAnomalies = next.anomalies ?? [];
  allAlerts = next.alerts ?? [];
  allAlertRules = next.alertRules ?? [];
  allNotifications = next.notifications ?? [];
  allAuditLog = next.auditLog ?? [];
  allZones = next.zones ?? [];
  allSensors = next.sensors ?? [];
  allGateways = next.gateways ?? [];
  allGeofences = next.geofences ?? [];
  allTrails = next.trails ?? [];
  allParts = next.parts ?? [];
  allWarehouses = next.warehouses ?? [];
  allSuppliers = next.suppliers ?? [];
  allPurchaseOrders = next.purchaseOrders ?? [];
  allReports = next.reports ?? [];
  allCycleCounts = next.cycleCounts ?? [];
  allCertifications = next.certifications ?? [];
  allIntegrations = next.integrations ?? [];
  allWorkflows = next.workflows ?? [];
  allTransfers = next.transfers ?? [];
  allReservations = next.reservations ?? [];
  allTeams = next.teams ?? [];
  allApiKeys = next.apiKeys ?? [];
  allWebhooks = next.webhooks ?? [];
  allPasskeys = next.passkeys ?? [];
  allBackups = next.backups ?? [];
  allInvoices = next.invoices ?? [];
  allExportJobs = next.exportJobs ?? [];
  allSupportTickets = next.supportTickets ?? [];
  allEscalationPolicies = next.escalationPolicies ?? [];
  allOnCallShifts = next.onCallShifts ?? [];
  allComplianceFrameworks = next.complianceFrameworks ?? [];
  allRetentionPolicies = next.retentionPolicies ?? [];
  allReportPacks = next.reportPacks ?? [];
  allPoLines = next.poLines ?? [];
  allPendingScans = next.pendingScans ?? [];
  allHelpArticles = next.helpArticles ?? [];
  allHelpCategories = next.helpCategories ?? [];
  allUnknownTagReads = next.unknownTagReads ?? [];
  allChecklistTemplates = next.checklistTemplates ?? [];
  allReportSubscriptions = next.reportSubscriptions ?? [];
  if (next.orgSettings) orgSettings = next.orgSettings;
  utilizationDowntimeSeries = next.utilizationDowntime ?? [];
  categoryBreakdown = next.categoryBreakdown ?? [];
  // The directory lives in rbac.ts, next to the role matrix it is read with;
  // the class library keeps its own editable projection of the classes.
  hydrateDirectory(next.users ?? [], next.scopeTree ?? null);
  observedAt = next.observedAt ?? new Date().toISOString();
  isHydrated = true;
}

// ── Lookups ──────────────────────────────────────────────────────────────────
export const getAssetById = (id: string): Asset | undefined => allAssets.find((a) => a.id === id);

export const getWorkOrdersForAsset = (assetId: string): WorkOrder[] =>
  allWorkOrders.filter((wo) => wo.assetId === assetId);

export const getActivityForAsset = (assetId: string): ActivityEvent[] =>
  allActivity
    .filter((ev) => ev.assetId === assetId)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

export const getInsightsForAsset = (assetId: string): AIInsight[] =>
  allInsights.filter((ins) => ins.assetId === assetId);


export const getGroupsForAsset = (assetId: string): AssetGroup[] =>
  allGroups.filter((g) => g.memberIds.includes(assetId));

export const getDocsForAsset = (assetId: string): AssetDoc[] => allDocs.filter((d) => d.assetId === assetId);

export const getCustodyForAsset = (assetId: string): CustodyRecord[] =>
  allCustody
    .filter((c) => c.assetId === assetId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

export const getLifecycleHistoryForAsset = (assetId: string): LifecycleTransition[] =>
  allLifecycleTransitions
    .filter((t) => t.assetId === assetId)
    .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt));

export const getGateway = (id: string): Gateway | undefined => allGateways.find((g) => g.id === id);
export const getSensor = (id: string): Sensor | undefined => allSensors.find((s) => s.id === id);
export const getSensorsForGateway = (gatewayId: string): Sensor[] =>
  allSensors.filter((s) => s.gatewayId === gatewayId);

export const getTrailForAsset = (assetId: string): MovementTrail | undefined =>
  allTrails.find((t) => t.assetId === assetId);

export const getWarehouse = (id: string): Warehouse | undefined => allWarehouses.find((w) => w.id === id);
export const getSupplier = (id: string): Supplier | undefined => allSuppliers.find((s) => s.id === id);

/** Accepts either the part id or its SKU — both appear in URLs. */
export const getPart = (id: string): Part | undefined => allParts.find((p) => p.id === id || p.sku === id);
export const getPartsForWarehouse = (warehouseId: string): Part[] =>
  allParts.filter((p) => p.warehouseId === warehouseId);
export const reorderParts = (): Part[] => allParts.filter((p) => p.onHand <= p.reorderPoint);

export const getPurchaseOrder = (id: string): PurchaseOrder | undefined =>
  allPurchaseOrders.find((po) => po.id === id);

export const getPmSchedule = (id: string): PmSchedule | undefined => allPmSchedules.find((p) => p.id === id);
export const getPmForAsset = (assetId: string): PmSchedule[] => allPmSchedules.filter((p) => p.assetId === assetId);

export const getInspection = (id: string): Inspection | undefined => allInspections.find((i) => i.id === id);
export const getModel = (id: string): AiModel | undefined => allModels.find((m) => m.id === id);
export const getReport = (id: string): Report | undefined => allReports.find((r) => r.id === id);
export const getAlert = (id: string): Alert | undefined => allAlerts.find((a) => a.id === id);

// ── Derived views ────────────────────────────────────────────────────────────
export const getHealthMatrix = () =>
  allAssets.map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    health: a.healthScore,
    risk: a.riskScore ?? 0,
    utilization: a.utilization ?? 0,
    status: a.status,
  }));

export interface WorkOrderDetail {
  checklist: WoChecklistItem[];
  parts: WoPart[];
  laborLog: WoLabor[];
  comments: WoComment[];
}

/**
 * The execution record attached to a work order.
 *
 * The API returns these fields on the work order itself, so this is now a
 * projection rather than a lookup — but a work order that has only just been
 * raised has none of them, and a detail screen with four empty panels reads as
 * broken rather than as new. The default checklist is what an empty one looks
 * like on purpose.
 */
export function getWorkOrderDetail(id: string): WorkOrderDetail {
  const wo = allWorkOrders.find((w) => w.id === id);

  if (wo?.checklist?.length || wo?.comments?.length || wo?.laborLog?.length || wo?.parts?.length) {
    return {
      checklist: wo.checklist ?? [],
      parts: wo.parts ?? [],
      laborLog: wo.laborLog ?? [],
      comments: wo.comments ?? [],
    };
  }

  return {
    checklist: [
      { label: 'Triage and reproduce the reported fault', done: false },
      { label: 'Identify parts and labour required', done: false },
      { label: 'Carry out the fix', done: false },
      { label: 'Verify and close out', done: false },
    ],
    parts: [],
    laborLog: [],
    comments: [
      {
        author: 'System',
        text: `Work order opened${wo ? ` against ${wo.assetName}` : ''}. No activity logged yet.`,
        at: wo?.createdAt ?? observedAt,
      },
    ],
  };
}

/**
 * A 24-hour telemetry series for one asset and metric.
 *
 * Derived from the asset's current reading rather than stored: the platform
 * keeps the latest value per asset, not a per-hour history, so this reconstructs
 * a plausible day around it. It is deterministic in the asset id, so the same
 * asset always draws the same curve — a chart that changed shape on every
 * render would read as live data when it is not.
 */
export function getTelemetrySeries(
  assetId: string,
  metric: 'temperature' | 'battery' | 'vibration' | 'signal',
): TrendPoint[] {
  const asset = getAssetById(assetId);
  const seed = [...assetId].reduce((a, c) => a + c.charCodeAt(0), 0);

  const base =
    metric === 'temperature'
      ? asset?.telemetry?.temperature ?? 45
      : metric === 'battery'
        ? asset?.telemetry?.batteryLevel ?? 80
        : metric === 'vibration'
          ? (asset?.telemetry?.vibration ?? 0.5) * 10
          : 72;

  const amp = metric === 'battery' ? 6 : metric === 'vibration' ? 4 : 8;

  return Array.from({ length: 24 }, (_, h) => {
    const drift = metric === 'battery' ? -h * 0.4 : 0;
    const v = base + drift + amp * Math.sin((h + seed) / 3.2) + ((seed + h) % 5) * 0.4;
    return { label: `${String(h).padStart(2, '0')}:00`, value: Math.round(v * 10) / 10 };
  });
}

// ── Tag identity ─────────────────────────────────────────────────────────────
/** Vendor prefix each tag kind's identifiers are minted under. */
export const TAG_ID_PREFIX: Record<string, string> = {
  'RFID Tag': 'RFID-E2801160',
  'BLE Beacon': 'BLE-C39A6F2B',
  'UWB Tag': 'UWB-ANCH-',
  'GPS Tracker': 'GPS-IMEI-',
  'QR Label': 'QR-AG-',
  'LoRaWAN Sensor': 'LORA-70B3D5-',
  Environmental: 'LORA-70B3D5-',
};

/** Next device id in the `SEN-nn` sequence, for the register-device dialog. */
export function nextSensorId(existing: Sensor[] = allSensors): string {
  const max = existing.reduce((m, s) => {
    const n = Number(s.id.replace('SEN-', ''));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `SEN-${String(max + 1).padStart(2, '0')}`;
}

export type { SensorKind };
