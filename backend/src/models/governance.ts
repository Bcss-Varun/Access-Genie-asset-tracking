import { model, Schema } from 'mongoose';
import {
  CERT_STATUSES,
  ROLE_IDS,
  WORKFLOW_STATUSES,
  CYCLE_COUNT_STATUSES,
  INTEGRATION_STATUSES,
  type CertStatus,
  type CycleCountStatus,
  type IntegrationStatus,
  type WorkflowStatus,
  type WorkflowStep,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

// Reporting, compliance and platform administration. Five read-mostly reference
// collections that share a file because none of them owns behaviour of its own;
// the moment one grows real rules it earns its own service and module.

// ── Reports ──────────────────────────────────────────────────────────────────
/**
 * A saved report.
 *
 * `definition` is the whole point: a source, the dimensions to group by, the
 * measures to aggregate, the filters and a chart type. It is the *question*,
 * never the answer — running a report executes it against the live collections
 * (see `services/reportQuery.service.ts`), so reopening one next month reports
 * next month's estate rather than replaying the figures from the day it was
 * written. There is no stored result set anywhere in this module.
 *
 * It is optional because reports written before the query engine existed have
 * none. Those are surfaced as `legacy` and run through the fixed category
 * queries they were built for, rather than being silently reinterpreted as
 * something the author never asked for.
 *
 * `scheduled` is **not** stored. Whether a report has a standing delivery is a
 * fact about `ReportSubscription`, and keeping a copy here is how the two come
 * to disagree; the read joins them instead.
 */
export interface ReportDefinitionSub {
  source: string;
  dimensions: string[];
  measures: string[];
  filters: { field: string; op: string; value: unknown }[];
  visualization: string;
  sort?: string;
  limit?: number;
}

export interface ReportDoc {
  _id: string; // RPT-01
  name: string;
  /** Executive / Financial / Maintenance / Utilization / Compliance / AI / Custom. */
  category: string;
  persona: string;
  description: string;
  /** Legacy display format. Export format is chosen when the report is run. */
  format: string;
  definition?: ReportDefinitionSub;
  createdBy: string;
  lastRun?: Date;
  /** Rows in the last run. Absent until it has been run at least once. */
  lastRunRows?: number;
  metrics: string[];
  /** @deprecated Read from `ReportSubscription`; kept so old records still load. */
  scheduled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Stored with `strict: false` on the clause value because a filter value is a
 * string, a number, a boolean or a pair of them depending on the operator —
 * and a schema that insists on one of those rejects three legitimate filters.
 */
const reportFilterSchema = new Schema(
  {
    field: { type: String, required: true },
    op: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const reportDefinitionSchema = new Schema<ReportDefinitionSub>(
  {
    source: { type: String, required: true },
    // Order is meaningful: dimensions group outer-to-inner, and the first
    // measure is the one a chart plots.
    dimensions: { type: [String], default: [] },
    measures: { type: [String], default: [] },
    filters: { type: [reportFilterSchema], default: [] },
    visualization: { type: String, default: 'table' },
    sort: String,
    limit: { type: Number, min: 1 },
  },
  { _id: false },
);

const reportSchema = new Schema<ReportDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, index: true },
    persona: { type: String, required: true },
    description: { type: String, default: '' },
    format: { type: String, required: true },
    definition: { type: reportDefinitionSchema, required: false },
    createdBy: { type: String, default: '' },
    // Not required: a report that has never been run has no last run, and
    // stamping "now" at creation is how a brand-new report comes to claim it
    // already produced something.
    lastRun: Date,
    lastRunRows: { type: Number, min: 0 },
    metrics: { type: [String], default: [] },
    scheduled: { type: Boolean, default: false },
  },
  { timestamps: true },
);

reportSchema.plugin(baseSchemaPlugin);
reportSchema.index({ name: 'text', description: 'text' }, { name: 'report_search' });
export const Report = model<ReportDoc>('Report', reportSchema);

// ── Cycle counts ─────────────────────────────────────────────────────────────
export interface CycleCountDoc {
  _id: string; // CC-01
  location: string;
  status: CycleCountStatus;
  counted: number;
  expected: number;
  date: Date;
  assignedTo: string;
}

const cycleCountSchema = new Schema<CycleCountDoc>(
  {
    _id: { type: String, required: true },
    location: { type: String, required: true, index: true },
    status: { type: String, required: true, enum: CYCLE_COUNT_STATUSES, default: 'Scheduled', index: true },
    counted: { type: Number, required: true, min: 0 },
    expected: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, index: true },
    assignedTo: { type: String, required: true },
  },
  { versionKey: false },
);

