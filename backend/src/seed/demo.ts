/**
 * Seed the database from the demo fixture set in `seed/data/`.
 *
 *   npm run seed:demo           — upsert: refreshes records, keeps anything you added
 *   npm run seed:demo:fresh     — drop every seeded collection first
 *
 * This is the *opt-in* seeder. A fresh database gets the administrator account
 * and nothing else (`npm run seed`, see seed/index.ts); this one loads the
 * prototype's fabricated estate on top, for design review and screenshots.
 * Do not run it against an environment anyone treats as real — every screen will
 * then show assets, work orders and people that do not exist.
 *
 * The fixtures were extracted from the original prototype's data modules, so
 * the application opens on exactly the dataset the design was built against.
 * Timestamps are anchored to a fixed "demo now" in the source data, which keeps
 * the dashboards deterministic between runs.
 */
import { connectDb, disconnectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  Activity,
  AiModel,
  Alert,
  AlertRule,
  AnomalyEvent,
  ApiKey,
  ApprovalWorkflow,
  Asset,
  AssetClass,
  AssetDocument,
  AssetGroup,
  AssetJourney,
  AssetPresence,
  AuditLog,
  AuditSession,
  AutomationRule,
  Backup,
  Certification,
  ComplianceFramework,
  CoverageCell,
  CustodyRecord,
  CycleCount,
  EscalationPolicy,
  ExportJob,
  FirmwareCampaign,
  ForecastSeries,
  Gateway,
  Geofence,
  HelpArticle,
  HelpCategory,
  Incident,
  Insight,
  Inspection,
  Integration,
  InventoryException,
  InventoryRoom,
  LabelTemplate,
  MovementTrail,
  MovementTxn,
  Invoice,
  Notification,
  OnCallShift,
  Part,
  Passkey,
  PendingScan,
  ReceivedPoLine,
  PmSchedule,
  PrintDevice,
  PrintJob,
  PurchaseOrder,
  Rack,
  Report,
  ReportPack,
  Reservation,
  RetentionPolicy,
  ScopeNodeModel,
  Sensor,
  Supplier,
  SupportTicket,
  Team,
  TrackedFacility,
  TrackedZone,
  TrackingAlert,
  TrackingDevice,
  TrackingEvent,
  Transfer,
  UnknownDetection,
  User,
  Webhook,
  Warehouse,
  WorkOrder,
  Zone,
  syncCounter,
} from '../models/index.js';
import { datesOn, highestSuffix, keyedBy, withId } from './fixtures.js';
import { SEEDED_COLLECTIONS, type SeedModel } from './collections.js';

