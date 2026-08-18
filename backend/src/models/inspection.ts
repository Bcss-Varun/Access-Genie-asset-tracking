import { model, Schema } from 'mongoose';
import {
  ASSET_CATEGORIES,
  INSPECTION_QUESTION_TYPES,
  INSPECTION_RESULTS,
  INSPECTION_STATUSES,
  INSPECTION_TYPES,
  type AssetCategory,
  type InspectionQuestionType,
  type InspectionResult,
  type InspectionStatus,
  type InspectionType,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * Inspections & Checklists.
 *
 * Two collections, one module. `InspectionTemplate` is the reusable body of
 * checks and the scope it applies to; `Inspection` is one execution of a
 * template against one asset.
 *
 * An inspection **copies** its template's checkpoints in at creation and stamps
 * the version it copied. Editing a template therefore cannot rewrite an
 * inspection that has already been carried out — which is the whole point of
 * keeping a compliance record.
 */

// ── Templates ────────────────────────────────────────────────────────────────

export interface InspectionCheckpointSub {
  key: string;
  label: string;
  type: InspectionQuestionType;
  required: boolean;
  helpText?: string;
  min?: number;
  max?: number;
  unit?: string;
  failWhen?: 'Fail' | 'No' | 'Yes';
}

export interface InspectionTemplateDoc {
  _id: string; // INT-1
  name: string;
  description: string;
  type: InspectionType;
  category: string;
  icon: string;
  checkpoints: InspectionCheckpointSub[];
  scope: { assetIds: string[]; assetCategories: AssetCategory[]; facilityIds: string[] };
  estimatedMinutes: number;
  active: boolean;
  version: number;
  /** Joined on read by the service, never stored — see listTemplates. */
  usageCount?: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const checkpointSchema = new Schema<InspectionCheckpointSub>(
  {
    // Stable within the template: responses refer back to this, so relabelling
    // a checkpoint does not orphan answers already recorded against it.
    key: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: INSPECTION_QUESTION_TYPES, default: 'Pass/Fail' },
    required: { type: Boolean, default: true },
    helpText: { type: String },
    min: { type: Number },
    max: { type: Number },
    unit: { type: String },
    failWhen: { type: String, enum: ['Fail', 'No', 'Yes'] },
  },
  { _id: false },
);

const inspectionTemplateSchema = new Schema<InspectionTemplateDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    type: { type: String, required: true, enum: INSPECTION_TYPES, default: 'Safety', index: true },
    category: { type: String, required: true, default: 'General', index: true },
    icon: { type: String, default: '🔎' },
    checkpoints: { type: [checkpointSchema], default: [] },
    scope: {
      // All three empty means "any asset" — a general safety checklist should
      // not have to enumerate the estate to be usable.
      assetIds: { type: [String], default: [] },
      assetCategories: { type: [String], enum: ASSET_CATEGORIES, default: [] },
      facilityIds: { type: [String], default: [] },
    },
    estimatedMinutes: { type: Number, default: 15, min: 0, max: 1440 },
    // Retired rather than deleted: a template with history behind it must stay
    // readable, and deleting one would strand every inspection raised from it.
    active: { type: Boolean, default: true, index: true },
    version: { type: Number, default: 1, min: 1 },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

inspectionTemplateSchema.plugin(baseSchemaPlugin);
inspectionTemplateSchema.index({ name: 'text', description: 'text' }, { name: 'inspection_template_search' });
inspectionTemplateSchema.index({ active: 1, type: 1, name: 1 });

export const InspectionTemplate = model<InspectionTemplateDoc>('InspectionTemplate', inspectionTemplateSchema);

// ── Records ──────────────────────────────────────────────────────────────────

export interface InspectionResponseSub {
  key: string;
  label: string;
  type: InspectionQuestionType;
  required: boolean;
  helpText?: string;
  min?: number;
  max?: number;
  unit?: string;
  failWhen?: 'Fail' | 'No' | 'Yes';
  result: InspectionResult;
  value: string | number | boolean | null;
  note?: string;
  finding?: string;
}

export interface InspectionDoc {
  _id: string; // INS-1
  title: string;
  templateId?: string;
  templateName: string;
  templateVersion?: number;
  type: InspectionType;
  assetId: string;
  assetName: string;
  status: InspectionStatus;
  scheduledFor: Date;
  assignedTo: string;
  performedBy?: string;
  startedAt?: Date;
  completedAt?: Date;
  responses: InspectionResponseSub[];
  notes: string;
  summary: { total: number; passed: number; failed: number; na: number; pending: number };
  workOrderIds: string[];
  history: { from: InspectionStatus | null; to: InspectionStatus; at: Date; actor: string; note?: string }[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const responseSchema = new Schema<InspectionResponseSub>(
  {
    key: { type: String, required: true },
    // The checkpoint's definition is copied, not referenced — see the note at
    // the top of this file.
    label: { type: String, required: true },
    type: { type: String, required: true, enum: INSPECTION_QUESTION_TYPES },
    required: { type: Boolean, default: true },
    helpText: { type: String },
    min: { type: Number },
    max: { type: Number },
    unit: { type: String },
    failWhen: { type: String, enum: ['Fail', 'No', 'Yes'] },
    result: { type: String, required: true, enum: INSPECTION_RESULTS, default: 'Pending' },
    // Mixed because the answer's shape follows the question's type: a string
    // for Text, a number for Number, a boolean for Yes/No. The server grades it
    // against `type` before storing, so the looseness is bounded at the edge.
    value: { type: Schema.Types.Mixed, default: null },
    note: { type: String },
    finding: { type: String },
  },
  { _id: false },
);

const statusEventSchema = new Schema(
  {
    from: { type: String, enum: [...INSPECTION_STATUSES, null], default: null },
    to: { type: String, required: true, enum: INSPECTION_STATUSES },
    at: { type: Date, required: true, default: Date.now },
    actor: { type: String, required: true },
    note: { type: String },
  },
  { _id: false },
);

const inspectionSchema = new Schema<InspectionDoc>(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    templateId: { type: String, ref: 'InspectionTemplate', index: true },
    // Denormalised so a record still names its template after the template is
    // retired, and so lists do not need a join to render.
    templateName: { type: String, required: true },
    templateVersion: { type: Number },
    type: { type: String, required: true, enum: INSPECTION_TYPES, default: 'Safety', index: true },
    assetId: { type: String, required: true, ref: 'Asset', index: true },
    assetName: { type: String, required: true },
    status: { type: String, required: true, enum: INSPECTION_STATUSES, default: 'Scheduled', index: true },
    scheduledFor: { type: Date, required: true, index: true },
    assignedTo: { type: String, required: true, default: 'Unassigned', index: true },
    // Distinct from `assignedTo`: the queue is booked to one person, the work
    // may be done by another, and an audit needs to know which is which.
    performedBy: { type: String },
    startedAt: { type: Date },
    completedAt: { type: Date },
    responses: { type: [responseSchema], default: [] },
    notes: { type: String, default: '' },
    // Materialised on every write so a list of five hundred records does not
    // make the client count arrays to render five hundred progress bars.
    summary: {
      total: { type: Number, default: 0 },
      passed: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      na: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
    },
    workOrderIds: { type: [String], default: [] },
    history: { type: [statusEventSchema], default: [] },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

inspectionSchema.plugin(baseSchemaPlugin);
inspectionSchema.index({ title: 'text', assetName: 'text', templateName: 'text' }, { name: 'inspection_search' });
// The list's default cut: outstanding work, soonest first.
inspectionSchema.index({ status: 1, scheduledFor: 1 });

export const Inspection = model<InspectionDoc>('Inspection', inspectionSchema);
