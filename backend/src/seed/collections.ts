/**
 * Every collection the seeders own.
 *
 * Shared by both entry points because they need the same answer to opposite
 * questions: `seed/index.ts` uses it to decide what `--fresh` may wipe, and
 * `seed/demo.ts` uses it to decide what the fixture set may drop before
 * reloading. Keeping one list means a collection added to the demo fixtures
 * cannot be left behind by a wipe.
 */
import type { Model } from 'mongoose';
import {
  Activity,
  AiModel,
  Alert,
  AlertRule,
  AnomalyEvent,
  ApiKey,
  ApprovalWorkflow,
  Asset,
  AssetDocument,
  AssetGroup,
  AssetJourney,
  AssetPresence,
  AuditLog,
  AuditSession,
  AutomationRule,
  Backup,
  Certification,
  ComplianceFramework,
  Counter,
  CoverageCell,
  CustodyRecord,
  CycleCount,
  EscalationPolicy,
  ExportJob,
  FirmwareCampaign,
  ForecastSeries,
  Gateway,
  Geofence,
  HelpArticle,
  HelpCategory,
  Incident,
  Insight,
  Inspection,
  Integration,
  InventoryException,
  InventoryRoom,
  Invoice,
  LabelTemplate,
  LifecycleTransition,
  MovementTrail,
  MovementTxn,
  Notification,
  OnCallShift,
  Part,
  Passkey,
  PendingScan,
  PmSchedule,
  PrintDevice,
  PrintJob,
  PurchaseOrder,
  Rack,
  ReceivedPoLine,
  Report,
  ReportPack,
  Reservation,
  RetentionPolicy,
  ScopeNodeModel,
  Sensor,
  Supplier,
  SupportTicket,
  Team,
  TrackedFacility,
  TrackedZone,
  TrackingAlert,
  TrackingDevice,
  TrackingEvent,
  Transfer,
  UnknownDetection,
  User,
  Warehouse,
  Webhook,
  WorkOrder,
  Zone,
} from '../models/index.js';

/**
 * The seeders write to fifty differently-typed models through a handful of
 * generic helpers. Mongoose's per-model generics do not unify across that set,
 * so the helpers take this deliberately loose view of a model — the shape they
 * actually use — rather than fighting the type system for no safety gain: the
 * documents are still validated by each schema on write.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SeedModel = Model<any>;

export const SEEDED_COLLECTIONS: SeedModel[] = [
  Asset, AssetGroup, AssetDocument, MovementTrail,
  WorkOrder, PmSchedule, Inspection,
  Alert, AlertRule, Insight, AiModel, ForecastSeries, AnomalyEvent,
  Sensor, Gateway, Geofence, Zone,
  TrackedFacility, TrackedZone, CoverageCell,
  AssetPresence, AssetJourney, TrackingEvent,
  TrackingAlert, Incident, AutomationRule, LifecycleTransition,
  InventoryRoom, Rack, AuditSession, InventoryException, UnknownDetection, MovementTxn,
  TrackingDevice, FirmwareCampaign,
  LabelTemplate, PrintDevice, PrintJob,
  Part, Warehouse, Supplier, PurchaseOrder,
  Report, CycleCount, Certification, Integration, ApprovalWorkflow,
  Transfer, Reservation,
  Team, ApiKey, Webhook, Passkey, Backup, Invoice, ExportJob, SupportTicket,
  EscalationPolicy, OnCallShift, ComplianceFramework, RetentionPolicy, ReportPack,
  ReceivedPoLine, PendingScan, HelpArticle, HelpCategory,
  Activity, CustodyRecord, Notification, AuditLog, ScopeNodeModel,
  User, Counter,
];
