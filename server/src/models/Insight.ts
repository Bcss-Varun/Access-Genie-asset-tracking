import { model, Schema } from 'mongoose';
import {
  INSIGHT_SEVERITIES,
  INSIGHT_TYPES,
  type InsightSeverity,
  type InsightType,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * A model output surfaced to a human. `drivers` is not decoration — an insight
 * a user cannot interrogate is one they will not act on, so the explanation
 * ships with the score.
 */
export interface InsightDoc {
  _id: string; // INS-301
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  summary: string;
  assetId?: string;
  assetName?: string;
  confidence: number;
  impactInr?: number;
  impactLabel?: string;
  drivers: string[];
  recommendedAction: string;
  actionLabel: string;
  status: 'open' | 'actioned' | 'dismissed';
  createdAt: Date;
  updatedAt: Date;
}

const insightSchema = new Schema<InsightDoc>(
  {
    _id: { type: String, required: true },
    type: { type: String, required: true, enum: INSIGHT_TYPES, index: true },
    severity: { type: String, required: true, enum: INSIGHT_SEVERITIES, index: true },
    title: { type: String, required: true },
    summary: { type: String, required: true },
    assetId: { type: String, ref: 'Asset', index: true },
    assetName: { type: String },
    confidence: { type: Number, required: true, min: 0, max: 100 },
    impactInr: { type: Number },
    impactLabel: { type: String },
    drivers: { type: [String], default: [] },
    recommendedAction: { type: String, required: true },
    actionLabel: { type: String, required: true },
    status: { type: String, enum: ['open', 'actioned', 'dismissed'], default: 'open', index: true },
  },
  { timestamps: true },
);

insightSchema.plugin(baseSchemaPlugin);
insightSchema.index({ status: 1, severity: 1, createdAt: -1 });

export const Insight = model<InsightDoc>('Insight', insightSchema);