cycleCountSchema.plugin(baseSchemaPlugin);
export const CycleCount = model<CycleCountDoc>('CycleCount', cycleCountSchema);

// ── Certifications ───────────────────────────────────────────────────────────
export interface CertificationDoc {
  _id: string; // CERT-01
  assetId: string;
  assetName: string;
  name: string;
  authority: string;
  issuedAt: Date;
  expiresAt: Date;
  status: CertStatus;
}

const certificationSchema = new Schema<CertificationDoc>(
  {
    _id: { type: String, required: true },
    assetId: { type: String, required: true, ref: 'Asset', index: true },
    assetName: { type: String, required: true },
    name: { type: String, required: true },
    authority: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    // Indexed because the compliance screens' primary question is "what lapses
    // next?", which is a sort on this field.
    expiresAt: { type: Date, required: true, index: true },
    status: { type: String, required: true, enum: CERT_STATUSES, index: true },
  },
  { versionKey: false },
);

certificationSchema.plugin(baseSchemaPlugin);
export const Certification = model<CertificationDoc>('Certification', certificationSchema);

// ── Integrations ─────────────────────────────────────────────────────────────
export interface IntegrationDoc {
  _id: string; // INT-01
  name: string;
  category: string;
  status: IntegrationStatus;
  lastSync: Date;
  description: string;
}

const integrationSchema = new Schema<IntegrationDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, index: true },
    status: { type: String, required: true, enum: INTEGRATION_STATUSES, default: 'Disconnected', index: true },
    lastSync: { type: Date, required: true },
    description: { type: String, default: '' },
  },
  { versionKey: false },
);

integrationSchema.plugin(baseSchemaPlugin);
export const Integration = model<IntegrationDoc>('Integration', integrationSchema);

// ── Approval workflows ───────────────────────────────────────────────────────
export interface ApprovalWorkflowDoc {
  _id: string; // WF-01
  name: string;
  description: string;
  /** An `ApprovalTrigger`. Held as a string so an unknown value reads rather than throws. */
  trigger: string;
  /** The scope-node this applies within. Absent = the whole organisation. */
  scopeId?: string;
  steps: WorkflowStep[];
  status: WorkflowStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const workflowStepSchema = new Schema<WorkflowStep>(
  {
    order: { type: Number, required: true, min: 1 },
    name: { type: String, required: true },
    // `approver` is the legacy free-text label. The two fields below are what
    // the engine actually resolves against; the label is kept so existing rows
    // still render rather than showing a blank step.
    approver: { type: String, default: '' },
    approverRole: { type: String, enum: ROLE_IDS },
    approverUserId: { type: String },
  },
  { _id: false },
);

const approvalWorkflowSchema = new Schema<ApprovalWorkflowDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    trigger: { type: String, required: true, index: true },
    // Indexed with `trigger` because resolving a workflow for an operation asks
    // exactly this pair, on every transfer raised.
    scopeId: { type: String, index: true },
    // Order is the approval order, so this array is a sequence, not a set.
    steps: { type: [workflowStepSchema], default: [] },
    status: { type: String, required: true, enum: WORKFLOW_STATUSES, default: 'Draft', index: true },
    createdBy: { type: String, default: '' },
  },
  { versionKey: false, timestamps: true },
);

approvalWorkflowSchema.index({ trigger: 1, status: 1 });

approvalWorkflowSchema.plugin(baseSchemaPlugin);
export const ApprovalWorkflow = model<ApprovalWorkflowDoc>('ApprovalWorkflow', approvalWorkflowSchema);

// ── Escalation policies ──────────────────────────────────────────────────────
/**
 * Who gets woken up, and when.
 *
 * The tiers are an ordered ladder: tier 1 at `afterMin: 0`, each subsequent tier
 * after its own delay. Storing the delay per tier rather than as a running total
 * is what lets a tier be inserted without recomputing the ones below it.
 */
