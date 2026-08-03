import { model, Schema } from 'mongoose';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * Immutable record of who did what. Written by the audit service on every
 * state-changing request; there is no update or delete path to this collection
 * anywhere in the codebase, which is the point.
 */
export interface AuditDoc {
  _id: Schema.Types.ObjectId;
  actor: string;
  action: string;
  target: string;
  category: string;
  ip: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

const auditSchema = new Schema<AuditDoc>(
  {
    actor: { type: String, required: true, index: true },
    action: { type: String, required: true },
    target: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    ip: { type: String, default: '' },
    timestamp: { type: Date, required: true, default: Date.now },
    metadata: { type: Schema.Types.Mixed },
  },
  { versionKey: false },
);

auditSchema.plugin(baseSchemaPlugin);
auditSchema.index({ timestamp: -1 });

export const AuditLog = model<AuditDoc>('AuditLog', auditSchema);
