import { model, Schema } from 'mongoose';
import {
  AUDIT_FINDING_STATUSES,
  AUDIT_STATUSES,
  AUDIT_TYPES,
  COMPLIANCE_SEVERITIES,
  type AuditFindingStatus,
  type AuditStatus,
  type AuditType,
  type ComplianceSeverity,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * Audit Center.
 *
 * An audit is an engagement, not a count — "Start Audit" used to open a
 * `CycleCount` (a physical inventory reconciliation), which cannot hold a
 * finding, evidence, or a corrective action. This is the real thing: an audit
 * scoped to a facility/org node, worked by a lead auditor, that raises
 * `AuditFinding`s as it goes. `findingsCount`/`openFindingsCount` are
 * denormalised onto the audit so the list screen never has to aggregate.
 */
export interface AuditEngagementDoc {
  _id: string; // ADT-1 (AUD is already the tracking audit-session prefix)
  name: string;
  type: AuditType;
  scopeId: string;
  status: AuditStatus;
  leadAuditor: string;
  startDate: Date;
  dueDate: Date;
  completedAt?: Date;
  summary?: string;
  findingsCount: number;
  openFindingsCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const auditSchema = new Schema<AuditEngagementDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: AUDIT_TYPES, index: true },
    scopeId: { type: String, required: true, index: true },
    status: { type: String, required: true, enum: AUDIT_STATUSES, default: 'Planned', index: true },
    leadAuditor: { type: String, required: true, ref: 'User' },
    startDate: { type: Date, required: true },
    dueDate: { type: Date, required: true, index: true },
    completedAt: { type: Date },
    summary: { type: String },
    findingsCount: { type: Number, default: 0, min: 0 },
    openFindingsCount: { type: Number, default: 0, min: 0 },
    createdBy: { type: String, default: '' },
  },
  { versionKey: false, timestamps: true },
);

auditSchema.index({ status: 1, scopeId: 1 });
auditSchema.index({ name: 'text', summary: 'text' }, { name: 'audit_search' });
auditSchema.plugin(baseSchemaPlugin);

export const Audit = model<AuditEngagementDoc>('Audit', auditSchema);

// ── Findings & evidence ──────────────────────────────────────────────────────

export interface AuditEvidenceSub {
  _id: string;
  label: string;
  note?: string;
  url?: string;
  uploadedBy: string;
  uploadedAt: Date;
}

const auditEvidenceSchema = new Schema<AuditEvidenceSub>(
  {
    _id: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    note: { type: String },
    url: { type: String },
    uploadedBy: { type: String, required: true },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false },
);

export interface AuditFindingDoc {
  _id: string; // AFN-1
  auditId: string;
  assetId?: string;
  assetName?: string;
  title: string;
  description: string;
  severity: ComplianceSeverity;
  status: AuditFindingStatus;
  correctiveAction?: string;
  assignedTo?: string;
  dueDate?: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  evidence: AuditEvidenceSub[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const auditFindingSchema = new Schema<AuditFindingDoc>(
  {
    _id: { type: String, required: true },
    auditId: { type: String, required: true, ref: 'Audit', index: true },
    assetId: { type: String, ref: 'Asset', index: true },
    assetName: { type: String },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    severity: { type: String, required: true, enum: COMPLIANCE_SEVERITIES, index: true },
    status: { type: String, required: true, enum: AUDIT_FINDING_STATUSES, default: 'Open', index: true },
    correctiveAction: { type: String },
    assignedTo: { type: String, ref: 'User' },
    dueDate: { type: Date },
    resolvedAt: { type: Date },
    resolvedBy: { type: String },
    evidence: { type: [auditEvidenceSchema], default: [] },
    createdBy: { type: String, default: '' },
  },
  { versionKey: false, timestamps: true },
);

auditFindingSchema.index({ auditId: 1, status: 1 });
auditFindingSchema.plugin(baseSchemaPlugin);

export const AuditFinding = model<AuditFindingDoc>('AuditFinding', auditFindingSchema);
