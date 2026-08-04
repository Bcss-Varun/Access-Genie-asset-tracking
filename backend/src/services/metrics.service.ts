import type { AssetHealth, Criticality } from '@access-genie/shared';
import {
  Asset,
  AssetClass,
  AssetPresence,
  CustodyRecord,
  PmSchedule,
  WorkOrder,
  healthStatusFor,
  type AssetDoc,
} from '../models/index.js';
import { presenceStateFor } from './observation.service.js';

/**
 * Derived asset metrics — health, utilization, risk.
 *
 * These three numbers drive the registry sort, every dashboard tile, the
 * top-risk lists and the maintenance queue. They were columns nothing ever
 * wrote: whatever a seed put there stayed there forever, so an asset could sit
 * at "health 96" through a year of failures.
 *
 * Two decisions shape this module.
 *
 * They are **materialised**, not computed at read. Sorting and filtering happen
 * in MongoDB (`sort: riskScore desc`, `filter: healthScore < 60`), and a value
 * that only exists in application code cannot be sorted on without pulling the
 * whole collection into memory. So they are recomputed when their inputs change
 * and stored on the asset.
 *
 * They are **explainable**. Every score returns the factors that produced it,
 * because "this asset is risk 74" is not actionable and "risk 74: eight years
 * old against a five-year life, two open corrective orders, PM 40 days overdue"
 * is. The insight generator below quotes those factors verbatim rather than
 * inventing its own narrative.
 */

/** How much a class's expected life has been used up. */
const DEFAULT_USEFUL_LIFE_YEARS = 5;

/** Rolling window for "is this thing actually being used". */
const UTILIZATION_WINDOW_DAYS = 30;

const CRITICALITY_WEIGHT: Record<Criticality, number> = {
  Low: 0.6,
  Medium: 0.8,
  High: 1.0,
  Critical: 1.2,
};

export interface AssetMetrics {
  healthScore: number;
  healthStatus: AssetHealth;
  utilization: number;
  riskScore: number;
  /** Why each score is what it is — surfaced in the UI, never discarded. */
  drivers: string[];
}

/** Everything the formulas need, gathered once for the whole estate. */
export interface MetricsContext {
  usefulLifeByClass: Map<string, number>;
  openCorrectiveByAsset: Map<string, number>;
  overduePmByAsset: Map<string, number>;
  lastSeenByAsset: Map<string, Date>;
  homeZoneByAsset: Map<string, string>;
  currentZoneByAsset: Map<string, string>;
  activeDaysByAsset: Map<string, number>;
  now: number;
}

/**
 * Load the inputs for every asset in a handful of queries.
 *
 * Per-asset lookups would be N×5 round trips over a collection that is read in
 * full anyway; this is five aggregations regardless of estate size.
 */
