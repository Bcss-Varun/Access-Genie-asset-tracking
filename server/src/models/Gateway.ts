import { model, Schema } from 'mongoose';
import {
  GATEWAY_KINDS,
  GATEWAY_STATUSES,
  type GatewayKind,
  type GatewayStatus,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/** Edge infrastructure: the readers and anchors that sensors report through. */
export interface GatewayDoc {
  _id: string; // GW-01
  name: string;
  kind: GatewayKind;
  status: GatewayStatus;
  connectedDevices: number;
  firmwareVersion: string;
  uptimePct: number;
  location: string;
  ip?: string;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

const gatewaySchema = new Schema<GatewayDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    kind: { type: String, required: true, enum: GATEWAY_KINDS, index: true },
    status: { type: String, required: true, enum: GATEWAY_STATUSES, default: 'Online', index: true },
    connectedDevices: { type: Number, default: 0, min: 0 },
    firmwareVersion: { type: String, required: true },
    uptimePct: { type: Number, required: true, min: 0, max: 100, default: 100 },
    location: { type: String, required: true },
    ip: { type: String },
    lastSeen: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

gatewaySchema.plugin(baseSchemaPlugin);

export const Gateway = model<GatewayDoc>('Gateway', gatewaySchema);
