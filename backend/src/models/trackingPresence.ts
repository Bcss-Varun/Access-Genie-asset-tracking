import { model, Schema } from 'mongoose';
import {
  ASSET_CATEGORIES,
  CRITICALITIES,
  CUSTODY_STATES,
  JOURNEY_EVENT_KINDS,
  LOCATION_PRECISIONS,
  PRESENCE_STATES,
  TRACKING_EVENT_KINDS,
  type AssetCategory,
  type Criticality,
  type CustodyState,
  type JourneyStop,
  type LocationPrecision,
  type PresenceState,
  type TrackingEventKind,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

// Where things are, where they have been, and what the estate saw happen.

// ── Live presence ────────────────────────────────────────────────────────────
/**
 * The current resolved position of one asset — the row behind every dot on the
 * live map.
 *
 * One document per asset, updated in place rather than appended to: the map
 * asks "where is everything now?", and answering that from an event log would
 * mean an aggregation over the whole history on every paint. The history it
 * *does* need lives in `AssetJourney` and `TrackingEvent`.
 *
 * The key is an asset id but is deliberately not declared a `ref`: the estate
 * routinely hears tags belonging to assets that are not in the registry yet
 * (that gap is what `UnknownDetection` and the inventory exceptions are for),
 * so presence is the wider set of the two and must not imply otherwise.
 */
export interface AssetPresenceDoc {
  _id: string; // the assetId — one presence row per asset
  assetName: string;
  category: AssetCategory;
  state: PresenceState;
  custody: CustodyState;
  /** Facility ▸ zone the asset is resolved to right now. */
  facility: string;
  zone: string;
  /** Where the asset is *supposed* to be — drives the "misplaced" exception. */
  homeZone: string;
  /** Position on the facility floor-plan, as a percentage of width/height. */
  position?: { x: number; y: number };
  precision: LocationPrecision;
  /** 0–100 — how much we trust this fix. Low confidence is itself a finding. */
  confidence: number;
  lastSeen: Date;
  custodian: string;
  movingNow: boolean;
  /** Battery of the bound tag, where the tag has one (passive tags do not). */
  batteryPct?: number;
  criticality: Criticality;
  valueInr: number;
  /** Open alerts touching this asset — powers the map's attention ring. */
  alertIds: string[];
}

const assetPresenceSchema = new Schema<AssetPresenceDoc>(
  {
    _id: { type: String, required: true },
    assetName: { type: String, required: true },
    category: { type: String, required: true, enum: ASSET_CATEGORIES, index: true },
    state: { type: String, required: true, enum: PRESENCE_STATES, default: 'Online', index: true },
    custody: { type: String, required: true, enum: CUSTODY_STATES, default: 'In Place', index: true },
    facility: { type: String, required: true, index: true },
    zone: { type: String, required: true },
    homeZone: { type: String, required: true },
    position: { type: { x: Number, y: Number }, required: false },
    precision: { type: String, required: true, enum: LOCATION_PRECISIONS, default: 'Room' },
    confidence: { type: Number, required: true, min: 0, max: 100 },
    lastSeen: { type: Date, required: true, index: true },
    custodian: { type: String, required: true },
    movingNow: { type: Boolean, default: false },
    batteryPct: { type: Number, min: 0, max: 100 },
    criticality: { type: String, required: true, enum: CRITICALITIES, index: true },
    valueInr: { type: Number, required: true, min: 0 },
    alertIds: { type: [String], default: [] },
  },
  { versionKey: false },
);

assetPresenceSchema.plugin(baseSchemaPlugin);
// The workspace's default view: one facility, worst state first.
assetPresenceSchema.index({ facility: 1, state: 1 });
assetPresenceSchema.index({ assetName: 'text' }, { name: 'presence_search' });

assetPresenceSchema.virtual('assetId').get(function assetId(this: { _id: string }) {
  return this._id;
});

export const AssetPresence = model<AssetPresenceDoc>('AssetPresence', assetPresenceSchema);

// ── Journeys ─────────────────────────────────────────────────────────────────
export interface AssetJourneyDoc {
  _id: string; // the assetId — one journey per asset per retained window
  assetName: string;
  windowFrom: Date;
  windowTo: Date;
  distanceM: number;
  zonesVisited: number;
  /** Coverage holes in the window — the honest gaps in the trail. */
  gaps: number;
  stops: JourneyStop[];
}

const journeyStopSchema = new Schema(
  {
    at: { type: Date, required: true },
    zone: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    kind: { type: String, required: true, enum: JOURNEY_EVENT_KINDS },
    // A pass-through has no dwell and no actor; a coverage gap has neither and
    // carries a note instead. All three are optional for that reason.
    dwellMin: { type: Number, min: 0 },
    actor: String,
    note: String,
  },
  { _id: false },
);

const assetJourneySchema = new Schema<AssetJourneyDoc>(
  {
    _id: { type: String, required: true, ref: 'Asset' },
    assetName: { type: String, required: true },
    windowFrom: { type: Date, required: true },
    windowTo: { type: Date, required: true },
    distanceM: { type: Number, required: true, min: 0 },
    zonesVisited: { type: Number, required: true, min: 0 },
    gaps: { type: Number, default: 0, min: 0 },
    stops: { type: [journeyStopSchema], default: [] },
  },
  { versionKey: false },
);

assetJourneySchema.plugin(baseSchemaPlugin);
assetJourneySchema.virtual('assetId').get(function assetId(this: { _id: string }) {
  return this._id;
});

export const AssetJourney = model<AssetJourneyDoc>('AssetJourney', assetJourneySchema);

// ── Event stream ─────────────────────────────────────────────────────────────
/** What the estate saw: the workspace's rolling activity feed. */
export interface TrackingEventDoc {
  _id: string; // EV-01
  at: Date;
  kind: TrackingEventKind;
  title: string;
  detail: string;
  zone: string;
  actor: string;
  /** Presentation hint the feed colours the row with. */
  tone: string;
  assetId?: string;
  assetName?: string;
}

const trackingEventSchema = new Schema<TrackingEventDoc>(
  {
    _id: { type: String, required: true },
    at: { type: Date, required: true, index: true },
    kind: { type: String, required: true, enum: TRACKING_EVENT_KINDS, index: true },
    title: { type: String, required: true },
    detail: { type: String, default: '' },
    zone: { type: String, default: '' },
    actor: { type: String, default: '' },
    tone: { type: String, default: 'default' },
    assetId: { type: String, ref: 'Asset', index: true, sparse: true },
    assetName: String,
  },
  { versionKey: false },
);

trackingEventSchema.plugin(baseSchemaPlugin);
export const TrackingEvent = model<TrackingEventDoc>('TrackingEvent', trackingEventSchema);
