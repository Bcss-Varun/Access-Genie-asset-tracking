import { model, Schema } from 'mongoose';
import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  type AlertSeverity,
  type AlertStatus,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

export interface AlertDoc {
  _id: string; // ALT-501
  title: string;
  severity: AlertSeverity;
  type: string;
  assetId?: string;
  assetName?: string;
  status: AlertStatus;
  source: string;
  /** Who owns it. An alert nobody is named against is an alert nobody works. */
  assignedTo?: string;
  assignedAt?: Date;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const alertSchema = new Schema<AlertDoc>(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true },
    severity: { type: String, required: true, enum: ALERT_SEVERITIES, index: true },
    type: { type: String, required: true },
    assetId: { type: String, ref: 'Asset', index: true },
    assetName: { type: String },
    status: { type: String, required: true, enum: ALERT_STATUSES, default: 'Open', index: true },
    source: { type: String, required: true },
    assignedTo: { type: String, index: true },
    assignedAt: Date,
    acknowledgedBy: { type: String },
    acknowledgedAt: { type: Date },
    resolvedBy: { type: String },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

alertSchema.plugin(baseSchemaPlugin);
alertSchema.index({ title: 'text', type: 'text', assetName: 'text' }, { name: 'alert_search' });
// The alert centre's default query: unresolved, newest first.
alertSchema.index({ status: 1, severity: 1, createdAt: -1 });

/** Alerts that still demand attention — one definition, used everywhere. */
export const OPEN_ALERT_STATUSES: AlertStatus[] = ['Open', 'Escalated'];

export const Alert = model<AlertDoc>('Alert', alertSchema);
