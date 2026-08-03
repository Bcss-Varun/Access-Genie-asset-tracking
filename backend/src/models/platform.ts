import { model, Schema } from 'mongoose';
import { baseSchemaPlugin } from '../utils/mongoose.js';

// The platform's own records — the things an administrator manages *about* the
// system rather than about assets: who is on which team, what can call the API,
// where events are delivered, what has been backed up, billed, exported or
// asked for help with.
//
// None of these carry domain rules of their own, so they are read through the
// resource factory and share a file rather than fragmenting into eight
// near-identical modules.

// ── Teams ────────────────────────────────────────────────────────────────────
/**
 * A working group. `memberIds` is the roster; `extra` records headcount that is
 * in the team but not in the platform (contractors, shared-service staff), so
 * the displayed size matches reality rather than the licence count.
 */
export interface TeamDoc {
  _id: string; // network
  name: string;
  emoji: string;
  department: string;
  description: string;
  memberIds: string[];
  extra: number;
}

const teamSchema = new Schema<TeamDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    emoji: { type: String, default: '👥' },
    department: { type: String, required: true, index: true },
    description: { type: String, default: '' },
    memberIds: { type: [String], default: [], ref: 'User' },
    extra: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false },
);
teamSchema.plugin(baseSchemaPlugin);
export const Team = model<TeamDoc>('Team', teamSchema);

// ── API credentials ──────────────────────────────────────────────────────────
export const API_KEY_SCOPES_HINT = 'resource:action, e.g. assets:read';

/**
 * A credential that can call the API.
 *
 * `organization` keys belong to the tenant and are managed in Administration;
 * `personal` tokens belong to one user and are managed in their own settings.
 * One model because they are the same object with a different owner — and
 * because a security review wants a single place that answers "what can reach
 * this API?".
 *
 * Only the last four characters are stored. A key that can be read back out of
 * the database is a key that leaks with the database.
 */
export interface ApiKeyDoc {
  _id: string; // KEY-01 / T-1
  name: string;
  scope: 'organization' | 'personal';
  /** Displayed as `agk_live_••••••••7f3a`. Never the full secret. */
  last4: string;
  scopes: string[];
  ownerId?: string;
  createdAt: Date;
  lastUsed?: Date;
  revokedAt?: Date;
}

const apiKeySchema = new Schema<ApiKeyDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    scope: { type: String, required: true, enum: ['organization', 'personal'], index: true },
    last4: { type: String, required: true, maxlength: 8 },
    scopes: { type: [String], default: [] },
    ownerId: { type: String, ref: 'User', sparse: true },
    createdAt: { type: Date, required: true },
    lastUsed: Date,
    revokedAt: Date,
  },
  { versionKey: false, timestamps: false },
);
apiKeySchema.plugin(baseSchemaPlugin);
export const ApiKey = model<ApiKeyDoc>('ApiKey', apiKeySchema);

// ── Webhooks ─────────────────────────────────────────────────────────────────
export interface WebhookDoc {
  _id: string; // WH-01
  url: string;
  events: string[];
  enabled: boolean;
  lastDelivery?: Date;
  /** Whether the last delivery succeeded — the only health signal that matters. */
  ok: boolean;
}

const webhookSchema = new Schema<WebhookDoc>(
  {
    _id: { type: String, required: true },
    url: { type: String, required: true },
    events: { type: [String], default: [] },
    enabled: { type: Boolean, default: true, index: true },
    lastDelivery: Date,
    ok: { type: Boolean, default: true },
  },
  { versionKey: false },
);
webhookSchema.plugin(baseSchemaPlugin);
export const Webhook = model<WebhookDoc>('Webhook', webhookSchema);

// ── Passkeys ─────────────────────────────────────────────────────────────────
/** A registered WebAuthn authenticator. The credential itself never lands here. */
export interface PasskeyDoc {
  _id: string; // PK-1
  userId: string;
  name: string;
  kind: string;
  added: Date;
  lastUsed?: Date;
}

const passkeySchema = new Schema<PasskeyDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true, ref: 'User', index: true },
    name: { type: String, required: true },
    kind: { type: String, default: 'Platform authenticator' },
    added: { type: Date, required: true },
    lastUsed: Date,
  },
  { versionKey: false },
);
passkeySchema.plugin(baseSchemaPlugin);
export const Passkey = model<PasskeyDoc>('Passkey', passkeySchema);

// ── Backups ──────────────────────────────────────────────────────────────────
export interface BackupDoc {
  _id: string; // BK-2401
  when: Date;
  size: string;
  status: string;
}

const backupSchema = new Schema<BackupDoc>(
  {
    _id: { type: String, required: true },
    when: { type: Date, required: true, index: true },
    size: { type: String, default: '' },
    status: { type: String, required: true },
  },
  { versionKey: false },
);
backupSchema.plugin(baseSchemaPlugin);
export const Backup = model<BackupDoc>('Backup', backupSchema);

// ── Billing ──────────────────────────────────────────────────────────────────
export interface InvoiceDoc {
  _id: string; // INV-2026-07
  date: string;
  /** Whole rupees. */
  amount: number;
  status: string;
}

const invoiceSchema = new Schema<InvoiceDoc>(
  {
    _id: { type: String, required: true },
    date: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, required: true, index: true },
  },
  { versionKey: false },
);
invoiceSchema.plugin(baseSchemaPlugin);
export const Invoice = model<InvoiceDoc>('Invoice', invoiceSchema);

// ── Exports ──────────────────────────────────────────────────────────────────
export interface ExportJobDoc {
  _id: string; // EXP-2041
  report: string;
  format: string;
  requestedBy: string;
  at: Date;
  status: string;
  /** Zero while the job is still running — there is no file yet. */
  sizeKb: number;
}

