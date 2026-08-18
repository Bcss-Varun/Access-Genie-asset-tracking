import { model, Schema } from 'mongoose';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * Things the organisation configures about itself.
 *
 * Collections that had screens and no storage: report subscriptions that were
 * listed but could never be created, and branding that "saved" into a toast.
 *
 * They share a file for the same reason the platform records do — none has
 * behaviour beyond being written and read back.
 *
 * The checklist library used to live here too. It is now `InspectionTemplate`
 * in models/inspection.ts: a checklist *is* an inspection template, and keeping
 * two collections for one idea meant a checklist you could edit and an
 * inspection that ignored it.
 */

// ── Report subscriptions ─────────────────────────────────────────────────────
export const SUBSCRIPTION_CADENCES = ['Daily', 'Weekly', 'Monthly', 'Quarterly'] as const;
export type SubscriptionCadence = (typeof SUBSCRIPTION_CADENCES)[number];

/**
 * A standing instruction to deliver a report.
 *
 * `nextRun` is stored rather than computed on read so a paused subscription
 * keeps its place in the calendar: re-enabling it should resume the schedule,
 * not restart it from today.
 *
 * `startDate` and `endDate` bound the standing instruction. A schedule that has
 * not started yet and one that has finished are both legitimate states, and
 * neither is the same as paused — so they are stored rather than inferred from
 * `enabled`, and `nextRun` is clamped to the window.
 *
 * `lastRunRows` is absent until the schedule has actually delivered something.
 * That absence is the honest answer to "when did this last run", and the screen
 * shows it as "Never" rather than inventing a history.
 */
export interface ReportSubscriptionDoc {
  _id: string; // SUB-1
  reportId: string;
  reportName: string;
  cadence: SubscriptionCadence;
  format: string;
  recipients: string[];
  enabled: boolean;
  startDate: Date;
  endDate?: Date;
  nextRun: Date;
  lastRun?: Date;
  lastRunRows?: number;
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
    startDate: { type: Date, required: true },
    endDate: Date,
    nextRun: { type: Date, required: true },
    lastRun: Date,
    lastRunRows: { type: Number, min: 0 },
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
  /**
   * What an hour of maintenance labour costs, INR.
   *
   * Work orders record parts (`qty × unitCost`) and labour *hours*, but nothing
   * has ever said what an hour is worth — so the maintenance-cost figure had no
   * way to exist. It is a setting rather than a constant because it differs by
   * organisation and changes yearly, and the charts name the rate they used so
   * a reader can tell a rate change from a cost change.
   */
  laborRatePerHour: number;
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
    laborRatePerHour: { type: Number, default: 850, min: 0 },
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
