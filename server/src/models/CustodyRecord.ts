import { model, Schema } from 'mongoose';
import { CUSTODY_ACTIONS, type CustodyAction } from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * Chain of custody — who held an asset, when, and who moved it. Append-only:
 * a custody chain you can edit is not a custody chain.
 */
export interface CustodyDoc {
  _id: string; // CUS-01
  assetId: string;
  assetName: string;
  holder: string;
  action: CustodyAction;
  at: Date;
  by: string;
}

const custodySchema = new Schema<CustodyDoc>(
  {
    _id: { type: String, required: true },
    assetId: { type: String, required: true, ref: 'Asset', index: true },
    assetName: { type: String, required: true },
    holder: { type: String, required: true },
    action: { type: String, required: true, enum: CUSTODY_ACTIONS },
    at: { type: Date, required: true, default: Date.now },
    by: { type: String, required: true },
  },
  { versionKey: false },
);

custodySchema.plugin(baseSchemaPlugin);
custodySchema.index({ assetId: 1, at: -1 });

export const CustodyRecord = model<CustodyDoc>('CustodyRecord', custodySchema);