const exportJobSchema = new Schema<ExportJobDoc>(
  {
    _id: { type: String, required: true },
    report: { type: String, required: true },
    format: { type: String, required: true },
    requestedBy: { type: String, required: true },
    at: { type: Date, required: true, index: true },
    status: { type: String, required: true, index: true },
    sizeKb: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false },
);
exportJobSchema.plugin(baseSchemaPlugin);
export const ExportJob = model<ExportJobDoc>('ExportJob', exportJobSchema);

// ── Support ──────────────────────────────────────────────────────────────────
export interface SupportTicketDoc {
  _id: string; // SUP-4821
  subject: string;
  category: string;
  status: string;
  priority: string;
  raisedBy?: string;
  body?: string;
  updated: Date;
}

const supportTicketSchema = new Schema<SupportTicketDoc>(
  {
    _id: { type: String, required: true },
    subject: { type: String, required: true },
    category: { type: String, required: true, index: true },
    status: { type: String, required: true, index: true },
    priority: { type: String, default: 'Normal' },
    raisedBy: { type: String, ref: 'User' },
    body: String,
    updated: { type: Date, required: true, index: true },
  },
  { versionKey: false },
);
supportTicketSchema.plugin(baseSchemaPlugin);
export const SupportTicket = model<SupportTicketDoc>('SupportTicket', supportTicketSchema);

// ── Registration sources ─────────────────────────────────────────────────────
/**
 * A received purchase-order line waiting to become assets.
 *
 * Most enterprise assets arrive through procurement, and the goods receipt
 * already holds manufacturer, model, cost, vendor and warranty terms. Starting
 * a registration from a blank form throws all of that away, so this is the
 * queue the Add Asset flow opens on.
 *
 * `registered` counts how many of `quantity` have been turned into assets, which
 * is what lets a line read "3 of 12 registered" and disappear when it is done.
 */
export interface ReceivedPoLineDoc {
  _id: string; // POL-1
  poRef: string;
  vendor: string;
  receivedAt: Date;
  description: string;
  manufacturer: string;
  model: string;
  classId: string;
  category: string;
  unitCost: number;
  quantity: number;
  registered: number;
  warrantyMonths: number;
  facilityHint?: string;
}

const poLineSchema = new Schema<ReceivedPoLineDoc>(
  {
    _id: { type: String, required: true },
    poRef: { type: String, required: true, index: true },
    vendor: { type: String, required: true },
    receivedAt: { type: Date, required: true, index: true },
    description: { type: String, required: true },
    manufacturer: { type: String, default: '' },
    model: { type: String, default: '' },
    classId: { type: String, required: true, ref: 'AssetClass' },
    category: { type: String, required: true },
    unitCost: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    registered: { type: Number, default: 0, min: 0 },
    warrantyMonths: { type: Number, default: 0, min: 0 },
    facilityHint: String,
  },
  { versionKey: false },
);
poLineSchema.plugin(baseSchemaPlugin);
export const ReceivedPoLine = model<ReceivedPoLineDoc>('ReceivedPoLine', poLineSchema);

/**
 * What a handheld got off a barcode plus nameplate OCR at the dock.
 *
 * Kept as a collection rather than invented in the browser because the point of
 * the mobile path is that identity and location arrive together, from the
 * gateway that saw the scan — neither is typed by the technician, so neither
 * should be fabricated by the client.
 */
export interface PendingScanDoc {
  _id: string;
  serial: string;
  manufacturer: string;
  model: string;
  classId: string;
  category: string;
  /** Inferred from the gateway that saw the scan. */
  facility: string;
  building?: string;
  zone: string;
  /** OCR confidence, 0–100. */
  confidence: number;
  scannedAt: Date;
  consumed: boolean;
}

const pendingScanSchema = new Schema<PendingScanDoc>(
  {
    _id: { type: String, required: true },
    serial: { type: String, required: true, index: true },
    manufacturer: { type: String, default: '' },
    model: { type: String, default: '' },
    classId: { type: String, required: true },
    category: { type: String, required: true },
    facility: { type: String, required: true },
    building: String,
    zone: { type: String, default: '' },
    confidence: { type: Number, default: 0, min: 0, max: 100 },
    scannedAt: { type: Date, required: true },
    consumed: { type: Boolean, default: false, index: true },
  },
  { versionKey: false },
);
pendingScanSchema.plugin(baseSchemaPlugin);
export const PendingScan = model<PendingScanDoc>('PendingScan', pendingScanSchema);

// ── Help centre ──────────────────────────────────────────────────────────────
export interface HelpArticleDoc {
  _id: string; // slug
  title: string;
  category: string;
  excerpt: string;
  readMins: number;
  body?: string;
}

const helpArticleSchema = new Schema<HelpArticleDoc>(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true },
    category: { type: String, required: true, index: true },
    excerpt: { type: String, default: '' },
    readMins: { type: Number, default: 3, min: 1 },
    body: String,
  },
  { versionKey: false },
);
helpArticleSchema.plugin(baseSchemaPlugin);
helpArticleSchema.virtual('slug').get(function slug(this: { _id: string }) {
  return this._id;
});
export const HelpArticle = model<HelpArticleDoc>('HelpArticle', helpArticleSchema);

export interface HelpCategoryDoc {
  _id: string;
  label: string;
  icon: string;
  description: string;
}

const helpCategorySchema = new Schema<HelpCategoryDoc>(
  {
    _id: { type: String, required: true },
    label: { type: String, required: true },
    icon: { type: String, default: '📘' },
    description: { type: String, default: '' },
  },
  { versionKey: false },
);
helpCategorySchema.plugin(baseSchemaPlugin);
export const HelpCategory = model<HelpCategoryDoc>('HelpCategory', helpCategorySchema);
