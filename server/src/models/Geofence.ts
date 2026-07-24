import { model, Schema } from 'mongoose';
import { GEOFENCE_RULES, type GeofenceRule } from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * A rule-bearing rectangle on the facility floor-plan. Coordinates are percent
 * of the 0-100 map box rather than absolute pixels, so one fence definition
 * renders correctly on any screen size and on any re-scaled floor plan.
 */
export interface GeofenceDoc {
  _id: string; // GF-01
  name: string;
  zoneId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rule: GeofenceRule;
  breaches24h: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const percent = { type: Number, required: true, min: 0, max: 100 };

const geofenceSchema = new Schema<GeofenceDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    zoneId: { type: String, ref: 'Zone' },
    x: percent,
    y: percent,
    width: percent,
    height: percent,
    rule: { type: String, required: true, enum: GEOFENCE_RULES, index: true },
    breaches24h: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

geofenceSchema.plugin(baseSchemaPlugin);

export const Geofence = model<GeofenceDoc>('Geofence', geofenceSchema);
