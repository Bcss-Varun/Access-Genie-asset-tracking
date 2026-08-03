import { model, Schema } from 'mongoose';
import {
  SENSOR_KINDS,
  SENSOR_STATUSES,
  type SensorKind,
  type SensorStatus,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * A physical tracking device bonded to an asset. Vendor-neutral by design —
 * `kind` spans RFID/BLE/UWB/GPS/QR/LoRaWAN and nothing in the schema is
 * specific to a hardware SKU.
 */
export interface SensorDoc {
  _id: string; // SEN-101
  name: string;
  kind: SensorKind;
  assetId?: string;
  assetName?: string;
  status: SensorStatus;
  /** Absent on passive tags (RFID/QR) — they have no battery to report. */
  batteryLevel?: number;
  signalStrength: number;
  firmwareVersion: string;
  gatewayId: string;
  zone?: string;
  lastReading: Date;
  /** EPC / MAC / IMEI / QR payload, as printed on the physical tag. */
  tagId?: string;
  facility?: string;
  createdAt: Date;
  updatedAt: Date;
}

const sensorSchema = new Schema<SensorDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    kind: { type: String, required: true, enum: SENSOR_KINDS, index: true },
    assetId: { type: String, ref: 'Asset', index: true },
    assetName: { type: String },
    status: { type: String, required: true, enum: SENSOR_STATUSES, default: 'Online', index: true },
    batteryLevel: { type: Number, min: 0, max: 100 },
    signalStrength: { type: Number, required: true, min: 0, max: 100, default: 100 },
    firmwareVersion: { type: String, required: true, default: '1.0.0' },
    gatewayId: { type: String, required: true, ref: 'Gateway', index: true },
    zone: { type: String },
    lastReading: { type: Date, required: true, default: Date.now },
    tagId: { type: String, unique: true, sparse: true },
    facility: { type: String, index: true },
  },
  { timestamps: true },
);

sensorSchema.plugin(baseSchemaPlugin);
sensorSchema.index({ name: 'text', tagId: 'text', assetName: 'text' }, { name: 'sensor_search' });

export const Sensor = model<SensorDoc>('Sensor', sensorSchema);
