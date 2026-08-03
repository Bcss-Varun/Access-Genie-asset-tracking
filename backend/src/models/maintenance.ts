import { model, Schema } from 'mongoose';
import {
  INSPECTION_RESULTS,
  INSPECTION_STATUSES,
  PM_FREQUENCIES,
  WORK_ORDER_TYPES,
  type InspectionItem,
  type InspectionStatus,
  type PmFrequency,
  type WorkOrderType,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

// The planned side of maintenance: what is due, and what was checked. Work
// orders (the executed side) live in WorkOrder.ts — a PM schedule is the rule
// that raises them, an inspection is the record that one was carried out.

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

// ── Inspections ──────────────────────────────────────────────────────────────
export interface InspectionDoc {
  _id: string; // INS-01
  title: string;
  assetId: string;
  assetName: string;
  template: string;
  status: InspectionStatus;
  dueDate: Date;
  inspector: string;
  items: InspectionItem[];
  createdAt: Date;
  updatedAt: Date;
}

const inspectionItemSchema = new Schema<InspectionItem>(
  {
    label: { type: String, required: true },
    result: { type: String, required: true, enum: INSPECTION_RESULTS, default: 'Pending' },
    note: String,
  },
  { _id: false },
);

const inspectionSchema = new Schema<InspectionDoc>(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    assetId: { type: String, required: true, ref: 'Asset', index: true },
    assetName: { type: String, required: true },
    template: { type: String, required: true },
    status: { type: String, required: true, enum: INSPECTION_STATUSES, default: 'Scheduled', index: true },
    dueDate: { type: Date, required: true, index: true },
    inspector: { type: String, required: true },
    items: { type: [inspectionItemSchema], default: [] },
  },
  { timestamps: true },
);

inspectionSchema.plugin(baseSchemaPlugin);
inspectionSchema.index({ title: 'text', assetName: 'text' }, { name: 'inspection_search' });
export const Inspection = model<InspectionDoc>('Inspection', inspectionSchema);
