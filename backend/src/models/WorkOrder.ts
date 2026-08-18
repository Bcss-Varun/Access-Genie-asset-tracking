import { model, Schema } from 'mongoose';
import {
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_SOURCES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
  type WorkOrderPriority,
  type WorkOrderSource,
  type WorkOrderStatus,
  type WorkOrderType,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

export interface WorkOrderDoc {
  _id: string; // WO-2001
  title: string;
  assetId: string;
  /** Denormalized so a work-order list never needs a join to render. */
  assetName: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  type: WorkOrderType;
  assignedTo: string;
  /** When the work is planned to start. Absent on jobs nobody has booked in yet. */
  scheduledDate?: Date;
  dueDate: Date;
  description: string;
  estimatedHours: number;
  /** @deprecated Nothing writes this any more. Kept so old records still load. */
  aiGenerated: boolean;
  source?: WorkOrderSource;
  requiredSkill?: string;
  checklist: { label: string; done: boolean }[];
  parts: { sku: string; name: string; qty: number; unitCost: number }[];
  laborLog: { tech: string; hours: number; note: string; at: Date }[];
  comments: { author: string; text: string; at: Date }[];
  history: { from: WorkOrderStatus | null; to: WorkOrderStatus; at: Date; actor: string; note?: string }[];
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const checklistItemSchema = new Schema(
  { label: { type: String, required: true }, done: { type: Boolean, default: false } },
  { _id: false },
);

const partSchema = new Schema(
  {
    sku: { type: String, required: true },
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    unitCost: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const laborSchema = new Schema(
  {
    tech: { type: String, required: true },
    hours: { type: Number, required: true, min: 0 },
    note: { type: String, default: '' },
    at: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const commentSchema = new Schema(
  {
    author: { type: String, required: true },
    text: { type: String, required: true },
    at: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

/**
 * The status trail.
 *
 * `from` is nullable and the opening entry uses it: a work order's history
 * starts with "created as New", not with its first change — otherwise the state
 * an order was opened in has to be inferred from the absence of an entry, which
 * is exactly the sort of inference an audit trail exists to remove.
 */
const statusEventSchema = new Schema(
  {
    from: { type: String, enum: [...WORK_ORDER_STATUSES, null], default: null },
    to: { type: String, required: true, enum: WORK_ORDER_STATUSES },
    at: { type: Date, required: true, default: Date.now },
    actor: { type: String, required: true },
    note: { type: String },
  },
  { _id: false },
);

const workOrderSchema = new Schema<WorkOrderDoc>(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    assetId: { type: String, required: true, ref: 'Asset', index: true },
    assetName: { type: String, required: true },
    status: { type: String, required: true, enum: WORK_ORDER_STATUSES, default: 'New', index: true },
    priority: { type: String, required: true, enum: WORK_ORDER_PRIORITIES, default: 'Medium', index: true },
    type: { type: String, required: true, enum: WORK_ORDER_TYPES, default: 'Corrective' },
    assignedTo: { type: String, required: true, index: true },
    scheduledDate: { type: Date, index: true },
    dueDate: { type: Date, required: true, index: true },
    description: { type: String, default: '' },
    estimatedHours: { type: Number, required: true, min: 0, default: 1 },
    aiGenerated: { type: Boolean, default: false },
    source: { type: String, enum: WORK_ORDER_SOURCES },
    requiredSkill: { type: String, trim: true },
    checklist: { type: [checklistItemSchema], default: [] },
    parts: { type: [partSchema], default: [] },
    laborLog: { type: [laborSchema], default: [] },
    comments: { type: [commentSchema], default: [] },
    history: { type: [statusEventSchema], default: [] },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

workOrderSchema.plugin(baseSchemaPlugin);
workOrderSchema.index({ title: 'text', description: 'text', assetName: 'text' }, { name: 'wo_search' });
// The board's default query: open work orders by due date.
workOrderSchema.index({ status: 1, dueDate: 1 });
// The list view's default cut — origin and priority are the two filters that
// are almost always set, and both are low-cardinality enough to lead.
workOrderSchema.index({ source: 1, priority: 1, dueDate: 1 });

/** Completion timestamp is owned by the model, not by whoever calls the API. */
workOrderSchema.pre('save', function stampCompletion(next) {
  if (this.isModified('status')) {
    if (this.status === 'Completed' && !this.completedAt) this.completedAt = new Date();
    if (this.status !== 'Completed') this.completedAt = undefined;
  }
  next();
});

export const WorkOrder = model<WorkOrderDoc>('WorkOrder', workOrderSchema);
