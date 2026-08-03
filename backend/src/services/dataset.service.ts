import type { ModuleKey } from '@access-genie/shared';
import {
  Activity,
  ApiKey,
  Backup,
  ComplianceFramework,
  EscalationPolicy,
  ExportJob,
  HelpArticle,
  HelpCategory,
  Invoice,
  OnCallShift,
  Passkey,
  PendingScan,
  ReceivedPoLine,
  ReportPack,
  RetentionPolicy,
  SupportTicket,
  Team,
  Webhook,
  AiModel,
  Alert,
  AlertRule,
  AnomalyEvent,
  ApprovalWorkflow,
  Asset,
  AssetDocument,
  AssetGroup,
  AuditLog,
  Certification,
  CustodyRecord,
  CycleCount,
  ForecastSeries,
  Gateway,
  Geofence,
  Insight,
  Inspection,
  Integration,
  MovementTrail,
  Notification,
  Part,
  PmSchedule,
  PurchaseOrder,
  Report,
  Reservation,
  ScopeNodeModel,
  Sensor,
  Supplier,
  Transfer,
  UnknownDetection,
  User,
  Warehouse,
  WorkOrder,
  Zone,
  buildScopeTree,
} from '../models/index.js';
import { listAssetClasses } from './assetClass.service.js';
import { getDashboardSummary } from './dashboard.service.js';
import { aliasId } from '../utils/response.js';

/**
 * The reference dataset the application screens read.
 *
 * Why one endpoint rather than thirty: the screens are cross-cutting. A single
 * dashboard reads assets, work orders, alerts and insights together; the asset
 * profile reads six collections at once. Fetching each separately would give
 * every screen its own waterfall of loading states for data that is, in total,
 * a few thousand small documents.
 *
 * The collections that are genuinely unbounded — activity, audit, alerts,
 * notifications — are capped here, so the response cannot grow without limit as
 * the platform is used. Everything else is bounded by the size of the estate.
 *
 * Each slice is gated on the caller's modules: a Security Officer's payload
 * contains no financial or maintenance data, because the API is the enforcement
 * point and this is one of the places it enforces.
 */

/** Rolling windows for the append-only collections. */
const ACTIVITY_LIMIT = 200;
const AUDIT_LIMIT = 200;
const ALERT_LIMIT = 300;
const NOTIFICATION_LIMIT = 100;

export interface DatasetPayload {
  [slice: string]: unknown;
}

