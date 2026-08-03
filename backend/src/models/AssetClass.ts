import { model, Schema } from 'mongoose';
import {
  ASSET_CATEGORIES,
  ATTRIBUTE_TYPES,
  CRITICALITIES,
  DOC_TYPES,
  GATE_KEYS,
  SENSOR_KINDS,
  type AssetCategory,
  type AttributeDef,
  type Criticality,
  type DocType,
  type GateKey,
  type SensorKind,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * An asset class — the template behind every asset of a kind.
 *
 * This is configuration, not operational data: a class decides how thousands of
 * assets behave (what they must record, whether they are expected to be tracked,
 * how they depreciate, what has to be true before one can be activated). It is
 * therefore edited from Administration, deliberately, rather than in the flow of
 * registering a unit.
 *
 * `assetCount` is deliberately absent: it is computed from the asset collection
 * whenever a class is read, because a stored count is a number that goes stale
 * the moment anyone creates an asset.
 */
export interface AssetClassDoc {
  _id: string; // CLS-COMP
  name: string;
  icon: string;
  description: string;
  /** Reporting category every asset of this class is filed under. */
  category: AssetCategory;
  parentId?: string;
  attributes: AttributeDef[];
  trackingExpected: boolean;
  preferredTags: SensorKind[];
  monitoringProfileId: string;
  activationGates: GateKey[];
  depreciationMethod: string;
  usefulLifeYears: number;
  pmPlan: string;
  documentChecklist: DocType[];
  defaultCriticality: Criticality;
  /** Purchase price above which activation needs a second pair of eyes (INR). */
  approvalThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}

const attributeSchema = new Schema<AttributeDef>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, required: true, enum: ATTRIBUTE_TYPES },
    unit: String,
    options: { type: [String], default: undefined },
    required: { type: Boolean, default: false },
  },
  { _id: false },
);

const assetClassSchema = new Schema<AssetClassDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true, unique: true },
    icon: { type: String, required: true, default: '📦' },
    description: { type: String, default: '' },
    // Defaulted, so classes created before this field existed read back as a
    // valid category rather than `undefined` — which would fail asset creation
    // in exactly the way this field was added to prevent.
    category: { type: String, enum: ASSET_CATEGORIES, default: 'Compute', index: true },
    parentId: { type: String, ref: 'AssetClass' },
    attributes: { type: [attributeSchema], default: [] },

    trackingExpected: { type: Boolean, default: true },
    preferredTags: { type: [String], enum: SENSOR_KINDS, default: [] },
    monitoringProfileId: { type: String, default: '' },
    activationGates: { type: [String], enum: GATE_KEYS, default: [] },

    depreciationMethod: { type: String, default: 'Straight-line (5yr)' },
    usefulLifeYears: { type: Number, required: true, min: 1, max: 40, default: 5 },
    pmPlan: { type: String, default: '' },
    documentChecklist: { type: [String], enum: DOC_TYPES, default: [] },
    defaultCriticality: { type: String, enum: CRITICALITIES, default: 'Medium' },
    approvalThreshold: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

assetClassSchema.plugin(baseSchemaPlugin);

export const AssetClass = model<AssetClassDoc>('AssetClass', assetClassSchema);
