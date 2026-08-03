import { model, Schema } from 'mongoose';
import {
  ANOMALY_SEVERITIES,
  MODEL_STATUSES,
  type AnomalySeverity,
  type FeatureImportance,
  type ForecastPoint,
  type ModelStatus,
  type ModelVersion,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

// The MLOps side of the platform: which models are deployed, what they project,
// and what they flagged. Insight.ts holds the *recommendations* a model produced;
// these three collections describe the models themselves and their raw output.

// ── Model registry ───────────────────────────────────────────────────────────
export interface AiModelDoc {
  _id: string; // MDL-01
  name: string;
  task: string;
  status: ModelStatus;
  version: string;
  /** Headline accuracy for the live version, 0–100. */
  accuracy: number;
  /** Population-stability proxy — how far live inputs have drifted, 0–100. */
  driftPct: number;
  lastTrained: Date;
  owner: string;
  framework: string;
  predictionsPerDay: number;
  features: FeatureImportance[];
  versions: ModelVersion[];
  createdAt: Date;
  updatedAt: Date;
}

const featureSchema = new Schema<FeatureImportance>(
  {
    feature: { type: String, required: true },
    importance: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false },
);

const modelVersionSchema = new Schema(
  {
    version: { type: String, required: true },
    trainedAt: { type: Date, required: true },
    accuracy: { type: Number, required: true, min: 0, max: 100 },
    status: { type: String, required: true, enum: MODEL_STATUSES },
    notes: { type: String, default: '' },
  },
  { _id: false },
);

const aiModelSchema = new Schema<AiModelDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    task: { type: String, required: true },
    status: { type: String, required: true, enum: MODEL_STATUSES, default: 'Staging', index: true },
    version: { type: String, required: true },
    accuracy: { type: Number, required: true, min: 0, max: 100 },
    driftPct: { type: Number, required: true, min: 0, max: 100 },
    lastTrained: { type: Date, required: true },
    owner: { type: String, required: true },
    framework: { type: String, required: true },
    predictionsPerDay: { type: Number, required: true, min: 0 },
    features: { type: [featureSchema], default: [] },
    versions: { type: [modelVersionSchema], default: [] },
  },
  { timestamps: true },
);

aiModelSchema.plugin(baseSchemaPlugin);
export const AiModel = model<AiModelDoc>('AiModel', aiModelSchema);

// ── Forecast series ──────────────────────────────────────────────────────────
/**
 * A projection with its confidence band. Stored whole rather than as one
 * document per point: a series is only ever read and charted in full.
 */
export interface ForecastSeriesDoc {
  _id: string; // FC-01
  name: string;
  unit: string;
  points: ForecastPoint[];
}

const forecastPointSchema = new Schema<ForecastPoint>(
  {
    label: { type: String, required: true },
    // Absent for points still in the future — that absence is what makes the
    // chart able to draw history and projection as two different strokes.
    actual: Number,
    forecast: { type: Number, required: true },
    lower: { type: Number, required: true },
    upper: { type: Number, required: true },
  },
  { _id: false },
);

const forecastSeriesSchema = new Schema<ForecastSeriesDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    unit: { type: String, required: true },
    points: { type: [forecastPointSchema], default: [] },
  },
  { versionKey: false },
);

forecastSeriesSchema.plugin(baseSchemaPlugin);
export const ForecastSeries = model<ForecastSeriesDoc>('ForecastSeries', forecastSeriesSchema);

// ── Anomaly events ───────────────────────────────────────────────────────────
export interface AnomalyEventDoc {
  _id: string; // ANO-01
  assetId: string;
  assetName: string;
  metric: string;
  severity: AnomalySeverity;
  detectedAt: Date;
  description: string;
  /** Standard deviations from the learned baseline. */
  zScore: number;
  /** 0–100. */
  confidence: number;
}

const anomalyEventSchema = new Schema<AnomalyEventDoc>(
  {
    _id: { type: String, required: true },
    assetId: { type: String, required: true, ref: 'Asset', index: true },
    assetName: { type: String, required: true },
    metric: { type: String, required: true, index: true },
    severity: { type: String, required: true, enum: ANOMALY_SEVERITIES, index: true },
    detectedAt: { type: Date, required: true, index: true },
    description: { type: String, required: true },
    zScore: { type: Number, required: true },
    confidence: { type: Number, required: true, min: 0, max: 100 },
  },
  { versionKey: false },
);

anomalyEventSchema.plugin(baseSchemaPlugin);
export const AnomalyEvent = model<AnomalyEventDoc>('AnomalyEvent', anomalyEventSchema);