export async function getDataset(modules: ModuleKey[], userId: string): Promise<DatasetPayload> {
  const can = (...required: ModuleKey[]) => required.some((m) => modules.includes(m));

  // `empty` keeps the payload's shape constant regardless of role: the client
  // then renders an empty section rather than crashing on a missing key, and
  // never has to branch on which slices it was allowed to receive.
  const empty = Promise.resolve([]);

  const [
    assets,
    assetClasses,
    groups,
    documents,
    activity,
    custody,
    workOrders,
    pmSchedules,
    inspections,
    insights,
    aiModels,
    forecasts,
    anomalies,
    alerts,
    alertRules,
    notifications,
    auditLog,
    zones,
    sensors,
    gateways,
    geofences,
    trails,
    parts,
    warehouses,
    suppliers,
    purchaseOrders,
    reports,
    cycleCounts,
    certifications,
    integrations,
    workflows,
    users,
    scopeNodes,
    transfers,
    reservations,
    teams,
    apiKeys,
    webhooks,
    passkeys,
    backups,
    invoices,
    exportJobs,
    supportTickets,
    escalationPolicies,
    onCallShifts,
    complianceFrameworks,
    retentionPolicies,
    reportPacks,
    poLines,
    pendingScans,
    helpArticles,
    helpCategories,
    unknownTagReads,
  ] = await Promise.all([
    can('assets') ? Asset.find().sort({ _id: 1 }).lean() : empty,
    can('assets') ? listAssetClasses() : empty,
    can('assets') ? AssetGroup.find().sort({ name: 1 }).lean() : empty,
    can('assets') ? AssetDocument.find().sort({ uploadedAt: -1 }).lean() : empty,
    can('assets', 'workspace') ? Activity.find().sort({ timestamp: -1 }).limit(ACTIVITY_LIMIT).lean() : empty,
    can('compliance', 'assets') ? CustodyRecord.find().sort({ at: -1 }).lean() : empty,

    can('maintenance') ? WorkOrder.find().sort({ _id: 1 }).lean() : empty,
    can('maintenance') ? PmSchedule.find().sort({ nextDue: 1 }).lean() : empty,
    can('maintenance') ? Inspection.find().sort({ dueDate: 1 }).lean() : empty,

    can('ai') ? Insight.find().sort({ createdAt: -1 }).lean() : empty,
    can('ai') ? AiModel.find().sort({ name: 1 }).lean() : empty,
    can('ai') ? ForecastSeries.find().lean() : empty,
    can('ai') ? AnomalyEvent.find().sort({ detectedAt: -1 }).lean() : empty,

    can('alerts', 'compliance', 'workspace') ? Alert.find().sort({ createdAt: -1 }).limit(ALERT_LIMIT).lean() : empty,
    can('alerts', 'compliance') ? AlertRule.find().sort({ name: 1 }).lean() : empty,
    // A notification is addressed to a person, or broadcast to everyone.
    Notification.find({ $or: [{ userId }, { userId: { $exists: false } }] })
      .sort({ at: -1 })
      .limit(NOTIFICATION_LIMIT)
      .lean(),
    can('compliance', 'admin') ? AuditLog.find().sort({ timestamp: -1 }).limit(AUDIT_LIMIT).lean() : empty,

    can('tracking') ? Zone.find().lean() : empty,
    can('tracking') ? Sensor.find().sort({ _id: 1 }).lean() : empty,
    can('tracking') ? Gateway.find().sort({ _id: 1 }).lean() : empty,
    can('tracking') ? Geofence.find().sort({ name: 1 }).lean() : empty,
    can('tracking') ? MovementTrail.find().lean() : empty,

    can('inventory') ? Part.find().sort({ name: 1 }).lean() : empty,
    can('inventory') ? Warehouse.find().sort({ name: 1 }).lean() : empty,
    can('inventory') ? Supplier.find().sort({ name: 1 }).lean() : empty,
    can('inventory') ? PurchaseOrder.find().sort({ createdAt: -1 }).lean() : empty,

    can('analytics') ? Report.find().sort({ name: 1 }).lean() : empty,
    can('operations', 'inventory') ? CycleCount.find().sort({ date: -1 }).lean() : empty,
    can('compliance') ? Certification.find().sort({ expiresAt: 1 }).lean() : empty,
    can('admin') ? Integration.find().sort({ name: 1 }).lean() : empty,
    can('admin') ? ApprovalWorkflow.find().sort({ name: 1 }).lean() : empty,

    // The people directory and the location tree. Available to every session,
    // not just administrators: they are what the custodian pickers, the scope
    // switcher and the assignment fields are populated from, so gating them
    // would break ordinary screens rather than protect anything — the sensitive
    // part of a user record (its password hash) never leaves the model.
    User.find({ status: 'active' }).sort({ name: 1 }).lean(),
    ScopeNodeModel.find().lean(),

    can('operations', 'assets') ? Transfer.find().sort({ requestedAt: -1 }).lean() : empty,
    can('operations', 'assets') ? Reservation.find().sort({ startDay: 1 }).lean() : empty,

    // Platform administration and governance.
    can('admin') ? Team.find().sort({ name: 1 }).lean() : empty,
    can('admin', 'system') ? ApiKey.find().sort({ createdAt: -1 }).lean() : empty,
    can('admin') ? Webhook.find().sort({ url: 1 }).lean() : empty,
    // A passkey is personal: only ever the signed-in user's own.
    Passkey.find({ userId }).sort({ added: -1 }).lean(),
    can('admin') ? Backup.find().sort({ when: -1 }).lean() : empty,
    can('admin') ? Invoice.find().sort({ date: -1 }).lean() : empty,
    can('analytics', 'admin') ? ExportJob.find().sort({ at: -1 }).lean() : empty,
    SupportTicket.find().sort({ updated: -1 }).lean(),
    can('alerts', 'compliance') ? EscalationPolicy.find().sort({ name: 1 }).lean() : empty,
    can('alerts', 'compliance') ? OnCallShift.find().sort({ order: 1 }).lean() : empty,
    can('compliance') ? ComplianceFramework.find().sort({ name: 1 }).lean() : empty,
    can('compliance', 'admin') ? RetentionPolicy.find().sort({ dataClass: 1 }).lean() : empty,
    can('compliance', 'analytics') ? ReportPack.find().sort({ name: 1 }).lean() : empty,

    // What the Add Asset flow can start from, and the help centre.
    can('assets') ? ReceivedPoLine.find({ $expr: { $lt: ['$registered', '$quantity'] } }).sort({ receivedAt: -1 }).lean() : empty,
    can('assets') ? PendingScan.find({ consumed: false }).sort({ scannedAt: -1 }).lean() : empty,
    HelpArticle.find().sort({ title: 1 }).lean(),
    HelpCategory.find().lean(),
    // Ghost tags to adopt — the same rows the tracking workspace surfaces as
    // unexplained reads, so a registration closes that exception rather than
    // creating a second, unrelated list.
    can('assets') ? UnknownDetection.find({ state: { $in: ['New', 'Investigating'] } }).sort({ lastSeen: -1 }).lean() : empty,
  ]);

  // The aggregate figures the charts read — a fleet-wide utilization trend and
  // the value/count mix by category. Both are aggregations over the whole asset
  // and work-order collections, so they are computed in MongoDB rather than
  // reduced from the slices above (which are capped, and would give a different
  // answer once the estate outgrows the cap).
  const summary = can('workspace') ? await getDashboardSummary() : null;

  return {
    utilizationDowntime: summary?.utilizationDowntime ?? [],
    categoryBreakdown: summary?.categoryBreakdown ?? [],
    assets,
    assetClasses,
    groups,
    documents,
    activity,
    custody,
    workOrders,
    pmSchedules,
    inspections,
    insights,
    aiModels,
    forecasts,
    anomalies,
    alerts,
    alertRules,
    notifications,
    auditLog,
    zones,
    sensors,
    gateways,
    geofences,
    trails,
    parts,
    warehouses,
    suppliers,
    purchaseOrders,
    reports,
    cycleCounts,
    certifications,
    integrations,
    workflows,
    // A user's hash is on the document and must never reach a client.
    users: users.map((u) => {
      const { passwordHash: _hash, ...rest } = u;
      return rest;
    }),
    transfers,
    reservations,
    teams,
    apiKeys,
    webhooks,
    passkeys,
    backups,
    invoices,
    exportJobs,
    supportTickets,
    escalationPolicies,
    onCallShifts,
    complianceFrameworks,
    retentionPolicies,
    reportPacks,
    poLines,
    pendingScans,
    helpArticles: aliasId(helpArticles, 'slug'),
    helpCategories,
    unknownTagReads,
    scopeTree: buildScopeTree(scopeNodes),
    observedAt: new Date().toISOString(),
  };
}
