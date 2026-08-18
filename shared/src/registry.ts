// ─────────────────────────────────────────────────────────────────────────────
// Registry contract — the configuration and satellite records that hang off the
// asset graph: collections, documents, maintenance plans, model metadata,
// reports, and the administration objects.
//
// Asset classes used to live here. They were removed along with their
// Administration screen and collection; asset *templates* (see registration.ts)
// now carry the "what does this kind of asset need" decision.
//
// As with `domain.ts`, these are the *wire* shapes. The Mongoose models in
// backend/src/models mirror them, exposing `id` (never `_id`) and ISO-8601 UTC
// strings for every timestamp.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkOrderType } from './domain.js';

// ── Attribute schema ─────────────────────────────────────────────────────────
export const ATTRIBUTE_TYPES = ['text', 'number', 'select', 'date', 'boolean'] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

/** One field in a class's per-class attribute schema. */
export interface AttributeDef {
  key: string;
  label: string;
  type: AttributeType;
  unit?: string;
  options?: string[];
  required?: boolean;
}

export const DOC_TYPES = ['Manual', 'Warranty', 'Certificate', 'Invoice', 'Image', 'CAD', 'Report'] as const;
export type DocType = (typeof DOC_TYPES)[number];

/**
 * Readiness gates. A gate is satisfied by data OR by an explicit decision —
 * "run to failure" and "not tracked by policy" are complete answers.
 * Deliberate absence counts; silent absence does not.
 *
 * A class names the subset it requires in `activationGates`; an asset cannot
 * leave Registration until each of those is met.
 */
export const GATE_KEYS = [
  'identified',
  'located',
  'accountable',
  'tracked',
  'financial',
  'maintainable',
  'documented',
  'monitored',
] as const;
export type GateKey = (typeof GATE_KEYS)[number];

// ── Collections ──────────────────────────────────────────────────────────────
export const GROUP_TYPES = ['Group', 'Fleet', 'Kit'] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

export interface AssetGroup {
  id: string;
  name: string;
  type: GroupType;
  description: string;
  memberIds: string[];
}

// ── Documents attached to assets ─────────────────────────────────────────────
export interface AssetDoc {
  id: string;
  assetId: string;
  name: string;
  type: DocType;
  sizeKb: number;
  uploadedAt: string;
  uploadedBy: string;
}

// ── Preventive maintenance ───────────────────────────────────────────────────
export const PM_FREQUENCIES = ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'Usage-based'] as const;
export type PmFrequency = (typeof PM_FREQUENCIES)[number];

export interface PmSchedule {
  id: string;
  title: string;
  assetId: string;
  assetName: string;
  frequency: PmFrequency;
  type: WorkOrderType;
  nextDue: string;
  lastDone: string;
  estHours: number;
  compliancePct: number;
  assignedTeam: string;
}

// ── Inspections ──────────────────────────────────────────────────────────────
// Moved to `inspections.ts` — the module now owns templates as well as records,
// and typed checkpoints replaced the label-and-result pair that used to live
// here. Both files are re-exported from the barrel, so importers are unaffected.

// ── AI / MLOps ───────────────────────────────────────────────────────────────
export const MODEL_STATUSES = ['Production', 'Staging', 'Shadow', 'Retired'] as const;
export type ModelStatus = (typeof MODEL_STATUSES)[number];

export interface ModelVersion {
  version: string;
  trainedAt: string;
  accuracy: number;
  status: ModelStatus;
  notes: string;
}

/** Relative contribution of one input, 0–1. */
export interface FeatureImportance {
  feature: string;
  importance: number;
}

export interface AiModel {
  id: string;
  name: string;
  task: string;
  status: ModelStatus;
  version: string;
  /** 0–100. */
  accuracy: number;
  /** Population-stability proxy, 0–100. */
  driftPct: number;
  lastTrained: string;
  owner: string;
  framework: string;
  predictionsPerDay: number;
  features: FeatureImportance[];
  versions: ModelVersion[];
}

export interface ForecastPoint {
  label: string;
  /** Absent for points that are still in the future. */
  actual?: number;
  forecast: number;
  lower: number;
  upper: number;
}

export interface ForecastSeries {
  id: string;
  name: string;
  unit: string;
  points: ForecastPoint[];
}

export const ANOMALY_SEVERITIES = ['Critical', 'Warning', 'Info'] as const;
export type AnomalySeverity = (typeof ANOMALY_SEVERITIES)[number];

export interface AnomalyEvent {
  id: string;
  assetId: string;
  assetName: string;
  metric: string;
  severity: AnomalySeverity;
  detectedAt: string;
  description: string;
  zScore: number;
  /** 0–100. */
  confidence: number;
}

// ── Analytics & reporting ────────────────────────────────────────────────────
export interface Report {
  id: string;
  name: string;
  /** Executive / Financial / Maintenance / Utilization / Compliance / AI. */
  category: string;
  persona: string;
  description: string;
  /** PDF / Excel / Dashboard. */
  format: string;
  /** Absent until the report has actually been run at least once. */
  lastRun?: string;
  metrics: string[];
  scheduled?: boolean;
}

