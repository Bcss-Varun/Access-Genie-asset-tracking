import { model, Schema } from 'mongoose';
import { ZONE_TYPES, type ZoneType } from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/** A named area of the floor-plan. Coordinates are % of the 0-100 map box. */
export interface ZoneDoc {
  _id: string; // ZN-DOCK
  name: string;
  type: ZoneType;
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt: Date;
  updatedAt: Date;
}

const percent = { type: Number, required: true, min: 0, max: 100 };

const zoneSchema = new Schema<ZoneDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true, enum: ZONE_TYPES, index: true },
    x: percent,
    y: percent,
    width: percent,
    height: percent,
  },
  { timestamps: true },
);

zoneSchema.plugin(baseSchemaPlugin);

export const Zone = model<ZoneDoc>('Zone', zoneSchema);
