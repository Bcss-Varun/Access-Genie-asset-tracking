import { model, Schema } from 'mongoose';
import {
  LABEL_FIELD_KEYS,
  LABEL_MEDIUMS,
  LABEL_SIZE_KEYS,
  PRINT_DEVICE_KINDS,
  PRINT_DEVICE_STATES,
  PRINT_JOB_STATES,
  type LabelFieldKey,
  type LabelMedium,
  type LabelSizeKey,
  type PrintDeviceKind,
  type PrintDeviceState,
  type PrintJobState,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

// Making an asset scannable: the template that says how a label looks, the
// hardware that produces it, and the job that ties the two to a set of assets.
//
// Printing a label is the same event as binding the tag it carries, which is why
// a job records `bound` alongside `printed` — a reprint must not double-bind.

// ── Templates ────────────────────────────────────────────────────────────────
export interface LabelTemplateDoc {
  _id: string; // TPL-STD-QR
  name: string;
  description: string;
  medium: LabelMedium;
  size: LabelSizeKey;
  fields: LabelFieldKey[];
  showLogo: boolean;
  showBorder: boolean;
  /** Label stock this template is cut for — printers refuse mismatched media. */
  stock: string;
  /** Seeded templates cannot be deleted; copies of them can. */
  builtIn: boolean;
  updatedAt: Date;
  updatedBy: string;
  /** Labels produced from this template in the last 90 days. */
  usageCount: number;
}

const labelTemplateSchema = new Schema<LabelTemplateDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    medium: { type: String, required: true, enum: LABEL_MEDIUMS, index: true },
    size: { type: String, required: true, enum: LABEL_SIZE_KEYS },
    // Order is print order on the label, so this is a sequence, not a set.
    fields: { type: [String], enum: LABEL_FIELD_KEYS, default: [] },
    showLogo: { type: Boolean, default: true },
    showBorder: { type: Boolean, default: false },
    stock: { type: String, default: '' },
    builtIn: { type: Boolean, default: false },
    updatedAt: { type: Date, required: true },
    updatedBy: { type: String, default: '' },
    usageCount: { type: Number, default: 0, min: 0 },
  },
  // `updatedAt` is a business field here (who last edited the template), not a
  // Mongoose bookkeeping timestamp, so the plugin must not overwrite it.
  { versionKey: false, timestamps: false },
);

labelTemplateSchema.plugin(baseSchemaPlugin);
export const LabelTemplate = model<LabelTemplateDoc>('LabelTemplate', labelTemplateSchema);

// ── Print devices ────────────────────────────────────────────────────────────
export interface PrintDeviceDoc {
  _id: string; // PRN-01
  name: string;
  kind: PrintDeviceKind;
  model: string;
  facility: string;
  zone: string;
  state: PrintDeviceState;
  /** Media remaining, as a percentage of a full roll. */
  media: number;
  /** Jobs already waiting on this device. */
  queueDepth: number;
  supports: LabelMedium[];
  lastSeen: Date;
  /** Why it is unhappy — shown verbatim, never summarised away. */
  note?: string;
}

const printDeviceSchema = new Schema<PrintDeviceDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    kind: { type: String, required: true, enum: PRINT_DEVICE_KINDS, index: true },
    model: { type: String, default: '' },
    facility: { type: String, required: true, index: true },
    zone: { type: String, default: '' },
    state: { type: String, required: true, enum: PRINT_DEVICE_STATES, default: 'Offline', index: true },
    media: { type: Number, default: 100, min: 0, max: 100 },
    queueDepth: { type: Number, default: 0, min: 0 },
    supports: { type: [String], enum: LABEL_MEDIUMS, default: [] },
    lastSeen: { type: Date, required: true },
    note: String,
  },
  { versionKey: false },
);

printDeviceSchema.plugin(baseSchemaPlugin);
export const PrintDevice = model<PrintDeviceDoc>('PrintDevice', printDeviceSchema);

// ── Print jobs ───────────────────────────────────────────────────────────────
export interface PrintJobDoc {
  _id: string; // JOB-01
  createdAt: Date;
  createdBy: string;
  templateId: string;
  deviceId: string;
  assetIds: string[];
  copies: number;
  state: PrintJobState;
  /** Labels physically produced so far — partial progress is real progress. */
  printed: number;
  /** Tags written, for RFID/NFC media. Always 0 for print-only media. */
  encoded: number;
  /** Tag bindings this job created, so a reprint does not double-bind. */
  bound: number;
  failureReason?: string;
  completedAt?: Date;
}

const printJobSchema = new Schema<PrintJobDoc>(
  {
    _id: { type: String, required: true },
    createdAt: { type: Date, required: true, index: true },
    createdBy: { type: String, required: true },
    templateId: { type: String, required: true, ref: 'LabelTemplate', index: true },
    deviceId: { type: String, required: true, ref: 'PrintDevice', index: true },
    assetIds: { type: [String], default: [] },
    copies: { type: Number, default: 1, min: 1 },
    state: { type: String, required: true, enum: PRINT_JOB_STATES, default: 'Queued', index: true },
    printed: { type: Number, default: 0, min: 0 },
    encoded: { type: Number, default: 0, min: 0 },
    bound: { type: Number, default: 0, min: 0 },
    failureReason: String,
    completedAt: Date,
  },
  { versionKey: false, timestamps: false },
);

printJobSchema.plugin(baseSchemaPlugin);

/** The states in which a job is still going to change on its own. */
export const OPEN_PRINT_JOB_STATES: PrintJobState[] = ['Queued', 'Printing', 'Held', 'Failed'];

export const PrintJob = model<PrintJobDoc>('PrintJob', printJobSchema);
