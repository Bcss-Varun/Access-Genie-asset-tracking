import { model, Schema } from 'mongoose';
import {
  DEVICE_ROLES,
  DEVICE_STATES,
  TRACKING_TECHS,
  type DeviceDiagnostic,
  type DeviceRole,
  type DeviceState,
  type TrackingTech,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

// The radio estate — the hardware that makes tracking possible, and the
// campaigns that keep its firmware current.
//
// Sensor.ts and Gateway.ts model the same hardware for the *operational*
// screens (which tag is on which asset, which reader is online). This is the
// administrator's view of the same estate: topology, firmware, uptime, and when
// each unit needs replacing.

export interface TrackingDeviceDoc {
  _id: string; // DEV-0001
  name: string;
  role: DeviceRole;
  state: DeviceState;
  /** The radio. Admin-only detail — never a filter on an operational screen. */
  technology: TrackingTech;
  facility: string;
  zone: string;
  firmware: string;
  firmwareLatest: string;
  uptimePct: number;
  batteryPct?: number;
  signalPct?: number;
  /** Tags served (readers/gateways) or assets covered (anchors). */
  serves: number;
  /** Parent in the topology: a tag reports through a gateway, an anchor through a cluster. */
  parentId?: string;
  lastSeen: Date;
  installedAt: Date;
  /** Predicted end of serviceable life — drives the replacement queue. */
  replaceBy?: Date;
  ip?: string;
  /** Set for tags: the asset this device is bound to. */
  assetId?: string;
  assetName?: string;
  diagnostics: DeviceDiagnostic[];
}

const diagnosticSchema = new Schema<DeviceDiagnostic>(
  {
    label: { type: String, required: true },
    value: { type: String, required: true },
    state: { type: String, required: true, enum: ['ok', 'warn', 'bad'], default: 'ok' },
  },
  { _id: false },
);

const trackingDeviceSchema = new Schema<TrackingDeviceDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, required: true, enum: DEVICE_ROLES, index: true },
    state: { type: String, required: true, enum: DEVICE_STATES, default: 'Healthy', index: true },
    technology: { type: String, required: true, enum: TRACKING_TECHS, index: true },
    facility: { type: String, required: true, index: true },
    zone: { type: String, default: '' },
    firmware: { type: String, required: true },
    firmwareLatest: { type: String, required: true },
    uptimePct: { type: Number, default: 100, min: 0, max: 100 },
    batteryPct: { type: Number, min: 0, max: 100 },
    signalPct: { type: Number, min: 0, max: 100 },
    serves: { type: Number, default: 0, min: 0 },
    // Self-reference: the estate is a tree (tag → gateway → cluster).
    parentId: { type: String, ref: 'TrackingDevice', index: true, sparse: true },
    lastSeen: { type: Date, required: true, index: true },
    installedAt: { type: Date, required: true },
    replaceBy: Date,
    ip: String,
    assetId: { type: String, ref: 'Asset', index: true, sparse: true },
    assetName: String,
    diagnostics: { type: [diagnosticSchema], default: [] },
  },
  { versionKey: false },
);

trackingDeviceSchema.plugin(baseSchemaPlugin);
// The infrastructure screen's default view: one site, unhealthy hardware first.
trackingDeviceSchema.index({ facility: 1, state: 1, role: 1 });
trackingDeviceSchema.index({ name: 'text' }, { name: 'device_search' });

/** Firmware behind the latest build is the estate's most common silent fault. */
trackingDeviceSchema.virtual('firmwareStale').get(function stale(this: TrackingDeviceDoc) {
  return this.firmware !== this.firmwareLatest;
});

export const TrackingDevice = model<TrackingDeviceDoc>('TrackingDevice', trackingDeviceSchema);

// ── Firmware campaigns ───────────────────────────────────────────────────────
export interface FirmwareCampaignDoc {
  _id: string; // FW-01
  name: string;
  targetRole: DeviceRole;
  fromVersion: string;
  toVersion: string;
  total: number;
  done: number;
  failed: number;
  state: 'Draft' | 'Scheduled' | 'Running' | 'Paused' | 'Complete';
  /** Human-readable maintenance window, e.g. "Sat 02:00–04:00 IST". */
  window: string;
  owner: string;
}

const firmwareCampaignSchema = new Schema<FirmwareCampaignDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    targetRole: { type: String, required: true, enum: DEVICE_ROLES },
    fromVersion: { type: String, required: true },
    toVersion: { type: String, required: true },
    total: { type: Number, default: 0, min: 0 },
    done: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
    state: {
      type: String,
      required: true,
      enum: ['Draft', 'Scheduled', 'Running', 'Paused', 'Complete'],
      default: 'Draft',
      index: true,
    },
    window: { type: String, default: '' },
    owner: { type: String, default: '' },
  },
  { versionKey: false },
);

firmwareCampaignSchema.plugin(baseSchemaPlugin);
export const FirmwareCampaign = model<FirmwareCampaignDoc>('FirmwareCampaign', firmwareCampaignSchema);