// ── Compliance ───────────────────────────────────────────────────────────────
export const CYCLE_COUNT_STATUSES = ['Scheduled', 'In Progress', 'Reconciled', 'Variance'] as const;
export type CycleCountStatus = (typeof CYCLE_COUNT_STATUSES)[number];

export interface CycleCount {
  id: string;
  location: string;
  status: CycleCountStatus;
  counted: number;
  expected: number;
  date: string;
  assignedTo: string;
}

export const CERT_STATUSES = ['Valid', 'Expiring', 'Expired'] as const;
export type CertStatus = (typeof CERT_STATUSES)[number];

export interface Certification {
  id: string;
  assetId: string;
  assetName: string;
  name: string;
  authority: string;
  issuedAt: string;
  expiresAt: string;
  status: CertStatus;
}

// ── Administration ───────────────────────────────────────────────────────────
export const INTEGRATION_STATUSES = ['Connected', 'Disconnected', 'Error'] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export interface Integration {
  id: string;
  name: string;
  category: string;
  status: IntegrationStatus;
  lastSync: string;
  description: string;
}

export interface WorkflowStep {
  name: string;
  approver: string;
}

export interface ApprovalWorkflow {
  id: string;
  name: string;
  trigger: string;
  steps: WorkflowStep[];
  status: 'Active' | 'Draft';
}

// ── Operations: transfers & reservations ─────────────────────────────────────
/**
 * A transfer moves an asset permanently and needs a second pair of eyes;
 * `Rejected` and `Cancelled` are terminal states, not a pause. `Received` is
 * the physical handover; `Completed` is the movement being closed out
 * (paperwork/verification done) once it has been received.
 */
