// Barrel for the data layer. Importing models from one place keeps Mongoose
// model registration order deterministic — every model is defined before the
// first query runs, so a `ref` can never resolve to an unregistered schema.

// ── Platform ─────────────────────────────────────────────────────────────────
export { Counter, nextId, syncCounter } from './Counter.js';
export { User, type UserDoc, type UserDocument } from './User.js';
export { RefreshToken, type RefreshTokenDoc } from './RefreshToken.js';
export { RateLimitHit, type RateLimitHitDoc } from './RateLimitHit.js';
export { UserPreference, type UserPreferenceDoc, type SavedViewDoc } from './UserPreference.js';
export { MetricSnapshot, type MetricSnapshotDoc } from './MetricSnapshot.js';
export { ScopeNodeModel, buildScopeTree, type ScopeNodeDoc } from './ScopeNode.js';
export { AuditLog, type AuditDoc } from './AuditLog.js';
export { Notification, type NotificationDoc, type NotificationDeliveryDoc } from './Notification.js';

// ── Asset graph ──────────────────────────────────────────────────────────────
export { Asset, healthStatusFor, type AssetDoc } from './Asset.js';
export { AssetTemplate, type AssetTemplateDoc } from './AssetTemplate.js';
export {
  AssetGroup,
  AssetDocument,
  MovementTrail,
  type AssetGroupDoc,
  type AssetDocDoc,
  type MovementTrailDoc,
} from './assetGraph.js';
export { Activity, type ActivityDoc } from './Activity.js';
export { CustodyRecord, type CustodyDoc } from './CustodyRecord.js';
export {
  LifecycleTransition,
  type LifecycleTransitionDoc,
  type LifecycleApprovalSub,
} from './LifecycleTransition.js';

// ── Maintenance ──────────────────────────────────────────────────────────────
export { WorkOrder, type WorkOrderDoc } from './WorkOrder.js';
export { PmSchedule, type PmScheduleDoc } from './maintenance.js';
export {
  Inspection,
  InspectionTemplate,
  type InspectionDoc,
  type InspectionTemplateDoc,
  type InspectionResponseSub,
  type InspectionCheckpointSub,
} from './inspection.js';

// ── Alerts ───────────────────────────────────────────────────────────────────
export { Alert, OPEN_ALERT_STATUSES, type AlertDoc } from './Alert.js';
export { AlertRule, type AlertRuleDoc } from './AlertRule.js';
// Separate from `Alert` on purpose: that one records an event that happened,
// this one a failure that has not. Different lifecycle, different evidence.
export { PredictiveAlert, type PredictiveAlertDoc, type PredictiveSignalSub } from './predictiveAlert.js';

// ── AI ───────────────────────────────────────────────────────────────────────
export { Insight, type InsightDoc } from './Insight.js';
export {
  AiModel,
  ForecastSeries,
  AnomalyEvent,
  type AiModelDoc,
  type ForecastSeriesDoc,
  type AnomalyEventDoc,
} from './ai.js';

// ── Tracking: operational estate ─────────────────────────────────────────────
export { Sensor, type SensorDoc } from './Sensor.js';
export { Gateway, type GatewayDoc } from './Gateway.js';
export { Geofence, type GeofenceDoc } from './Geofence.js';
export { Zone, type ZoneDoc } from './Zone.js';

// ── Tracking: workspace ──────────────────────────────────────────────────────
export {
  TrackedFacility,
  TrackedZone,
  CoverageCell,
  type TrackedFacilityDoc,
  type TrackedZoneDoc,
  type CoverageCellDoc,
} from './trackingSite.js';
export {
  AssetPresence,
  AssetJourney,
  TrackingEvent,
  type AssetPresenceDoc,
  type AssetJourneyDoc,
  type TrackingEventDoc,
} from './trackingPresence.js';
export {
  TrackingAlert,
  Incident,
  AutomationRule,
  OPEN_TRACKING_ALERT_STATES,
  type TrackingAlertDoc,
  type IncidentDoc,
  type AutomationRuleDoc,
} from './trackingOps.js';
export {
  InventoryRoom,
  Rack,
  AuditSession,
  InventoryException,
  UnknownDetection,
  MovementTxn,
  type InventoryRoomDoc,
  type RackDoc,
  type AuditSessionDoc,
  type InventoryExceptionDoc,
  type UnknownDetectionDoc,
  type MovementTxnDoc,
} from './trackingInventory.js';
export {
  TrackingDevice,
  FirmwareCampaign,
  type TrackingDeviceDoc,
  type FirmwareCampaignDoc,
} from './trackingDevice.js';

// ── Labelling ────────────────────────────────────────────────────────────────
export {
  LabelTemplate,
  PrintDevice,
  PrintJob,
  OPEN_PRINT_JOB_STATES,
  type LabelTemplateDoc,
  type PrintDeviceDoc,
  type PrintJobDoc,
} from './labelling.js';

// ── Operations ───────────────────────────────────────────────────────────────
export {
  Transfer,
  Reservation,
  TRANSFER_FLOW,
  type TransferDoc,
  type ReservationDoc,
} from './operations.js';

// ── Mobile Workforce ─────────────────────────────────────────────────────────
export { Technician, type TechnicianDoc } from './Technician.js';

// ── Reporting, compliance & administration ───────────────────────────────────
export {
  Report,
  CycleCount,
  Certification,
  Integration,
  ApprovalWorkflow,
  EscalationPolicy,
  OnCallShift,
  ComplianceFramework,
  RetentionPolicy,
  ReportPack,
  type ReportDoc,
  type ReportDefinitionSub,
  type CycleCountDoc,
  type CertificationDoc,
  type IntegrationDoc,
  type ApprovalWorkflowDoc,
  type EscalationPolicyDoc,
  type OnCallShiftDoc,
  type ComplianceFrameworkDoc,
  type RetentionPolicyDoc,
  type ReportPackDoc,
} from './governance.js';

// ── Platform administration ──────────────────────────────────────────────────
export {
  Team,
  ApiKey,
  Webhook,
  Passkey,
  Backup,
  Invoice,
  ExportJob,
  SupportTicket,
  ReceivedPoLine,
  PendingScan,
  HelpArticle,
  HelpCategory,
  type TeamDoc,
  type ApiKeyDoc,
  type WebhookDoc,
  type PasskeyDoc,
  type BackupDoc,
  type InvoiceDoc,
  type ExportJobDoc,
  type SupportTicketDoc,
  type ReceivedPoLineDoc,
  type PendingScanDoc,
  type HelpArticleDoc,
  type HelpCategoryDoc,
} from './platform.js';

// ── Organisation configuration ───────────────────────────────────────────────
export {
  ReportSubscription,
  OrgSettings,
  ExportArtifact,
  RoleGrant,
  SUBSCRIPTION_CADENCES,
  type ReportSubscriptionDoc,
  type OrgSettingsDoc,
  type ExportArtifactDoc,
  type RoleGrantDoc,
  type SubscriptionCadence,
} from './configuration.js';

export * from './approval.js';
export * from './numbering.js';
export * from './notificationRule.js';