import apiKeys from './data/apiKeys.json' with { type: 'json' };
import backups from './data/backups.json' with { type: 'json' };
import complianceFrameworks from './data/complianceFrameworks.json' with { type: 'json' };
import escalationPolicies from './data/escalationPolicies.json' with { type: 'json' };
import exportJobs from './data/exportJobs.json' with { type: 'json' };
import invoices from './data/invoices.json' with { type: 'json' };
import onCallShifts from './data/onCallShifts.json' with { type: 'json' };
import passkeys from './data/passkeys.json' with { type: 'json' };
import pendingScans from './data/pendingScans.json' with { type: 'json' };
import poLines from './data/poLines.json' with { type: 'json' };
import helpArticles from './data/helpArticles.json' with { type: 'json' };
import helpCategories from './data/helpCategories.json' with { type: 'json' };
import reportPacks from './data/reportPacks.json' with { type: 'json' };
import retentionPolicies from './data/retentionPolicies.json' with { type: 'json' };
import supportTickets from './data/supportTickets.json' with { type: 'json' };
import teams from './data/teams.json' with { type: 'json' };
import webhooks from './data/webhooks.json' with { type: 'json' };
import activity from './data/activity.json' with { type: 'json' };
import aiModels from './data/aiModels.json' with { type: 'json' };
import alertRules from './data/alertRules.json' with { type: 'json' };
import alerts from './data/alerts.json' with { type: 'json' };
import anomalies from './data/anomalies.json' with { type: 'json' };
import approvalWorkflows from './data/approvalWorkflows.json' with { type: 'json' };
import assetClasses from './data/assetClasses.json' with { type: 'json' };
import assetDocs from './data/assetDocs.json' with { type: 'json' };
import assetGroups from './data/assetGroups.json' with { type: 'json' };
import assetPresence from './data/assetPresence.json' with { type: 'json' };
import assets from './data/assets.json' with { type: 'json' };
import auditLog from './data/auditLog.json' with { type: 'json' };
import auditSessions from './data/auditSessions.json' with { type: 'json' };
import automationRules from './data/automationRules.json' with { type: 'json' };
import certifications from './data/certifications.json' with { type: 'json' };
import coverageCells from './data/coverageCells.json' with { type: 'json' };
import custody from './data/custody.json' with { type: 'json' };
import cycleCounts from './data/cycleCounts.json' with { type: 'json' };
import firmwareCampaigns from './data/firmwareCampaigns.json' with { type: 'json' };
import forecasts from './data/forecasts.json' with { type: 'json' };
import gateways from './data/gateways.json' with { type: 'json' };
import geofences from './data/geofences.json' with { type: 'json' };
import incidents from './data/incidents.json' with { type: 'json' };
import insights from './data/insights.json' with { type: 'json' };
import inspections from './data/inspections.json' with { type: 'json' };
import integrations from './data/integrations.json' with { type: 'json' };
import inventoryExceptions from './data/inventoryExceptions.json' with { type: 'json' };
import inventoryRooms from './data/inventoryRooms.json' with { type: 'json' };
import journeys from './data/journeys.json' with { type: 'json' };
import labelTemplates from './data/labelTemplates.json' with { type: 'json' };
import movementTrails from './data/movementTrails.json' with { type: 'json' };
import movementTxns from './data/movementTxns.json' with { type: 'json' };
import notifications from './data/notifications.json' with { type: 'json' };
import parts from './data/parts.json' with { type: 'json' };
import pmSchedules from './data/pmSchedules.json' with { type: 'json' };
import printDevices from './data/printDevices.json' with { type: 'json' };
import printJobs from './data/printJobs.json' with { type: 'json' };
import purchaseOrders from './data/purchaseOrders.json' with { type: 'json' };
import racks from './data/racks.json' with { type: 'json' };
import reports from './data/reports.json' with { type: 'json' };
import reservations from './data/reservations.json' with { type: 'json' };
import transfers from './data/transfers.json' with { type: 'json' };
import scope from './data/scope.json' with { type: 'json' };
import sensors from './data/sensors.json' with { type: 'json' };
import suppliers from './data/suppliers.json' with { type: 'json' };
import trackedFacilities from './data/trackedFacilities.json' with { type: 'json' };
import trackedZones from './data/trackedZones.json' with { type: 'json' };
import trackingAlerts from './data/trackingAlerts.json' with { type: 'json' };
import trackingDevices from './data/trackingDevices.json' with { type: 'json' };
import trackingEvents from './data/trackingEvents.json' with { type: 'json' };
import unknownDetections from './data/unknownDetections.json' with { type: 'json' };
import users from './data/users.json' with { type: 'json' };
import warehouses from './data/warehouses.json' with { type: 'json' };
import workOrders from './data/workOrders.json' with { type: 'json' };
import zones from './data/zones.json' with { type: 'json' };

const FRESH = process.argv.includes('--fresh');

/** Rows per bulk write. Small enough to survive a flaky link, large enough to be one round trip. */
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A dropped socket is worth retrying; a rejected document is not.
 *
 * Seeding a hosted cluster (Atlas) over an ordinary connection routinely loses
 * the odd TLS connection mid-write. Retrying that is correct. Retrying a
 * validation failure would just fail five times more slowly and bury the
 * message that actually tells you what is wrong with the fixture.
 */
function isTransient(err: unknown): boolean {
  const name = (err as { name?: string }).name ?? '';
  return /MongoNetwork|MongoServerSelection|MongoNotConnected|PoolCleared/.test(name)
    || /SSL|socket|ECONNRESET|ETIMEDOUT|EPIPE/i.test((err as Error).message ?? '');
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || !isTransient(err)) throw err;
      const backoff = 250 * 2 ** (attempt - 1);
      logger.warn(`  ${label}: connection lost, retrying in ${backoff}ms (${attempt}/${MAX_ATTEMPTS - 1})`);
      await sleep(backoff);
    }
  }
}

/**
 * Upsert a collection, in batches.
 *
 * `bulkWrite` with one upsert per record means re-running the seeder refreshes
 * the fixture rows without touching anything created since — the behaviour you
 * want when you have been clicking around and do not want to lose your work.
 * Batching keeps each round trip short, and because every operation is an
 * upsert, a batch that has to be retried is harmless to repeat.
 */
async function upsert(model: SeedModel, docs: { _id: string }[]): Promise<void> {
  if (!docs.length) return;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    await withRetry(model.collection.name, () =>
      model.bulkWrite(
        batch.map((doc) => ({
          replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
        })),
      ),
    );
  }

  logger.info(`  ${model.collection.name.padEnd(20)} ${docs.length}`);
}

