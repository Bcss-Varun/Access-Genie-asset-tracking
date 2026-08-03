import { model, Schema } from 'mongoose';
import {
  ZONE_KINDS,
  ZONE_POLICIES,
  type ZoneKind,
  type ZonePolicy,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

// The physical estate the tracking workspace is drawn on: the facilities, the
// zones inside them, and how well each zone is covered by the radio estate.
// Zone.ts holds the older, simpler map zone used by the live-map payload; these
// are the tracking workspace's richer, policy-bearing zones.

// ── Facilities ───────────────────────────────────────────────────────────────
export interface TrackedFacilityDoc {
  _id: string; // slug, e.g. 'hyd-hq' — it appears in URLs
  name: string;
  short: string;
  building: string;
  emoji: string;
  assetsTracked: number;
  /** Radio coverage across the site, 0–100. */
  coverage: number;
  /** Whether a floor-plan exists to render the digital twin from. */
  twinReady: boolean;
}

const trackedFacilitySchema = new Schema<TrackedFacilityDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    short: { type: String, required: true },
    building: { type: String, required: true },
    emoji: { type: String, default: '🏢' },
    assetsTracked: { type: Number, default: 0, min: 0 },
    coverage: { type: Number, default: 0, min: 0, max: 100 },
    twinReady: { type: Boolean, default: false },
  },
  { versionKey: false },
);

trackedFacilitySchema.plugin(baseSchemaPlugin);

// The client reads a facility by its slug; expose it under that name too, so a
// caller never has to know the slug doubles as the primary key.
trackedFacilitySchema.virtual('slug').get(function slug(this: { _id: string }) {
  return this._id;
});

export const TrackedFacility = model<TrackedFacilityDoc>('TrackedFacility', trackedFacilitySchema);

// ── Zones ────────────────────────────────────────────────────────────────────
export interface TrackedZoneDoc {
  _id: string; // ZN-01
  name: string;
  facility: string;
  kind: ZoneKind;
  /** Rect on the floor-plan SVG, as a percentage of the 0–100 box. */
  x: number;
  y: number;
  width: number;
  height: number;
  policy: ZonePolicy;
  /** Inventory truth for the zone. */
  expected: number;
  detected: number;
  /** Signal coverage, 0–100. Below ~85 a zone starts producing false gaps. */
  coverage: number;
  violations24h: number;
  armed: boolean;
  dwellLimitMin?: number;
}

const trackedZoneSchema = new Schema<TrackedZoneDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    facility: { type: String, required: true, ref: 'TrackedFacility', index: true },
    kind: { type: String, required: true, enum: ZONE_KINDS, index: true },
    x: { type: Number, required: true, min: 0, max: 100 },
    y: { type: Number, required: true, min: 0, max: 100 },
    width: { type: Number, required: true, min: 0, max: 100 },
    height: { type: Number, required: true, min: 0, max: 100 },
    policy: { type: String, required: true, enum: ZONE_POLICIES, default: 'Open' },
    expected: { type: Number, default: 0, min: 0 },
    detected: { type: Number, default: 0, min: 0 },
    coverage: { type: Number, default: 100, min: 0, max: 100 },
    violations24h: { type: Number, default: 0, min: 0 },
    armed: { type: Boolean, default: false },
    // Only meaningful when `policy` is 'Dwell limit'.
    dwellLimitMin: { type: Number, min: 0 },
  },
  { versionKey: false },
);

trackedZoneSchema.plugin(baseSchemaPlugin);
export const TrackedZone = model<TrackedZoneDoc>('TrackedZone', trackedZoneSchema);

// ── Coverage ─────────────────────────────────────────────────────────────────
/**
 * Per-zone radio health. Derived from the device estate but stored, because the
 * screens that read it (heatmaps, infrastructure) read it far more often than
 * the estate changes.
 */
export interface CoverageCellDoc {
  _id: string; // the zoneId — one cell per zone
  zone: string;
  facility: string;
  coverage: number;
  devices: number;
  blindSpots: number;
  assetsAtRisk: number;
}

const coverageCellSchema = new Schema<CoverageCellDoc>(
  {
    _id: { type: String, required: true, ref: 'TrackedZone' },
    zone: { type: String, required: true },
    facility: { type: String, required: true, index: true },
    coverage: { type: Number, required: true, min: 0, max: 100 },
    devices: { type: Number, default: 0, min: 0 },
    blindSpots: { type: Number, default: 0, min: 0 },
    assetsAtRisk: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false },
);

coverageCellSchema.plugin(baseSchemaPlugin);
coverageCellSchema.virtual('zoneId').get(function zoneId(this: { _id: string }) {
  return this._id;
});

export const CoverageCell = model<CoverageCellDoc>('CoverageCell', coverageCellSchema);
