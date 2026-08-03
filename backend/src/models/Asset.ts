import { model, Schema } from 'mongoose';
import {
  ASSET_CATEGORIES,
  ASSET_HEALTHS,
  ASSET_STATUSES,
  CRITICALITIES,
  TRACKING_TECHS,
  type AssetCategory,
  type AssetHealth,
  type AssetStatus,
  type Criticality,
  type TrackingTech,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';
import { onboardingSchema } from './onboarding.schema.js';

/**
 * The asset graph's root document — "one asset graph": the record, where it is,
 * what condition it is in, and what the models predict about it, all on one
 * object. Related time-ordered facts (activity, custody, telemetry) live in
 * their own collections and reference `assetId`.
 */
export interface AssetDoc {
  _id: string; // AST-1001
  name: string;
  category: AssetCategory;
  serialNumber: string;
  status: AssetStatus;
  healthScore: number;
  healthStatus: AssetHealth;
  location: {
    id: string;
    name: string;
    building?: string;
    floor?: string;
    zone?: string;
    coordinates?: { lat: number; lng: number };
  };
  custodian: string;
  purchaseDate: Date;
  purchasePrice: number;
  tags: string[];
  telemetry?: {
    temperature?: number;
    humidity?: number;
    vibration?: number;
    batteryLevel?: number;
    lastPing: Date;
  };
  manufacturer?: string;
  model?: string;
  criticality?: Criticality;
  riskScore?: number;
  utilization?: number;
  bookValue?: number;
  depreciationMethod?: string;
  warrantyExpiry?: Date;
  trackingTech?: TrackingTech;
  trackingId?: string;
  lifecycleStage?: string;
  mapPosition?: { x: number; y: number };
  healthTrend?: { label: string; value: number }[];
  /**
   * The registration record — readiness gates, tag bindings, commercial terms.
   * Embedded rather than kept alongside; see models/onboarding.schema.ts.
   */
  onboarding?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const trendPointSchema = new Schema(
  { label: { type: String, required: true }, value: { type: Number, required: true } },
  { _id: false },
);

const assetSchema = new Schema<AssetDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, enum: ASSET_CATEGORIES, index: true },
    serialNumber: { type: String, required: true, unique: true, trim: true },
    status: { type: String, required: true, enum: ASSET_STATUSES, default: 'Active', index: true },
    healthScore: { type: Number, required: true, min: 0, max: 100, default: 100 },
    healthStatus: { type: String, required: true, enum: ASSET_HEALTHS, default: 'Good', index: true },

    location: {
      id: { type: String, required: true },
      name: { type: String, required: true },
      building: String,
      floor: String,
      zone: String,
      coordinates: {
        type: { lat: Number, lng: Number },
        required: false,
      },
    },

    custodian: { type: String, required: true },
    purchaseDate: { type: Date, required: true },
    purchasePrice: { type: Number, required: true, min: 0 },
    tags: { type: [String], default: [] },

    telemetry: {
      type: {
        temperature: Number,
        humidity: Number,
        vibration: Number,
        batteryLevel: { type: Number, min: 0, max: 100 },
        lastPing: { type: Date, required: true },
      },
      required: false,
    },

    manufacturer: String,
    model: String,
    criticality: { type: String, enum: CRITICALITIES, index: true },
    riskScore: { type: Number, min: 0, max: 100 },
    utilization: { type: Number, min: 0, max: 100 },
    bookValue: { type: Number, min: 0 },
    depreciationMethod: String,
    warrantyExpiry: Date,
    trackingTech: { type: String, enum: TRACKING_TECHS, index: true },
    trackingId: { type: String, index: true, sparse: true },
    lifecycleStage: String,
    mapPosition: { type: { x: Number, y: Number }, required: false },
    healthTrend: { type: [trendPointSchema], default: undefined },
    onboarding: { type: onboardingSchema, required: false },
  },
  { timestamps: true },
);

assetSchema.plugin(baseSchemaPlugin);

// Text index powers `?q=` free-text search across the fields users actually
// search by — name, serial, tag ID, manufacturer.
assetSchema.index(
  { name: 'text', serialNumber: 'text', trackingId: 'text', manufacturer: 'text', model: 'text' },
  { name: 'asset_search', weights: { name: 10, serialNumber: 6, trackingId: 6, manufacturer: 2, model: 2 } },
);
// Compound index for the registry's default view: filter by status/category,
// sorted by health.
assetSchema.index({ status: 1, category: 1, healthScore: 1 });
assetSchema.index({ 'location.name': 1 });

/**
 * Health band is derived, never stored independently — a score and a status
 * that disagree is a class of bug we simply remove.
 */
export function healthStatusFor(score: number): AssetHealth {
  if (score >= 75) return 'Good';
  if (score >= 45) return 'Warning';
  return 'Critical';
}

assetSchema.pre('save', function syncHealthStatus(next) {
  if (this.isModified('healthScore')) this.healthStatus = healthStatusFor(this.healthScore);
  next();
});

export const Asset = model<AssetDoc>('Asset', assetSchema);
