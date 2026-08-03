import { model, Schema } from 'mongoose';
import { ACTIVITY_TYPES, type ActivityType } from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * Append-only event stream per asset — the closest thing this build has to the
 * event-sourced core in docs/11. Nothing here is ever updated in place: the
 * asset's timeline is the audit trail a compliance reviewer reads.
 */
export interface ActivityDoc {
  _id: Schema.Types.ObjectId;
  assetId: string;
  type: ActivityType;
  description: string;
  actor: string;
  timestamp: Date;
}

const activitySchema = new Schema<ActivityDoc>(
  {
    assetId: { type: String, required: true, ref: 'Asset', index: true },
    type: { type: String, required: true, enum: ACTIVITY_TYPES, index: true },
    description: { type: String, required: true },
    actor: { type: String, required: true },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

activitySchema.plugin(baseSchemaPlugin);
// The asset-360 timeline query: one asset, newest first.
activitySchema.index({ assetId: 1, timestamp: -1 });

export const Activity = model<ActivityDoc>('Activity', activitySchema);
