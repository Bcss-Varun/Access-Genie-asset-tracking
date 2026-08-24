import { model, Schema } from 'mongoose';
import {
  COMPLIANCE_CATEGORIES,
  COMPLIANCE_SEVERITIES,
  COMPLIANCE_SOURCES,
  COMPLIANCE_STATUSES,
  type ComplianceCategory,
  type ComplianceSeverity,
  type ComplianceSource,
  type ComplianceStatus,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * Compliance Monitoring.
 *
 * A finding against the estate — raised by hand, promoted from an audit
 * finding, or (later) by an automated sweep. Either `assetId` or `scopeId` is
 * set: an asset-level finding follows the asset through tenant scoping the
 * same way custody and certifications do, an organisation-level finding (a
 * policy gap, a training lapse) carries a scope node instead.
 */
export interface ComplianceRecordDoc {
  _id: string; // CMR-1
  assetId?: string;
  assetName?: string;
  scopeId?: string;
  title: string;
  description: string;
  category: ComplianceCategory;
  severity: ComplianceSeverity;
  status: ComplianceStatus;
  source: ComplianceSource;
  relatedAuditId?: string;
  relatedFindingId?: string;
  dueDate?: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNote?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const complianceRecordSchema = new Schema<ComplianceRecordDoc>(
  {
    _id: { type: String, required: true },
    assetId: { type: String, ref: 'Asset', index: true },
    assetName: { type: String },
    scopeId: { type: String, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, required: true, enum: COMPLIANCE_CATEGORIES, index: true },
    severity: { type: String, required: true, enum: COMPLIANCE_SEVERITIES, index: true },
    status: { type: String, required: true, enum: COMPLIANCE_STATUSES, default: 'Open', index: true },
    source: { type: String, required: true, enum: COMPLIANCE_SOURCES, default: 'Manual' },
    relatedAuditId: { type: String, ref: 'Audit' },
    relatedFindingId: { type: String, ref: 'AuditFinding' },
    dueDate: { type: Date, index: true },
    resolvedAt: { type: Date },
    resolvedBy: { type: String },
    resolutionNote: { type: String },
    createdBy: { type: String, default: '' },
  },
  { versionKey: false, timestamps: true },
);

complianceRecordSchema.index({ status: 1, severity: 1 });
complianceRecordSchema.index({ title: 'text', description: 'text' }, { name: 'compliance_record_search' });
complianceRecordSchema.plugin(baseSchemaPlugin);

export const ComplianceRecord = model<ComplianceRecordDoc>('ComplianceRecord', complianceRecordSchema);
