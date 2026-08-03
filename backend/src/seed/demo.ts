/**
 * Seed the database from the fixture set in `seed/data/`.
 *
 *   npm run seed          — upsert: refreshes records, keeps anything you added
 *   npm run seed:fresh    — drop every seeded collection first
 *
 * The fixtures were extracted verbatim from the original Next.js prototype, so
 * the MERN app opens on exactly the data the demo showed. Timestamps are
 * anchored to a fixed "demo now" in the source data, which keeps the dashboard
 * deterministic between runs.
 */
import type { Model } from 'mongoose';
import { connectDb, disconnectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  Activity,
  Alert,
  AlertRule,
  Asset,
  AuditLog,
  Counter,
  CustodyRecord,
  Gateway,
  Geofence,
  Insight,
  Notification,
  Part,
  PurchaseOrder,
  ScopeNodeModel,
  Sensor,
  Supplier,
  User,
  Warehouse,
  WorkOrder,
  Zone,
  syncCounter,
} from '../models/index.js';
import { highestSuffix } from '../models/Counter.js';

import assets from './data/assets.json' with { type: 'json' };
import workOrders from './data/workOrders.json' with { type: 'json' };
import insights from './data/insights.json' with { type: 'json' };
import zones from './data/zones.json' with { type: 'json' };
import activity from './data/activity.json' with { type: 'json' };
import sensors from './data/sensors.json' with { type: 'json' };
import gateways from './data/gateways.json' with { type: 'json' };
import geofences from './data/geofences.json' with { type: 'json' };
import alerts from './data/alerts.json' with { type: 'json' };
import alertRules from './data/alertRules.json' with { type: 'json' };
import notifications from './data/notifications.json' with { type: 'json' };
import auditLog from './data/auditLog.json' with { type: 'json' };
import custody from './data/custody.json' with { type: 'json' };
import parts from './data/parts.json' with { type: 'json' };
import warehouses from './data/warehouses.json' with { type: 'json' };
import suppliers from './data/suppliers.json' with { type: 'json' };
import purchaseOrders from './data/purchaseOrders.json' with { type: 'json' };
import users from './data/users.json' with { type: 'json' };
import scope from './data/scope.json' with { type: 'json' };

const FRESH = process.argv.includes('--fresh');

/**
 * The seeder writes to twenty differently-typed models through two generic
 * helpers. Mongoose's per-model generics do not unify across that set, so the
 * helpers take this deliberately loose view of a model — the shape they
 * actually use — rather than fighting the type system for no safety gain: the
 * fixtures are still validated by each schema on write.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SeedModel = Model<any>;

/** Fixture records carry `id`; Mongo wants `_id`. */
function withId<T extends { id: string }>(record: T): Omit<T, 'id'> & { _id: string } {
  const { id, ...rest } = record;
  return { ...rest, _id: id };
}

const date = (value: string | undefined) => (value ? new Date(value) : undefined);

/**
 * Upsert a collection.
 *
 * `bulkWrite` with one upsert per record means re-running the seeder refreshes
 * the fixture rows without touching anything created since — the behaviour you
 * want when you have been clicking around and do not want to lose your work.
 */
async function upsert(model: SeedModel, docs: { _id: string }[]): Promise<void> {
  if (!docs.length) return;

  await model.bulkWrite(
    docs.map((doc) => ({
      replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
    })),
  );

  logger.info(`  ${model.collection.name.padEnd(16)} ${docs.length}`);
}

/** Insert fixtures into an append-only collection, but only if it is empty. */
async function insertIfEmpty(model: SeedModel, build: () => Record<string, unknown>[]): Promise<void> {
  const existing = await model.countDocuments();
  if (existing > 0) {
    logger.info(`  ${model.collection.name.padEnd(16)} skipped (${existing} existing)`);
    return;
  }

  const docs = build();
  await model.insertMany(docs);
  logger.info(`  ${model.collection.name.padEnd(16)} ${docs.length}`);
}