export interface EscalationTier {
  tier: number;
  notify: string;
  afterMin: number;
  channels: string[];
}

export interface EscalationPolicyDoc {
  _id: string; // ESC-01
  name: string;
  scope: string;
  severity: string;
  /** Presentation hint for the policy card. */
  tone: string;
  tiers: EscalationTier[];
}

const escalationTierSchema = new Schema<EscalationTier>(
  {
    tier: { type: Number, required: true, min: 1 },
    notify: { type: String, required: true },
    afterMin: { type: Number, required: true, min: 0 },
    channels: { type: [String], default: [] },
  },
  { _id: false },
);

const escalationPolicySchema = new Schema<EscalationPolicyDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    scope: { type: String, default: '' },
    severity: { type: String, required: true, index: true },
    tone: { type: String, default: 'slate' },
    tiers: { type: [escalationTierSchema], default: [] },
  },
  { versionKey: false },
);
escalationPolicySchema.plugin(baseSchemaPlugin);
export const EscalationPolicy = model<EscalationPolicyDoc>('EscalationPolicy', escalationPolicySchema);

// ── On-call rota ─────────────────────────────────────────────────────────────
export interface OnCallShiftDoc {
  _id: string;
  day: string;
  primary: string;
  secondary: string;
  window: string;
  order: number;
}

const onCallShiftSchema = new Schema<OnCallShiftDoc>(
  {
    _id: { type: String, required: true },
    day: { type: String, required: true },
    primary: { type: String, required: true },
    secondary: { type: String, default: '' },
    window: { type: String, default: '' },
    // The rota is a sequence, and "Mon–Tue" does not sort itself.
    order: { type: Number, required: true },
  },
  { versionKey: false },
);
onCallShiftSchema.plugin(baseSchemaPlugin);
export const OnCallShift = model<OnCallShiftDoc>('OnCallShift', onCallShiftSchema);

// ── Regulatory frameworks ────────────────────────────────────────────────────
export interface ComplianceFrameworkDoc {
  _id: string; // soc2
  name: string;
  scope: string;
  status: string;
  /** Controls satisfied, 0–100. */
  coverage: number;
  lastAssessment: Date;
  /** Artefacts attached as proof. */
  evidence: number;
}

const complianceFrameworkSchema = new Schema<ComplianceFrameworkDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    scope: { type: String, default: '' },
    status: { type: String, required: true, index: true },
    coverage: { type: Number, required: true, min: 0, max: 100 },
    lastAssessment: { type: Date, required: true },
    evidence: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false },
);
complianceFrameworkSchema.plugin(baseSchemaPlugin);
export const ComplianceFramework = model<ComplianceFrameworkDoc>('ComplianceFramework', complianceFrameworkSchema);

// ── Retention policies ───────────────────────────────────────────────────────
/** `legalHold` overrides the schedule — nothing under hold is ever disposed of. */
export interface RetentionPolicyDoc {
  _id: string; // RP-01
  dataClass: string;
  retention: string;
  disposal: string;
  legalHold: boolean;
}

const retentionPolicySchema = new Schema<RetentionPolicyDoc>(
  {
    _id: { type: String, required: true },
    dataClass: { type: String, required: true },
    retention: { type: String, required: true },
    disposal: { type: String, required: true },
    legalHold: { type: Boolean, default: false, index: true },
  },
  { versionKey: false },
);
retentionPolicySchema.plugin(baseSchemaPlugin);
export const RetentionPolicy = model<RetentionPolicyDoc>('RetentionPolicy', retentionPolicySchema);

// ── Standard report packs ────────────────────────────────────────────────────
/** A pre-built evidence bundle mapped to a framework. */
export interface ReportPackDoc {
  _id: string; // STD-SOC2
  name: string;
  framework: string;
  description: string;
  format: string;
}

const reportPackSchema = new Schema<ReportPackDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    framework: { type: String, required: true, index: true },
    description: { type: String, default: '' },
    format: { type: String, default: 'PDF' },
  },
  { versionKey: false },
);
reportPackSchema.plugin(baseSchemaPlugin);
export const ReportPack = model<ReportPackDoc>('ReportPack', reportPackSchema);
