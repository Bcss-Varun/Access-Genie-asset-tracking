import { model, Schema } from 'mongoose';
import { PM_FREQUENCIES, WORK_ORDER_TYPES, type PmFrequency, type WorkOrderType } from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

// The planned side of maintenance: what is due. Work orders (the executed side)
// live in WorkOrder.ts — a PM schedule is the rule that raises them.

// ── Preventive maintenance schedules ─────────────────────────────────────────
export interface PmScheduleDoc {
  _id: string; // PM-01
  title: string;
  assetId: string;
  assetName: string;
  frequency: PmFrequency;
  type: WorkOrderType;
  nextDue: Date;
  lastDone: Date;
  estHours: number;
  /** Share of occurrences completed on time, 0–100. */
  compliancePct: number;
  assignedTeam: string;
  createdAt: Date;
  updatedAt: Date;
}

const pmScheduleSchema = new Schema<PmScheduleDoc>(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    assetId: { type: String, required: true, ref: 'Asset', index: true },
    assetName: { type: String, required: true },
    frequency: { type: String, required: true, enum: PM_FREQUENCIES, index: true },
    type: { type: String, required: true, enum: WORK_ORDER_TYPES },
    nextDue: { type: Date, required: true, index: true },
    lastDone: { type: Date, required: true },
    estHours: { type: Number, required: true, min: 0 },
    compliancePct: { type: Number, required: true, min: 0, max: 100 },
    assignedTeam: { type: String, required: true },
  },
  { timestamps: true },
);

pmScheduleSchema.plugin(baseSchemaPlugin);
pmScheduleSchema.index({ title: 'text', assetName: 'text' }, { name: 'pm_search' });
export const PmSchedule = model<PmScheduleDoc>('PmSchedule', pmScheduleSchema);

// Inspections moved to `inspection.ts` when the module grew templates of its
// own — see the note at the top of that file.
