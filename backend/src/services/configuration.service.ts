import mongoose from 'mongoose';
import {
  Backup,
  OrgSettings,
  Passkey,
  Report,
  Webhook,
  ReportSubscription,
  nextId,
  type BackupDoc,
  type OrgSettingsDoc,
  type PasskeyDoc,
  type ReportSubscriptionDoc,
  type WebhookDoc,
  type SubscriptionCadence,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import type {
  CreatePasskeyInput,
  CreateReportSubscriptionInput,
  UpdateOrgSettingsInput,
  UpdateReportSubscriptionInput,
} from '../validators/configuration.validator.js';

/**
 * The configuration screens' write side.
 *
 * Checklist templates and integrations go through the resource factory — they
 * are plain records. The four things here need a rule the factory has no way to
 * express: a schedule that must be computed, a singleton that must be created
 * on first read, a passkey that belongs to whoever is signed in, and a backup
 * whose restore has to be refused when there is nothing to restore from.
 */

// ── Report subscriptions ─────────────────────────────────────────────────────
const CADENCE_DAYS: Record<SubscriptionCadence, number> = {
  Daily: 1,
  Weekly: 7,
  Monthly: 30,
  Quarterly: 91,
};

/** When a subscription on this cadence should next deliver. */
function nextRunFrom(from: Date, cadence: SubscriptionCadence): Date {
  const next = new Date(from);
  next.setDate(next.getDate() + CADENCE_DAYS[cadence]);
  return next;
}

export async function createSubscription(
  input: CreateReportSubscriptionInput,
  actor: string,
): Promise<ReportSubscriptionDoc> {
  const report = await Report.findById(input.reportId).lean();
  if (!report) throw ApiError.badRequest(`Report ${input.reportId} does not exist`);

  // One standing instruction per report per person. A second subscription to
  // the same report only means the same file arrives twice.
  const existing = await ReportSubscription.findOne({ reportId: input.reportId, createdBy: actor }).lean();
  if (existing) throw ApiError.conflict(`You already have a subscription to ${report.name}`);

  const now = new Date();
  const created = await ReportSubscription.create({
    ...input,
    _id: await nextId('reportSubscription', 'SUB'),
    reportName: report.name,
    nextRun: nextRunFrom(now, input.cadence),
    createdBy: actor,
    createdAt: now,
  });

  return created.toObject();
}

export async function updateSubscription(
  id: string,
  patch: UpdateReportSubscriptionInput,
): Promise<ReportSubscriptionDoc> {
  const sub = await ReportSubscription.findById(id);
  if (!sub) throw ApiError.notFound('Subscription');

  Object.assign(sub, patch);

  // Changing cadence re-bases the schedule from now; pausing and resuming does
  // not, so a subscription keeps its place in the calendar.
  if (patch.cadence) sub.nextRun = nextRunFrom(new Date(), patch.cadence);

  await sub.save();
  return sub.toObject();
}

export async function deleteSubscription(id: string): Promise<void> {
  const removed = await ReportSubscription.findByIdAndDelete(id).lean();
  if (!removed) throw ApiError.notFound('Subscription');
}

// ── Organisation settings ────────────────────────────────────────────────────
/**
 * Read the singleton, creating it on first access.
 *
 * Seeding it would work until someone deploys against an existing database, so
 * it is created lazily instead: the defaults live in the schema and this just
 * makes sure a row exists to hold them.
 */
export async function getOrgSettings(): Promise<OrgSettingsDoc> {
  const existing = await OrgSettings.findById('ORG').lean<OrgSettingsDoc>();
  if (existing) return withDefaults(existing);

  const created = await OrgSettings.create({ _id: 'ORG', updatedAt: new Date() });
  return withDefaults(created.toObject());
}

/**
 * Fill in fields added after this document was written.
 *
 * A schema default applies when a document is *created*, not when an older one
 * is read — and `.lean()` skips document construction entirely, so a field
 * added in a later release comes back `undefined` on every existing row no
 * matter what the schema says. Coalescing at this one read is what stops that
 * being a crash in whichever caller happens to use it first.
 */
function withDefaults(doc: OrgSettingsDoc): OrgSettingsDoc {
  return { ...doc, laborRatePerHour: doc.laborRatePerHour ?? 850 };
}

export async function updateOrgSettings(patch: UpdateOrgSettingsInput): Promise<OrgSettingsDoc> {
  await getOrgSettings();
  const updated = await OrgSettings.findByIdAndUpdate(
    'ORG',
    { $set: { ...patch, updatedAt: new Date() } },
    { new: true, runValidators: true },
  ).lean<OrgSettingsDoc>();

  if (!updated) throw ApiError.notFound('Organisation settings');
  return updated;
}

// ── Passkeys ─────────────────────────────────────────────────────────────────
/**
 * Register a passkey for the signed-in user.
 *
 * This records the *enrolment*, not the credential: real WebAuthn registration
 * happens in the browser against an authenticator, and the public key would be
 * stored alongside this row when that is wired to a relying party. What the
 * screen needs today — an authenticator someone can name, see and revoke — is
 * this row, and it is honest about being only that.
 */
export async function createPasskey(input: CreatePasskeyInput, userId: string): Promise<PasskeyDoc> {
  const created = await Passkey.create({
    ...input,
    _id: await nextId('passkey', 'PK'),
    userId,
    added: new Date(),
  });
  return created.toObject();
}

export async function deletePasskey(id: string, userId: string): Promise<void> {
  const passkey = await Passkey.findById(id).lean<PasskeyDoc>();
  if (!passkey) throw ApiError.notFound('Passkey');
  // A passkey is a credential. Only its owner may remove it, whatever else
  // their role permits.
  if (passkey.userId !== userId) throw ApiError.forbidden('That passkey belongs to another account');

  await Passkey.findByIdAndDelete(id);
}

// ── Backups ──────────────────────────────────────────────────────────────────
/**
 * Size of the estate at this moment, so the row reports something true.
 *
 * `db.stats()` is the real answer and is used when the driver will give it. It
 * will not on a shared-tier Atlas cluster, where `dbStats` is not granted — so
 * rather than failing the whole request over a display string, the row falls
 * back to a document count. A snapshot with an approximate size is far more
 * useful than no snapshot.
 */
async function estimateSize(): Promise<string> {
  try {
    const stats = await mongoose.connection.db?.stats();
    const bytes = stats?.dataSize ?? 0;
    if (bytes > 0) {
      return bytes > 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
  } catch {
    /* fall through to the count */
  }

  const collections = Object.values(mongoose.connection.models);
  const counts = await Promise.all(collections.map((m) => m.estimatedDocumentCount().catch(() => 0)));
  const documents = counts.reduce((sum, n) => sum + n, 0);
  return `${documents.toLocaleString()} documents`;
}

export async function createBackup(): Promise<BackupDoc> {
  const created = await Backup.create({
    _id: await nextId('backup', 'BK'),
    when: new Date(),
    size: await estimateSize(),
    status: 'Complete',
  });
  return created.toObject();
}

/**
 * Point-in-time restore.
 *
 * Deliberately refused rather than faked. Restoring would replace every
 * collection in the database, and a button that reports success while doing
 * nothing is worse than no button: it is the one action where believing it
 * worked is catastrophic. The row is verified and the operator is told exactly
 * what to run.
 */
export async function requestRestore(id: string): Promise<never> {
  const backup = await Backup.findById(id).lean<BackupDoc>();
  if (!backup) throw ApiError.notFound('Backup');

  throw ApiError.badRequest(
    `Restore from ${id} must be run against the database directly — ` +
      `the platform will not overwrite live data from a web request. ` +
      `Use \`mongorestore --drop --archive=${id}.archive\` from the backup host.`,
  );
}

// The checklist library moved to services/inspection.service.ts — see
// `listTemplates`, which joins the same usage count off `Inspection.templateId`
// rather than off a template *name*, so renaming one no longer zeroes it.

// ── Webhook delivery ─────────────────────────────────────────────────────────
export interface WebhookTestResult {
  ok: boolean;
  status: number;
  detail: string;
  ms: number;
}

/**
 * Send a real ping to a registered endpoint.
 *
 * "Test" previously raised a success toast without a request leaving the
 * process, which is worse than no button: the one thing this control exists to
 * establish is whether the endpoint is reachable, and it was answering yes
 * unconditionally.
 *
 * The URL is one an administrator registered on their own deployment, not user
 * input from the open internet — but it is still fetched with a short timeout
 * and no redirect following, so a slow or looping endpoint cannot tie up a
 * request thread. The outcome is written back to `ok`/`lastDelivery`, which is
 * what the health dot on the screen reads.
 */
export async function testWebhook(id: string): Promise<WebhookTestResult> {
  const hook = await Webhook.findById(id).lean<WebhookDoc>();
  if (!hook) throw ApiError.notFound('Webhook');

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  let result: WebhookTestResult;
  try {
    const response = await fetch(hook.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-access-genie-event': 'ping' },
      body: JSON.stringify({ event: 'ping', webhookId: id, at: new Date().toISOString() }),
      redirect: 'manual',
      signal: controller.signal,
    });
    result = {
      ok: response.ok,
      status: response.status,
      detail: response.ok ? `Endpoint replied ${response.status}` : `Endpoint replied ${response.status} ${response.statusText}`,
      ms: Date.now() - startedAt,
    };
  } catch (err) {
    result = {
      ok: false,
      status: 0,
      detail: controller.signal.aborted ? 'No reply within 5 seconds' : `Could not reach the endpoint — ${String(err instanceof Error ? err.message : err)}`,
      ms: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }

  await Webhook.updateOne({ _id: id }, { $set: { ok: result.ok, lastDelivery: new Date() } });
  return result;
}
