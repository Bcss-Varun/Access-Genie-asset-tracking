import { model, Schema } from 'mongoose';
import {
  PREDICTIVE_ALERT_SOURCES,
  PREDICTIVE_ALERT_STATUSES,
  PREDICTIVE_ALERT_TYPES,
  PREDICTIVE_SEVERITIES,
  type PredictiveAlertSource,
  type PredictiveAlertStatus,
  type PredictiveAlertType,
  type PredictiveSeverity,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * Predictive Alerts.
 *
 * One collection. A row is a claim that an asset is heading for a failure, plus
 * the evidence for the claim and what became of it.
 *
 * Two things are deliberately *not* stored, and both for the same reason — a
 * stored copy is a copy that goes stale with nothing to detect the drift:
 *
 *   **Facility.** Resolved from the asset's location on every read. An asset
 *   that moves would otherwise leave every historic alert naming the wrong site.
 *
 *   **Work-order state.** The alert holds `workOrderIds` and nothing else about
 *   them. Their status, assignee and due date are read from the orders.
 *
 * `detectedAt` is separate from `createdAt` because they answer different
 * questions: when the condition was observed, versus when the row reached us. A
 * batch import at midnight must not make every alert look like a midnight event.
 */

export interface PredictiveSignalSub {
  label: string;
  value: string;
  baseline?: string;
  detail?: string;
  weight?: number;
}

export interface PredictiveAlertDoc {
  _id: string; // PA-1
  title: string;
  severity: PredictiveSeverity;
  type: PredictiveAlertType;
  status: PredictiveAlertStatus;
  source: PredictiveAlertSource;

  assetId: string;
  assetName: string;

  confidence: number;
  detectedAt: Date;
  predictedFailureAt?: Date;

  reason: string;
  signals: PredictiveSignalSub[];
  recommendation: {
    action: string;
    priority: 'Low' | 'Medium' | 'High' | 'Critical';
    dueInDays: number;
    estimatedHours: number;
    requiredSkill?: string;
  };

  detector?: { name: string; version?: string; modelId?: string };

  workOrderIds: string[];

  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  dismissedBy?: string;
  dismissedAt?: Date;
  dismissedReason?: string;
  resolvedBy?: string;
  resolvedAt?: Date;

  history: { from: PredictiveAlertStatus | null; to: PredictiveAlertStatus; at: Date; actor: string; note?: string }[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const signalSchema = new Schema<PredictiveSignalSub>(
  {
    label: { type: String, required: true, trim: true },
    // A string, not a number: "78 °C", "3.4 mm/s RMS" and "14 reallocated
    // sectors" are all readings, and forcing them through a numeric column
    // means the unit lives somewhere else and eventually disagrees.
    value: { type: String, required: true, trim: true },
    baseline: { type: String, trim: true },
    detail: { type: String, trim: true },
    weight: { type: Number, min: 0, max: 100 },
  },
  { _id: false },
);

const statusEventSchema = new Schema(
  {
    // Nullable, and the opening entry uses it: an alert's trail starts with
    // "raised as Open", not with its first change.
    from: { type: String, enum: [...PREDICTIVE_ALERT_STATUSES, null], default: null },
    to: { type: String, required: true, enum: PREDICTIVE_ALERT_STATUSES },
    at: { type: Date, required: true, default: Date.now },
    actor: { type: String, required: true },
    note: { type: String },
  },
  { _id: false },
);

const predictiveAlertSchema = new Schema<PredictiveAlertDoc>(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    severity: { type: String, required: true, enum: PREDICTIVE_SEVERITIES, default: 'Medium', index: true },
    type: { type: String, required: true, enum: PREDICTIVE_ALERT_TYPES, default: 'Degradation Trend', index: true },
    status: { type: String, required: true, enum: PREDICTIVE_ALERT_STATUSES, default: 'Open', index: true },
    source: { type: String, required: true, enum: PREDICTIVE_ALERT_SOURCES, default: 'Manual', index: true },

    assetId: { type: String, required: true, ref: 'Asset', index: true },
    assetName: { type: String, required: true },

    confidence: { type: Number, required: true, min: 0, max: 100, index: true },
    detectedAt: { type: Date, required: true, default: Date.now, index: true },
    predictedFailureAt: { type: Date },

    reason: { type: String, required: true, trim: true },
    signals: { type: [signalSchema], default: [] },
    recommendation: {
      action: { type: String, required: true, trim: true },
      priority: { type: String, required: true, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
      dueInDays: { type: Number, required: true, min: 0, max: 365, default: 7 },
      estimatedHours: { type: Number, required: true, min: 0, max: 1000, default: 2 },
      requiredSkill: { type: String, trim: true },
    },

    // Absent on a manually raised alert. The screen reads that absence as
    // "a person judged this", which is the honest label for it.
    detector: {
      type: new Schema(
        {
          name: { type: String, required: true, trim: true },
          version: { type: String, trim: true },
          modelId: { type: String, trim: true },
        },
        { _id: false },
      ),
      required: false,
    },

    workOrderIds: { type: [String], default: [] },

    acknowledgedBy: { type: String },
    acknowledgedAt: { type: Date },
    dismissedBy: { type: String },
    dismissedAt: { type: Date },
    dismissedReason: { type: String },
    resolvedBy: { type: String },
    resolvedAt: { type: Date },

    history: { type: [statusEventSchema], default: [] },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

predictiveAlertSchema.plugin(baseSchemaPlugin);
predictiveAlertSchema.index({ title: 'text', assetName: 'text', reason: 'text' }, { name: 'predictive_alert_search' });
// The board's default cut: live alerts, most severe and most recent first.
predictiveAlertSchema.index({ status: 1, severity: 1, detectedAt: -1 });
// The detail view's "other alerts on this asset" panel.
predictiveAlertSchema.index({ assetId: 1, detectedAt: -1 });

export const PredictiveAlert = model<PredictiveAlertDoc>('PredictiveAlert', predictiveAlertSchema);
