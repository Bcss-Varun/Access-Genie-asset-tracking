import { model, Schema } from 'mongoose';
import { ALERT_SEVERITIES, type AlertSeverity } from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/** The condition that mints an alert, plus where it gets delivered. */
export interface AlertRuleDoc {
  _id: string; // RUL-01
  name: string;
  condition: string;
  severity: AlertSeverity;
  channels: string[];
  enabled: boolean;
  triggered24h: number;
  createdAt: Date;
  updatedAt: Date;
}

const alertRuleSchema = new Schema<AlertRuleDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    condition: { type: String, required: true },
    severity: { type: String, required: true, enum: ALERT_SEVERITIES },
    channels: { type: [String], default: [] },
    enabled: { type: Boolean, default: true, index: true },
    triggered24h: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

alertRuleSchema.plugin(baseSchemaPlugin);

export const AlertRule = model<AlertRuleDoc>('AlertRule', alertRuleSchema);