async function seed(): Promise<void> {
  await connectDb();

  if (FRESH) {
    logger.warn('--fresh: dropping seeded collections');
    const collections: SeedModel[] = [
      Asset, WorkOrder, Alert, AlertRule, Insight, Sensor, Gateway, Geofence, Zone,
      Activity, CustodyRecord, Notification, AuditLog, ScopeNodeModel,
      Part, Warehouse, Supplier, PurchaseOrder, User, Counter,
    ];
    await Promise.all(collections.map((model) => model.deleteMany({})));
  }

  logger.info('Seeding Access Genie…');

  // ── Location tree ──────────────────────────────────────────────────────────
  await upsert(ScopeNodeModel, scope.map(withId));

  // ── People ─────────────────────────────────────────────────────────────────
  // Created one at a time (not bulkWrite) so the pre-save hook hashes each
  // password — a bulk write bypasses middleware entirely.
  for (const person of users) {
    const existing = await User.findById(person.id);
    if (existing) continue;

    await User.create({
      _id: person.id,
      name: person.name,
      email: person.email,
      passwordHash: env.SEED_PASSWORD,
      initials: person.initials,
      roleId: person.roleId,
      title: person.title,
      homeScopeId: person.homeScopeId,
      status: 'active',
    });
  }
  logger.info(`  users            ${users.length}`);

  // ── Asset graph ────────────────────────────────────────────────────────────
  await upsert(
    Asset,
    assets.map((a) => ({
      ...withId(a),
      purchaseDate: date(a.purchaseDate)!,
      warrantyExpiry: date(a.warrantyExpiry),
      telemetry: a.telemetry ? { ...a.telemetry, lastPing: date(a.telemetry.lastPing)! } : undefined,
    })),
  );

  await upsert(
    WorkOrder,
    workOrders.map((wo) => {
      const { detail, createdAt, dueDate, ...rest } = wo;
      return {
        ...withId(rest as typeof rest & { id: string }),
        dueDate: date(dueDate)!,
        createdAt: date(createdAt)!,
        checklist: detail?.checklist ?? [],
        parts: detail?.parts ?? [],
        laborLog: (detail?.laborLog ?? []).map((l) => ({ ...l, at: date(l.at)! })),
        comments: (detail?.comments ?? []).map((c) => ({ ...c, at: date(c.at)! })),
        completedAt: rest.status === 'Completed' ? date(createdAt) : undefined,
      };
    }),
  );

  // Activity is an append-only stream keyed by ObjectId, so its rows cannot be
  // upserted by fixture ID. Seed it only when empty — re-running the seeder
  // must never duplicate entries in a log that is meant to be immutable.
  await insertIfEmpty(Activity, () =>
    activity.map((event) => ({
      assetId: event.assetId,
      type: event.type,
      description: event.description,
      actor: event.actor,
      timestamp: date(event.timestamp)!,
    })),
  );

  await upsert(Insight, insights.map((i) => ({ ...withId(i), createdAt: date(i.createdAt)!, status: 'open' as const })));

  // ── Tracking ───────────────────────────────────────────────────────────────
  await upsert(Zone, zones.map(withId));
  await upsert(Gateway, gateways.map((g) => ({ ...withId(g), lastSeen: date(g.lastSeen)! })));
  await upsert(Sensor, sensors.map((s) => ({ ...withId(s), lastReading: date(s.lastReading)! })));
  await upsert(Geofence, geofences.map(withId));

  // ── Alerts & inbox ─────────────────────────────────────────────────────────
  await upsert(Alert, alerts.map((a) => ({ ...withId(a), createdAt: date(a.createdAt)! })));
  await upsert(AlertRule, alertRules.map(withId));
  await upsert(Notification, notifications.map((n) => ({ ...withId(n), at: date(n.at)! })));

  // ── Compliance ─────────────────────────────────────────────────────────────
  await upsert(CustodyRecord, custody.map((c) => ({ ...withId(c), at: date(c.at)! })));

  // Same reasoning as the activity stream: the audit log is append-only.
  await insertIfEmpty(AuditLog, () =>
    auditLog.map((a) => ({
      actor: a.actor,
      action: a.action,
      target: a.target,
      category: a.category,
      ip: a.ip,
      timestamp: date(a.timestamp)!,
    })),
  );

  // ── Inventory ──────────────────────────────────────────────────────────────
  await upsert(Warehouse, warehouses.map(withId));
  await upsert(Supplier, suppliers.map(withId));
  await upsert(Part, parts.map(withId));
  await upsert(
    PurchaseOrder,
    purchaseOrders.map((po) => ({ ...withId(po), createdAt: date(po.createdAt)!, expectedAt: date(po.expectedAt)! })),
  );

  // ── ID sequences ───────────────────────────────────────────────────────────
  // Push each counter past the highest seeded ID so newly created records
  // continue the same numbering instead of colliding with a fixture.
  await Promise.all([
    syncCounter('asset', highestSuffix(assets.map((a) => a.id))),
    syncCounter('workOrder', highestSuffix(workOrders.map((w) => w.id))),
    syncCounter('alert', highestSuffix(alerts.map((a) => a.id))),
    syncCounter('sensor', highestSuffix(sensors.map((s) => s.id))),
    syncCounter('geofence', highestSuffix(geofences.map((g) => g.id))),
    syncCounter('user', highestSuffix(users.map((u) => u.id))),
  ]);

  const [assetCount, userCount] = await Promise.all([Asset.countDocuments(), User.countDocuments()]);

  logger.info('Seed complete', { assets: assetCount, users: userCount });
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