export async function loadMetricsContext(): Promise<MetricsContext> {
  const now = Date.now();
  const windowStart = new Date(now - UTILIZATION_WINDOW_DAYS * 86_400_000);

  const [classes, openWork, pmSchedules, presence, custody] = await Promise.all([
    AssetClass.find().select('_id name usefulLifeYears').lean(),
    WorkOrder.aggregate<{ _id: string; count: number }>([
      { $match: { status: { $ne: 'Completed' }, type: { $ne: 'Preventive' } } },
      { $group: { _id: '$assetId', count: { $sum: 1 } } },
    ]),
    PmSchedule.find({ nextDue: { $lt: new Date(now) } }).select('assetId nextDue').lean(),
    AssetPresence.find().select('_id lastSeen zone homeZone').lean(),
    // Days on which the asset was in someone's hands — the other half of "in use".
    CustodyRecord.find({ at: { $gte: windowStart } }).select('assetId at').lean(),
  ]);

  const overduePmByAsset = new Map<string, number>();
  for (const pm of pmSchedules) {
    const daysLate = Math.floor((now - new Date(pm.nextDue).getTime()) / 86_400_000);
    overduePmByAsset.set(pm.assetId, Math.max(overduePmByAsset.get(pm.assetId) ?? 0, daysLate));
  }

  // "Active" is a day with any sighting or custody movement. Sparse observation
  // is the norm — a warehouse tag might be read twice a day — so counting
  // distinct active days is far more honest than trying to integrate dwell time
  // from readings that may be hours apart.
  const activeDays = new Map<string, Set<string>>();
  const addDay = (assetId: string, at: Date) => {
    const key = at.toISOString().slice(0, 10);
    const set = activeDays.get(assetId) ?? new Set<string>();
    set.add(key);
    activeDays.set(assetId, set);
  };
  for (const c of custody) addDay(c.assetId, new Date(c.at));
  for (const p of presence) if (new Date(p.lastSeen) >= windowStart) addDay(p._id, new Date(p.lastSeen));

  return {
    usefulLifeByClass: new Map(classes.map((c) => [c._id, c.usefulLifeYears ?? DEFAULT_USEFUL_LIFE_YEARS])),
    openCorrectiveByAsset: new Map(openWork.map((w) => [w._id, w.count])),
    overduePmByAsset,
    lastSeenByAsset: new Map(presence.map((p) => [p._id, new Date(p.lastSeen)])),
    homeZoneByAsset: new Map(presence.map((p) => [p._id, p.homeZone])),
    currentZoneByAsset: new Map(presence.map((p) => [p._id, p.zone])),
    activeDaysByAsset: new Map([...activeDays].map(([id, set]) => [id, set.size])),
    now,
  };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Compute the three scores for one asset.
 *
 * Deductive rather than additive: an asset starts healthy and loses points for
 * things that are actually known to be wrong with it. That way an asset nobody
 * has told us anything about scores high, which is the truthful answer — we
 * have no evidence against it — instead of scoring low and burying the assets
 * with real problems.
 */
export function computeMetrics(asset: AssetDoc, ctx: MetricsContext): AssetMetrics {
  const drivers: string[] = [];

  // ── Health ────────────────────────────────────────────────────────────────
  let health = 100;

  // `onboarding` is a loosely-typed embedded document, so the class id is
  // narrowed here rather than trusted.
  const classId = typeof asset.onboarding?.classId === 'string' ? asset.onboarding.classId : undefined;
  const usefulLife = (classId ? ctx.usefulLifeByClass.get(classId) : undefined) ?? DEFAULT_USEFUL_LIFE_YEARS;
  if (asset.purchaseDate) {
    const ageYears = (ctx.now - new Date(asset.purchaseDate).getTime()) / (365.25 * 86_400_000);
    if (ageYears > 0) {
      const wear = Math.min(40, (40 * ageYears) / usefulLife);
      health -= wear;
      if (wear >= 8) {
        drivers.push(`${ageYears.toFixed(1)} years old against a ${usefulLife}-year expected life`);
      }
    }
  }

  const openCorrective = ctx.openCorrectiveByAsset.get(String(asset._id)) ?? 0;
  if (openCorrective > 0) {
    health -= Math.min(30, openCorrective * 10);
    drivers.push(`${openCorrective} open corrective work order${openCorrective === 1 ? '' : 's'}`);
  }

  const pmOverdueDays = ctx.overduePmByAsset.get(String(asset._id)) ?? 0;
  if (pmOverdueDays > 0) {
    health -= 15;
    drivers.push(`preventive maintenance ${pmOverdueDays} day${pmOverdueDays === 1 ? '' : 's'} overdue`);
  }

  const battery = asset.telemetry?.batteryLevel;
  if (battery !== undefined && battery < 20) {
    health -= 10;
    drivers.push(`tag battery at ${battery}%`);
  }

  if (asset.status === 'Missing') {
    health -= 25;
    drivers.push('reported missing');
  }

  const healthScore = clamp(health);

  // ── Utilization ───────────────────────────────────────────────────────────
  const activeDays = ctx.activeDaysByAsset.get(String(asset._id)) ?? 0;
  const utilization = clamp((activeDays / UTILIZATION_WINDOW_DAYS) * 100);
  if (activeDays === 0) {
    drivers.push(`no activity recorded in ${UTILIZATION_WINDOW_DAYS} days`);
  }

  // ── Risk ──────────────────────────────────────────────────────────────────
  // Likelihood (poor health) scaled by consequence (how much it matters), then
  // pushed up by the things that make an asset hard to *act on* at all.
  let risk = (100 - healthScore) * CRITICALITY_WEIGHT[asset.criticality ?? 'Medium'];

  const home = ctx.homeZoneByAsset.get(String(asset._id));
  const current = ctx.currentZoneByAsset.get(String(asset._id));
  if (home && current && home !== current) {
    risk += 15;
    drivers.push(`outside its home zone (${current}, expected ${home})`);
  }

  const lastSeen = ctx.lastSeenByAsset.get(String(asset._id));
  if (!lastSeen) {
    risk += 10;
    drivers.push('never observed by any reader or scan');
  } else if (presenceStateFor(lastSeen, ctx.now) === 'Offline') {
    risk += 12;
    const days = Math.floor((ctx.now - lastSeen.getTime()) / 86_400_000);
    drivers.push(days >= 1 ? `not seen for ${days} day${days === 1 ? '' : 's'}` : 'not seen recently');
  }

  if (!asset.trackingId) {
    risk += 8;
    drivers.push('no tag bound — cannot be located');
  }

  return {
    healthScore,
    healthStatus: healthStatusFor(healthScore),
    utilization,
    riskScore: clamp(risk),
    drivers,
  };
}

/**
 * Recompute and persist metrics across the estate.
 *
 * Called after the events that move the inputs — an observation, a work order
 * closing, a PM falling due — and available as an endpoint so an operator can
 * force it. Writes only where a value actually changed, so a no-op sweep costs
 * one read and no writes.
 */
export async function recomputeAllMetrics(): Promise<{ scanned: number; updated: number }> {
  const [assets, ctx] = await Promise.all([Asset.find().lean<AssetDoc[]>(), loadMetricsContext()]);

  const ops = [];
  for (const asset of assets) {
    const next = computeMetrics(asset, ctx);
    const unchanged =
      asset.healthScore === next.healthScore &&
      asset.utilization === next.utilization &&
      asset.riskScore === next.riskScore;
    if (unchanged) continue;

    ops.push({
      updateOne: {
        filter: { _id: asset._id },
        update: {
          $set: {
            healthScore: next.healthScore,
            healthStatus: next.healthStatus,
            utilization: next.utilization,
            riskScore: next.riskScore,
          },
        },
      },
    });
  }

  if (ops.length > 0) await Asset.bulkWrite(ops);
  return { scanned: assets.length, updated: ops.length };
}

/** Metrics for one asset, with the factors — what the explainability screen reads. */
export async function explainAsset(assetId: string): Promise<(AssetMetrics & { assetId: string }) | null> {
  const [asset, ctx] = await Promise.all([Asset.findById(assetId).lean<AssetDoc>(), loadMetricsContext()]);
  if (!asset) return null;
  return { assetId, ...computeMetrics(asset, ctx) };
}
