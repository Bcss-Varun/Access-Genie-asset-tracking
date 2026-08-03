import { model, Schema } from 'mongoose';
import { DOC_TYPES, GROUP_TYPES, type DocType, type GroupType } from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

// Satellite records that hang directly off an asset: the collections it belongs
// to, the documents attached to it, and where it has physically been. Each is a
// plain reference collection keyed by `assetId`, so they share a file rather
// than fragmenting into three near-identical modules.

// ── Collections (groups, fleets, kits) ───────────────────────────────────────
export interface AssetGroupDoc {
  _id: string; // GRP-01
  name: string;
  type: GroupType;
  description: string;
  memberIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const assetGroupSchema = new Schema<AssetGroupDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: GROUP_TYPES, index: true },
    description: { type: String, default: '' },
    // Indexed as a multikey so "which collections is this asset in?" is a
    // single indexed lookup rather than a scan of every group's array.
    memberIds: { type: [String], default: [], index: true },
  },
  { timestamps: true },
);

assetGroupSchema.plugin(baseSchemaPlugin);
export const AssetGroup = model<AssetGroupDoc>('AssetGroup', assetGroupSchema);

// ── Documents attached to an asset ───────────────────────────────────────────
export interface AssetDocDoc {
  _id: string; // DOC-01
  assetId: string;
  name: string;
  type: DocType;
  sizeKb: number;
  uploadedAt: Date;
  uploadedBy: string;
}

const assetDocSchema = new Schema<AssetDocDoc>(
  {
    _id: { type: String, required: true },
    assetId: { type: String, required: true, ref: 'Asset', index: true },
    name: { type: String, required: true },
    type: { type: String, required: true, enum: DOC_TYPES, index: true },
    sizeKb: { type: Number, required: true, min: 0 },
    uploadedAt: { type: Date, required: true },
    uploadedBy: { type: String, required: true },
  },
  { versionKey: false },
);

assetDocSchema.plugin(baseSchemaPlugin);
export const AssetDocument = model<AssetDocDoc>('AssetDocument', assetDocSchema);

// ── Movement trail ───────────────────────────────────────────────────────────
/**
 * The path an asset took across a facility floor plan, with the zones it dwelt
 * in. One document per asset: the trail is always read whole (it is drawn as a
 * single polyline), so splitting the points into their own collection would buy
 * nothing and cost a join.
 */
export interface MovementTrailDoc {
  _id: string; // the assetId — one trail per asset
  assetName: string;
  distanceM: number;
  dwellZones: { zone: string; minutes: number }[];
  points: { x: number; y: number; timestamp: Date; label?: string }[];
}

const trailPointSchema = new Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    timestamp: { type: Date, required: true },
    // Only the points worth annotating carry a label — the ones in between are
    // just the shape of the path.
    label: String,
  },
  { _id: false },
);

const dwellZoneSchema = new Schema(
  {
    zone: { type: String, required: true },
    minutes: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const movementTrailSchema = new Schema<MovementTrailDoc>(
  {
    _id: { type: String, required: true, ref: 'Asset' },
    assetName: { type: String, required: true },
    distanceM: { type: Number, required: true, min: 0 },
    dwellZones: { type: [dwellZoneSchema], default: [] },
    points: { type: [trailPointSchema], default: [] },
  },
  { versionKey: false },
);

movementTrailSchema.plugin(baseSchemaPlugin);
export const MovementTrail = model<MovementTrailDoc>('MovementTrail', movementTrailSchema);