export const TRANSFER_STATUSES = [
  'Pending',
  'Approved',
  'Picked Up',
  'In Transit',
  'Received',
  'Completed',
  'Rejected',
  'Cancelled',
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export interface Transfer {
  id: string;
  assetId: string;
  assetName: string;
  from: string;
  to: string;
  requester: string;
  /** Must differ from `requester` — segregation of duties. */
  approver: string;
  status: TransferStatus;
  requestedAt: string;
  approvedAt?: string;
  pickedUpAt?: string;
  receivedAt?: string;
  completedAt?: string;
  reason: string;
  /** Who has it now, and who it is moving to — the custody half of the move. */
  custodian?: string;
  newCustodian?: string;
  /** The technician physically carrying out the pickup/delivery. */
  handler?: string;
  /** The field job this movement supports, if any. */
  workOrderId?: string;
  /**
   * Groups transfers raised together from a single multi-asset request — one
   * `Transfer` document per asset (the model every rule here already enforces
   * — one mover, one approver, one flow), tied together for display by a
   * shared batch id rather than a second "batch" collection.
   */
  batchId?: string;
  /** When the requester needs the asset to have arrived by. */
  requiredDate?: string;
  notes?: string;
}

export const RESERVATION_STATUSES = ['Pending', 'Confirmed', 'In Use', 'Returned', 'Cancelled'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export interface Reservation {
  id: string;
  assetId: string;
  assetName: string;
  reservedBy: string;
  /** Day offsets within the displayed week, 0 = Monday. */
  startDay: number;
  endDay: number;
  startLabel: string;
  endLabel: string;
  status: ReservationStatus;
  /** What the booking is for — shown on the calendar and the list. */
  purpose?: string;
}

// ── Mobile Workforce: field technicians ────────────────────────────────────
export const TECHNICIAN_SKILLS = [
  'Networking', 'Server Hardware', 'Storage Systems', 'Electrical & Power',
  'Mobile Devices', 'Security Systems', 'AV Equipment', 'HVAC',
] as const;
export type TechnicianSkill = (typeof TECHNICIAN_SKILLS)[number];

export const SHIFT_LABELS = ['Morning', 'Evening', 'Night'] as const;
export type ShiftLabel = (typeof SHIFT_LABELS)[number];

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type WeekdayLabel = (typeof WEEKDAY_LABELS)[number];

/**
 * A field technician — the roster Scheduling & Dispatch assigns work orders
 * against. Real record, real backend, same as everything else: `assignedTo`
 * on a work order is still a plain name (see WorkOrder), so assigning one of
 * these is an ordinary write, not a foreign key the rest of the system has to
 * know about.
 */
export interface Technician {
  id: string;
  name: string;
  title: string;
  department: string;
  skills: TechnicianSkill[];
  location: { id: string; name: string };
  shift: { label: ShiftLabel; start: number; end: number };
  workingDays: WeekdayLabel[];
  email: string;
  phone: string;
  /** False for a technician who has left / is deactivated — always shows as Unavailable. */
  active: boolean;
  /** Set for someone on leave through this date — Unavailable until then regardless of shift. */
  onLeaveUntil?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ── Platform administration ──────────────────────────────────────────────────
export interface Team {
  id: string;
  name: string;
  emoji: string;
  department: string;
  description: string;
  memberIds: string[];
  /** Headcount in the team but not on the platform (contractors, shared services). */
  extra: number;
}

/** A credential that can call the API. Only the last four characters are stored. */
export interface ApiKey {
  id: string;
  name: string;
  scope: 'organization' | 'personal';
  last4: string;
  scopes: string[];
  ownerId?: string;
  createdAt: string;
  lastUsed?: string;
  revokedAt?: string;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  lastDelivery?: string;
  /** Whether the last delivery succeeded. */
  ok: boolean;
}

export interface Passkey {
  id: string;
  userId: string;
  name: string;
  kind: string;
  added: string;
  lastUsed?: string;
}

export interface Backup {
  id: string;
  when: string;
  size: string;
  status: string;
}

export interface Invoice {
  id: string;
  date: string;
  /** Whole rupees. */
  amount: number;
  status: string;
}

export interface ExportJob {
  id: string;
  report: string;
  format: string;
  requestedBy: string;
  at: string;
  status: string;
  /** Zero while the job is still running. */
  sizeKb: number;
}

export interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  raisedBy?: string;
  body?: string;
  updated: string;
}

// ── Governance ───────────────────────────────────────────────────────────────
export interface EscalationTier {
  tier: number;
  notify: string;
  afterMin: number;
  channels: string[];
}

export interface EscalationPolicy {
  id: string;
  name: string;
  scope: string;
  severity: string;
  tone: string;
  tiers: EscalationTier[];
}

export interface OnCallShift {
  id: string;
  day: string;
  primary: string;
  secondary: string;
  window: string;
  order: number;
}

export interface ComplianceFramework {
  id: string;
  name: string;
  scope: string;
  status: string;
  /** Controls satisfied, 0–100. */
  coverage: number;
  lastAssessment: string;
  evidence: number;
}

/** `legalHold` overrides the schedule — nothing under hold is disposed of. */
export interface RetentionPolicy {
  id: string;
  dataClass: string;
  retention: string;
  disposal: string;
  legalHold: boolean;
}

export interface ReportPack {
  id: string;
  name: string;
  framework: string;
  description: string;
  format: string;
}

// ── Registration sources ─────────────────────────────────────────────────────
/**
 * A received purchase-order line waiting to become assets.
 *
 * Distinct from `PoLine` in the domain contract, which is a line *item* on a
 * purchase order document. This is the goods receipt viewed as a registration
 * queue.
 */
export interface ReceivedPoLine {
  id: string;
  poRef: string;
  vendor: string;
  receivedAt: string;
  description: string;
  manufacturer: string;
  model: string;
  classId: string;
  category: string;
  unitCost: number;
  quantity: number;
  /** How many of `quantity` have been registered already. */
  registered: number;
  warrantyMonths: number;
  facilityHint?: string;
}

/** A barcode + nameplate read from a handheld, waiting to be turned into an asset. */
export interface PendingScan {
  id: string;
  serial: string;
  manufacturer: string;
  model: string;
  classId: string;
  category: string;
  facility: string;
  building?: string;
  zone: string;
  /** OCR confidence, 0–100. */
  confidence: number;
  scannedAt: string;
  consumed: boolean;
}

// ── Help centre ──────────────────────────────────────────────────────────────
export interface HelpArticle {
  id: string;
  /** Same value as `id` — the URL segment. */
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  readMins: number;
  body?: string;
}

export interface HelpCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
}

// ── Organisation configuration ───────────────────────────────────────────────
// `ChecklistTemplate` was a name, a category and a list of plain strings. It is
// replaced by `InspectionTemplate` in `inspections.ts`, whose checkpoints carry
// a type, a required flag and a failure rule — none of which a `string[]` can
// express, and all of which the execution screen needs in order to be more than
// a row of tick boxes.

export const SUBSCRIPTION_CADENCES = ['Daily', 'Weekly', 'Monthly', 'Quarterly'] as const;
export type SubscriptionCadence = (typeof SUBSCRIPTION_CADENCES)[number];

/** A standing instruction to deliver a report on a schedule. */
export interface ReportSubscription {
  id: string;
  reportId: string;
  reportName: string;
  cadence: SubscriptionCadence;
  format: string;
  recipients: string[];
  enabled: boolean;
  nextRun: string;
  lastRun?: string;
  createdBy: string;
  createdAt: string;
}

/** Tenant identity and formatting preferences — a singleton keyed `ORG`. */
export interface OrgSettings {
  id: string;
  name: string;
  legalName: string;
  logoEmoji: string;
  /** Six-digit hex, applied by the shell as a CSS variable. */
  primaryColor: string;
  accentColor: string;
  loginMessage: string;
  supportEmail: string;
  timezone: string;
  dateFormat: string;
  currency: string;
  /** INR per hour of maintenance labour — the other half of a work order's cost. */
  laborRatePerHour: number;
  updatedAt: string;
}