/** Insert fixtures into an append-only collection, but only if it is empty. */
async function insertIfEmpty(model: SeedModel, build: () => Record<string, unknown>[]): Promise<void> {
  const existing = await withRetry(model.collection.name, () => model.countDocuments());
  if (existing > 0) {
    logger.info(`  ${model.collection.name.padEnd(20)} skipped (${existing} existing)`);
    return;
  }

  const docs = build();
  await withRetry(model.collection.name, () => model.insertMany(docs));
  logger.info(`  ${model.collection.name.padEnd(20)} ${docs.length}`);
}

async function seed(): Promise<void> {
  await connectDb();

  if (FRESH) {
    logger.warn('--fresh: dropping seeded collections');
    await Promise.all(SEEDED_COLLECTIONS.map((model) => model.deleteMany({})));
  }

  logger.info('Seeding Access Genie…');

  // ── Location tree ──────────────────────────────────────────────────────────
  await upsert(ScopeNodeModel, scope.map(withId));

  // ── People ─────────────────────────────────────────────────────────────────
  // Saved one at a time rather than through bulkWrite, because the password is
  // hashed by a pre-save hook and a bulk write bypasses middleware entirely.
  //
  // A seeded persona is refreshed on every run, password included — the same
  // upsert contract every other collection here follows. Skipping existing
  // users instead would make SEED_PASSWORD a write-once setting: changing it and
  // re-seeding would appear to do nothing, and the only way back in would be to
  // drop the collection by hand.
  for (const person of users) {
    const existing = await withRetry('users', () => User.findById(person.id).select('+passwordHash'));
    const user = existing ?? new User({ _id: person.id });

    user.name = person.name;
    user.email = person.email;
    user.initials = person.initials;
    user.roleId = person.roleId as typeof user.roleId;
    user.title = person.title;
    user.homeScopeId = person.homeScopeId;
    user.status = 'active';
    // Assigning the plaintext marks the path modified, so the hook hashes it.
    user.passwordHash = env.SEED_PASSWORD;

    await withRetry('users', () => user.save());
  }
  logger.info(`  users                ${users.length} (passwords reset to SEED_PASSWORD)`);

  // ── Asset graph ────────────────────────────────────────────────────────────
  await upsert(AssetClass, assetClasses.map(withId));

  await upsert(
    Asset,
    datesOn(assets, ['purchaseDate', 'warrantyExpiry', 'telemetry.lastPing']).map(withId),
  );

  await upsert(AssetGroup, assetGroups.map(withId));
  await upsert(AssetDocument, datesOn(assetDocs, ['uploadedAt']).map(withId));
  await upsert(MovementTrail, datesOn(movementTrails, ['points[].timestamp']).map(keyedBy('assetId')));

  await upsert(
    WorkOrder,
    datesOn(workOrders, ['dueDate', 'createdAt', 'detail.laborLog[].at', 'detail.comments[].at']).map((wo) => {
      const { detail, ...rest } = wo;
      return {
        ...withId(rest as typeof rest & { id: string }),
        checklist: detail?.checklist ?? [],
        parts: detail?.parts ?? [],
        laborLog: detail?.laborLog ?? [],
        comments: detail?.comments ?? [],
        completedAt: rest.status === 'Completed' ? rest.createdAt : undefined,
      };
    }),
  );

  // Activity is an append-only stream keyed by ObjectId, so its rows cannot be
  // upserted by fixture ID. Seed it only when empty — re-running the seeder
  // must never duplicate entries in a log that is meant to be immutable.
  await insertIfEmpty(Activity, () =>
    datesOn(activity, ['timestamp']).map((event) => ({
      assetId: event.assetId,
      type: event.type,
      description: event.description,
      actor: event.actor,
      timestamp: event.timestamp,
    })),
  );

  // ── Maintenance planning ───────────────────────────────────────────────────
  await upsert(PmSchedule, datesOn(pmSchedules, ['nextDue', 'lastDone']).map(withId));
  await upsert(Inspection, datesOn(inspections, ['dueDate']).map(withId));

  // ── AI ─────────────────────────────────────────────────────────────────────
  await upsert(
    Insight,
    datesOn(insights, ['createdAt']).map((i) => ({ ...withId(i), status: 'open' as const })),
  );
  await upsert(AiModel, datesOn(aiModels, ['lastTrained', 'versions[].trainedAt']).map(withId));
  await upsert(ForecastSeries, forecasts.map(withId));
  await upsert(AnomalyEvent, datesOn(anomalies, ['detectedAt']).map(withId));

  // ── Tracking: operational estate ───────────────────────────────────────────
  await upsert(Zone, zones.map(withId));
  await upsert(Gateway, datesOn(gateways, ['lastSeen']).map(withId));
  await upsert(Sensor, datesOn(sensors, ['lastReading']).map(withId));
  await upsert(Geofence, geofences.map(withId));

  // ── Tracking: workspace ────────────────────────────────────────────────────
  await upsert(TrackedFacility, trackedFacilities.map(keyedBy('slug')));
  await upsert(TrackedZone, trackedZones.map(withId));
  await upsert(CoverageCell, coverageCells.map(keyedBy('zoneId')));

  await upsert(AssetPresence, datesOn(assetPresence, ['lastSeen']).map(keyedBy('assetId')));
  await upsert(
    AssetJourney,
    datesOn(journeys, ['windowFrom', 'windowTo', 'stops[].at']).map(keyedBy('assetId')),
  );
  await upsert(TrackingEvent, datesOn(trackingEvents, ['at']).map(withId));

  await upsert(
    TrackingAlert,
    datesOn(trackingAlerts, ['raisedAt', 'ackAt', 'resolvedAt', 'slaDueAt', 'timeline[].at']).map(withId),
  );
  await upsert(Incident, datesOn(incidents, ['openedAt', 'resolvedAt']).map(withId));
  await upsert(AutomationRule, automationRules.map(withId));

  await upsert(InventoryRoom, datesOn(inventoryRooms, ['lastVerified']).map(withId));
  await upsert(Rack, datesOn(racks, ['lastVerified']).map(withId));
  await upsert(AuditSession, datesOn(auditSessions, ['startedAt', 'dueAt', 'approvedAt']).map(withId));
  await upsert(InventoryException, datesOn(inventoryExceptions, ['detectedAt']).map(withId));
  await upsert(UnknownDetection, datesOn(unknownDetections, ['firstSeen', 'lastSeen']).map(withId));
  await upsert(MovementTxn, datesOn(movementTxns, ['at', 'dueBack', 'returnedAt']).map(withId));

  await upsert(
    TrackingDevice,
    datesOn(trackingDevices, ['lastSeen', 'installedAt', 'replaceBy']).map(withId),
  );
  await upsert(FirmwareCampaign, firmwareCampaigns.map(withId));

  // ── Labelling ──────────────────────────────────────────────────────────────
  await upsert(LabelTemplate, datesOn(labelTemplates, ['updatedAt']).map(withId));
  await upsert(PrintDevice, datesOn(printDevices, ['lastSeen']).map(withId));
  await upsert(PrintJob, datesOn(printJobs, ['createdAt', 'completedAt']).map(withId));

  // ── Alerts & inbox ─────────────────────────────────────────────────────────
  await upsert(Alert, datesOn(alerts, ['createdAt']).map(withId));
  await upsert(AlertRule, alertRules.map(withId));
  await upsert(Notification, datesOn(notifications, ['at']).map(withId));

  // ── Compliance ─────────────────────────────────────────────────────────────
  await upsert(CustodyRecord, datesOn(custody, ['at']).map(withId));
  await upsert(CycleCount, datesOn(cycleCounts, ['date']).map(withId));
  await upsert(Certification, datesOn(certifications, ['issuedAt', 'expiresAt']).map(withId));

  // Same reasoning as the activity stream: the audit log is append-only.
  await insertIfEmpty(AuditLog, () =>
    datesOn(auditLog, ['timestamp']).map((a) => ({
      actor: a.actor,
      action: a.action,
      target: a.target,
      category: a.category,
      ip: a.ip,
      timestamp: a.timestamp,
    })),
  );

  // ── Inventory & procurement ────────────────────────────────────────────────
  await upsert(Warehouse, warehouses.map(withId));
  await upsert(Supplier, suppliers.map(withId));
  await upsert(Part, parts.map(withId));
  await upsert(
    PurchaseOrder,
    datesOn(purchaseOrders, ['createdAt', 'expectedAt']).map(withId),
  );

  // ── Analytics & administration ─────────────────────────────────────────────
  await upsert(Report, datesOn(reports, ['lastRun']).map(withId));
  await upsert(Integration, datesOn(integrations, ['lastSync']).map(withId));
  await upsert(ApprovalWorkflow, approvalWorkflows.map(withId));

  // ── Operations ─────────────────────────────────────────────────────────────
  await upsert(Transfer, datesOn(transfers, ['requestedAt', 'approvedAt', 'receivedAt']).map(withId));
  await upsert(Reservation, reservations.map(withId));

  // ── Platform administration ────────────────────────────────────────────────
  await upsert(Team, teams.map(withId));
  await upsert(ApiKey, datesOn(apiKeys, ['createdAt', 'lastUsed']).map(withId));
  await upsert(Webhook, datesOn(webhooks, ['lastDelivery']).map(withId));
  await upsert(Passkey, datesOn(passkeys, ['added']).map(withId));
  await upsert(Backup, datesOn(backups, ['when']).map(withId));
  await upsert(Invoice, invoices.map(withId));
  await upsert(ExportJob, datesOn(exportJobs, ['at']).map(withId));
  await upsert(SupportTicket, datesOn(supportTickets, ['updated']).map(withId));

  // ── Governance ─────────────────────────────────────────────────────────────
  await upsert(EscalationPolicy, escalationPolicies.map(withId));
  await upsert(OnCallShift, onCallShifts.map(withId));
  await upsert(ComplianceFramework, datesOn(complianceFrameworks, ['lastAssessment']).map(withId));
  await upsert(RetentionPolicy, retentionPolicies.map(withId));
  await upsert(ReportPack, reportPacks.map(withId));

  // ── Registration sources & help ────────────────────────────────────────────
  await upsert(ReceivedPoLine, datesOn(poLines, ['receivedAt']).map(withId));
  await upsert(PendingScan, datesOn(pendingScans, ['scannedAt']).map(withId));
  await upsert(HelpArticle, helpArticles.map(withId));
  await upsert(HelpCategory, helpCategories.map(withId));

  // ── ID sequences ───────────────────────────────────────────────────────────
  // Push each counter past the highest seeded ID so newly created records
  // continue the same numbering instead of colliding with a fixture. This runs
  // last and matters most: without it the first asset anyone creates collides
  // with a fixture, so it is retried like everything else.
  const sequences: [name: string, ids: string[]][] = [
    ['asset', assets.map((a) => a.id)],
    ['workOrder', workOrders.map((w) => w.id)],
    ['alert', alerts.map((a) => a.id)],
    ['sensor', sensors.map((s) => s.id)],
    ['geofence', geofences.map((g) => g.id)],
    ['user', users.map((u) => u.id)],
    ['labelTemplate', labelTemplates.map((t) => t.id)],
    ['printJob', printJobs.map((j) => j.id)],
    // Minted at runtime when an asset changes hands, so it has to clear the
    // seeded rows first.
    ['custody', custody.map((c) => c.id)],
    ['transfer', transfers.map((t) => t.id)],
    ['reservation', reservations.map((r) => r.id)],
    // Collections whose screens used to mutate React state and now write to the
    // database. Each mints IDs at runtime, so each needs to clear its fixtures
    // the same way — a support ticket numbered SUP-1 next to a seeded SUP-4821
    // is the visible symptom of forgetting one.
    ['alertRule', alertRules.map((r) => r.id)],
    ['apiKey', apiKeys.map((k) => k.id)],
    ['escalationPolicy', escalationPolicies.map((p) => p.id)],
    ['exportJob', exportJobs.map((j) => j.id)],
    ['report', reports.map((r) => r.id)],
    ['supportTicket', supportTickets.map((t) => t.id)],
    ['team', teams.map((t) => t.id)],
    ['webhook', webhooks.map((w) => w.id)],
    // The tracking workspace's own runtime IDs. Its fixtures are numbered high
    // (MOV-8801, AUD-2041), so without these the first movement anyone records
    // is MOV-1 and sorts to the bottom of a list ordered by id.
    ['incident', incidents.map((i) => i.id)],
    ['movementTxn', movementTxns.map((m) => m.id)],
    ['auditSession', auditSessions.map((a) => a.id)],
    ['trackingDevice', trackingDevices.map((d) => d.id)],
  ];

  for (const [name, ids] of sequences) {
    await withRetry(`counter:${name}`, () => syncCounter(name, highestSuffix(ids)));
  }
  logger.info(`  counters             ${sequences.length}`);

  const [assetCount, userCount, presenceCount] = await Promise.all([
    withRetry('assets', () => Asset.countDocuments()),
    withRetry('users', () => User.countDocuments()),
    withRetry('presence', () => AssetPresence.countDocuments()),
  ]);

  logger.info('Seed complete', { assets: assetCount, users: userCount, tracked: presenceCount });
  logger.info(`Sign in with any seeded email and the password: ${env.SEED_PASSWORD}`);
  logger.info(`  e.g. ${users[0]?.email ?? 'raj@bcss.in'}`);
}

seed()
  .then(() => disconnectDb())
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    logger.error('Seed failed', { err: err instanceof Error ? err.stack : String(err) });
    process.exit(1);
  });
