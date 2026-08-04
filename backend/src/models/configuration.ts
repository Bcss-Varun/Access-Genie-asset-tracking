import { model, Schema } from 'mongoose';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * Things the organisation configures about itself.
 *
 * Three collections that had screens and no storage: a checklist library that
 * existed only as a hard-coded map, report subscriptions that were listed but
 * could never be created, and branding that "saved" into a toast.
 *
 * They share a file for the same reason the platform records do — none has
 * behaviour beyond being written and read back.
 */

// ── Checklist templates ──────────────────────────────────────────────────────
/**
 * The reusable body of an inspection.
 *
 * Inspections already carry their own `items`, which is what made the template
 * library look real: it was derived by scanning existing inspections. That
 * derivation cannot be edited, and it cannot produce a template for work nobody
 * has scheduled yet — which is precisely when you want one.
 */
export interface ChecklistTemplateDoc {
  _id: string; // TPLC-1
  name: string;
  category: string;
  icon: string;
  description: string;
  /** Ordered — a checklist is a sequence of checks, not a set. */
  items: string[];
  createdAt: Date;
  updatedAt: Date;
}

const checklistTemplateSchema = new Schema<ChecklistTemplateDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, default: 'General', index: true },
    icon: { type: String, default: '📋' },
    description: { type: String, default: '' },
    items: { type: [String], default: [] },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { versionKey: false },
);

checklistTemplateSchema.plugin(baseSchemaPlugin);
export const ChecklistTemplate = model<ChecklistTemplateDoc>('ChecklistTemplate', checklistTemplateSchema);

// ── Report subscriptions ─────────────────────────────────────────────────────
export const SUBSCRIPTION_CADENCES = ['Daily', 'Weekly', 'Monthly', 'Quarterly'] as const;
export type SubscriptionCadence = (typeof SUBSCRIPTION_CADENCES)[number];

/**
 * A standing instruction to deliver a report.
 *
 * `nextRun` is stored rather than computed on read so a paused subscription
 * keeps its place in the calendar: re-enabling it should resume the schedule,
 * not restart it from today.
 */
export interface ReportSubscriptionDoc {
  _id: string; // SUB-1
  reportId: string;
  reportName: string;
  cadence: SubscriptionCadence;
  format: string;
  recipients: string[];
  enabled: boolean;
  nextRun: Date;
  lastRun?: Date;
  createdBy: string;
  createdAt: Date;
}

const reportSubscriptionSchema = new Schema<ReportSubscriptionDoc>(
  {
    _id: { type: String, required: true },
    reportId: { type: String, required: true, ref: 'Report', index: true },
    reportName: { type: String, required: true },
    cadence: { type: String, required: true, enum: SUBSCRIPTION_CADENCES, default: 'Weekly' },
    format: { type: String, default: 'PDF' },
    recipients: { type: [String], default: [] },
    enabled: { type: Boolean, default: true, index: true },
    nextRun: { type: Date, required: true },
    lastRun: Date,
    createdBy: { type: String, default: '' },
    createdAt: { type: Date, required: true },
  },
  { versionKey: false },
);

reportSubscriptionSchema.plugin(baseSchemaPlugin);
export const ReportSubscription = model<ReportSubscriptionDoc>('ReportSubscription', reportSubscriptionSchema);

// ── Organisation settings ────────────────────────────────────────────────────
/**
 * Tenant-wide preferences. A singleton, keyed `ORG` — there is one
 * organisation per deployment, and giving it a fixed id means reading it never
 * has to decide which row is the real one.
 */
export interface OrgSettingsDoc {
  _id: string; // always 'ORG'
  name: string;
  legalName: string;
  logoEmoji: string;
  primaryColor: string;
  accentColor: string;
  loginMessage: string;
  supportEmail: string;
  timezone: string;
  dateFormat: string;
  currency: string;
  updatedAt: Date;
}

const orgSettingsSchema = new Schema<OrgSettingsDoc>(
  {
    _id: { type: String, required: true, default: 'ORG' },
    name: { type: String, required: true, default: 'Access Genie' },
    legalName: { type: String, default: '' },
    logoEmoji: { type: String, default: '🧞' },
    // Stored as hex so the frontend can apply it directly as a CSS variable.
    primaryColor: { type: String, default: '#4f46e5' },
    accentColor: { type: String, default: '#0ea5e9' },
    loginMessage: { type: String, default: '' },
    supportEmail: { type: String, default: '' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    dateFormat: { type: String, default: 'DD MMM YYYY' },
    currency: { type: String, default: 'INR' },
    updatedAt: { type: Date, required: true },
  },
  { versionKey: false },
);

orgSettingsSchema.plugin(baseSchemaPlugin);
export const OrgSettings = model<OrgSettingsDoc>('OrgSettings', orgSettingsSchema);

// ── Export artifacts ─────────────────────────────────────────────────────────
/**
 * The file an export job produced, keyed by the job's id.
 *
 * Kept out of `ExportJob` on purpose: the job row is listed on a screen and
 * carried in the reference dataset, and a few hundred kilobytes of CSV riding
 * along with every page load would be paid for by everyone to benefit nobody.
 * The body is fetched only when someone actually clicks download.
 */
export interface ExportArtifactDoc {
  _id: string; // the ExportJob id
  filename: string;
  mime: string;
  body: string;
  rowCount: number;
  createdAt: Date;
}

const exportArtifactSchema = new Schema<ExportArtifactDoc>(
  {
    _id: { type: String, required: true },
    filename: { type: String, required: true },
    mime: { type: String, required: true },
    body: { type: String, required: true },
    rowCount: { type: Number, default: 0 },
    createdAt: { type: Date, required: true },
  },
  { versionKey: false },
);

exportArtifactSchema.plugin(baseSchemaPlugin);
export const ExportArtifact = model<ExportArtifactDoc>('ExportArtifact', exportArtifactSchema);

// ── Role grants ──────────────────────────────────────────────────────────────
/**
 * An override of a role's module grants.
 *
 * The role matrix in `shared` is the default and stays the source of truth for
 * what a role means. This collection records where one deployment differs —
 * "our facility managers also need Analytics" — keyed by role id, so a row is
 * only present for roles that have actually been changed.
 *
 * Deliberately not a "custom roles" collection. Roles are the axis the API's
 * `requireModule` gate and the client's navigation are both written against;
 * inventing new ones at runtime would leave every route referring to a set that
 * no longer describes the system. Adjusting an existing role's reach is the
 * thing administrators actually need, and it cannot desynchronise anything.
 */
export interface RoleGrantDoc {
  _id: string; // a RoleId
  modules: string[];
  updatedAt: Date;
}

const roleGrantSchema = new Schema<RoleGrantDoc>(
  {
    _id: { type: String, required: true },
    modules: { type: [String], default: [] },
    updatedAt: { type: Date, required: true },
  },
  { versionKey: false },
);

roleGrantSchema.plugin(baseSchemaPlugin);
export const RoleGrant = model<RoleGrantDoc>('RoleGrant', roleGrantSchema);
