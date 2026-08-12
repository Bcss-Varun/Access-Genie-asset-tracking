import type { FilterQuery } from 'mongoose';
import type { ApiMeta } from '@access-genie/shared';
import { Activity, Asset, CustodyRecord, Insight, LifecycleTransition, Transfer, WorkOrder, healthStatusFor, nextId, type AssetDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import { csvFilter, escapeRegex, paginate, parsePagination } from '../utils/query.js';
import { projectAssetUpdate, projectNewAsset, retireAssetFromGraph } from './assetGraph.service.js';
import { applyLifecycleTransition } from './lifecycle.service.js';
import type { AssetListQuery, CreateAssetInput, UpdateAssetInput } from '../validators/asset.validator.js';

const SORTABLE = ['name', 'healthScore', 'riskScore', 'utilization', 'purchasePrice', 'purchaseDate', 'createdAt', 'updatedAt'];

/** Translate the validated query string into a Mongo filter. */
function buildFilter(query: AssetListQuery): FilterQuery<AssetDoc> {
  const filter: FilterQuery<AssetDoc> = {};

  const status = csvFilter(query.status);
  if (status) filter.status = status;

  const category = csvFilter(query.category);
  if (category) filter.category = category;

  const health = csvFilter(query.health);
  if (health) filter.healthStatus = health;

  const criticality = csvFilter(query.criticality);
  if (criticality) filter.criticality = criticality;

  const tech = csvFilter(query.trackingTech);
  if (tech) filter.trackingTech = tech;

  if (query.facility) filter['location.name'] = query.facility;
  if (query.tracked !== undefined) filter.trackingId = query.tracked ? { $exists: true, $ne: null } : { $in: [null, undefined] };

  if (query.q) {
    // Anchored regex over the fields a user actually types into a registry
    // search. Regex rather than `$text` so partial serials ("SVR-88") match —
    // `$text` only matches whole words.
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: rx }, { serialNumber: rx }, { trackingId: rx }, { manufacturer: rx }, { model: rx }, { _id: rx }];
  }

  return filter;
}

export async function listAssets(query: AssetListQuery): Promise<{ items: AssetDoc[]; meta: ApiMeta }> {
  const pagination = parsePagination(query, SORTABLE, '-createdAt');
  return paginate(Asset, buildFilter(query), pagination);
}

export async function getAsset(id: string): Promise<AssetDoc> {
  const asset = await Asset.findById(id).lean<AssetDoc>();
  if (!asset) throw ApiError.notFound('Asset');
  return asset;
}

/**
 * The asset-360 read: the record plus every timeline that hangs off it, in one
 * round-trip. Fetched concurrently — they are independent collections and the
 * page renders them side by side.
 */
export async function getAssetProfile(id: string) {
  const asset = await getAsset(id);

  const [workOrders, activity, insights, custody, lifecycleHistory] = await Promise.all([
    WorkOrder.find({ assetId: id }).sort({ dueDate: 1 }).limit(50).lean(),
    Activity.find({ assetId: id }).sort({ timestamp: -1 }).limit(50).lean(),
    Insight.find({ assetId: id, status: 'open' }).sort({ createdAt: -1 }).limit(20).lean(),
    CustodyRecord.find({ assetId: id }).sort({ at: -1 }).limit(20).lean(),
    LifecycleTransition.find({ assetId: id }).sort({ requestedAt: -1 }).limit(50).lean(),
  ]);

  return { asset, workOrders, activity, insights, custody, lifecycleHistory };
}

export async function createAsset(input: CreateAssetInput, actor: string): Promise<AssetDoc> {
  const id = input.id ?? (await nextId('asset', 'AST'));

  const existing = await Asset.findById(id).lean();
  if (existing) throw ApiError.conflict(`Asset ${id} already exists`);

  const asset = await Asset.create({
    ...input,
    _id: id,
    healthStatus: healthStatusFor(input.healthScore),
    // An asset can be registered before anyone has decided who holds it or
    // found the invoice — that is what makes "commit early" possible. The
    // record still gets a definite value for both, so no reader downstream has
    // to cope with a blank: unclaimed is `Unassigned`, and undated is dated
    // from the registration itself.
    custodian: input.custodian ?? 'Unassigned',
    purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : new Date(),
    warrantyExpiry: input.warrantyExpiry ? new Date(input.warrantyExpiry) : undefined,
    telemetry: input.telemetry ? { ...input.telemetry, lastPing: new Date(input.telemetry.lastPing) } : undefined,
  });

  await Activity.create({
    assetId: id,
    type: 'Registration',
    description: `${asset.name} registered into the asset graph`,
    actor,
    timestamp: new Date(),
  });

  // §6 Stage Automation: "Asset Registered → Commissioning". The schema
  // default is `Planning` (an asset someone is still budgeting for); one that
  // has actually been created here — imported, form-entered or registered —
  // physically exists, so it starts at Commissioning regardless of which of
  // the three create paths brought it in.
  await applyLifecycleTransition(id, 'Commissioning', {
    actor,
    reason: 'Asset registered',
    automated: true,
  });

  // The asset is committed; now make it visible everywhere it belongs — the
  // live map, the device estate, the chain of custody. See assetGraph.service.
  const { mapPosition } = await projectNewAsset(asset.toObject(), actor);
  if (mapPosition && !asset.mapPosition) {
    asset.mapPosition = mapPosition;
    await asset.save();
  }

  return Asset.findById(id).lean() as Promise<AssetDoc>;
}

export async function updateAsset(id: string, input: UpdateAssetInput, actor: string): Promise<AssetDoc> {
  const asset = await Asset.findById(id);
  if (!asset) throw ApiError.notFound('Asset');

  const previousStatus = asset.status;
  const previousLocation = asset.location?.name;
  const previousName = asset.name;
  const previous = {
    custodian: asset.custodian,
    trackingId: asset.trackingId,
    location: asset.location ? { ...asset.location } : asset.location,
  };

  // A blank optional field arrives as `undefined`, and assigning that would
  // clear a value the edit never meant to touch — blanking the custodian of an
  // asset because the form's date input was left empty. Absent means "leave it".
  // `note` is stripped: it explains the change rather than being part of it.
  const { note, ...fields } = input;
  const defined = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

  Object.assign(asset, {
    ...defined,
    ...(input.purchaseDate ? { purchaseDate: new Date(input.purchaseDate) } : {}),
    ...(input.warrantyExpiry ? { warrantyExpiry: new Date(input.warrantyExpiry) } : {}),
    ...(input.telemetry ? { telemetry: { ...input.telemetry, lastPing: new Date(input.telemetry.lastPing) } } : {}),
  });

  await asset.save();

  // A rename must not leave every open work order and in-flight transfer
  // showing the old name — those are current state, not history, so they
  // carry the asset's name forward the same way the asset record itself just
  // did. Closed/cancelled records are left alone: they are a log of what the
  // asset was called at the time, which is the correct thing for a log to say.
  if (asset.name !== previousName) {
    await Promise.all([
      WorkOrder.updateMany(
        { assetId: id, status: { $nin: ['Completed', 'Cancelled'] } },
        { $set: { assetName: asset.name } },
      ),
      Transfer.updateMany(
        { assetId: id, status: { $nin: ['Completed', 'Rejected', 'Cancelled'] } },
        { $set: { assetName: asset.name } },
      ),
    ]);
  }

  // Timeline entries for the two changes an auditor cares about.
  if (input.status && input.status !== previousStatus) {
    await Activity.create({
      assetId: id,
      type: 'Audit',
      description: note
        ? `Status changed from ${previousStatus} to ${input.status} — ${note}`
        : `Status changed from ${previousStatus} to ${input.status}`,
      actor,
      timestamp: new Date(),
    });
  }
  if (input.location?.name && input.location.name !== previousLocation) {
    await Activity.create({
      assetId: id,
      type: 'Movement',
      description: `Moved from ${previousLocation ?? 'unknown'} to ${input.location.name}`,
      actor,
      timestamp: new Date(),
    });
  }

  // Move the dot, open a custody entry, register a newly bound tag.
  const { mapPosition } = await projectAssetUpdate(asset.toObject(), previous, actor);
  if (mapPosition) {
    asset.mapPosition = mapPosition;
    await asset.save();
  }

  return asset.toObject();
}

export async function deleteAsset(id: string): Promise<void> {
  const asset = await Asset.findById(id);
  if (!asset) throw ApiError.notFound('Asset');

  const openWorkOrders = await WorkOrder.countDocuments({ assetId: id, status: { $ne: 'Completed' } });
  if (openWorkOrders > 0) {
    throw ApiError.conflict(`Cannot retire an asset with ${openWorkOrders} open work order(s)`);
  }

  await asset.deleteOne();

  // Stop it occupying a dot on the map and being counted as live hardware.
  // Custody and activity stay — they are history.
  await retireAssetFromGraph(id);
}

/** Registry-wide counters for the assets page header. */
export async function getAssetStats() {
  const [byStatus, byCategory, totals] = await Promise.all([
    Asset.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Asset.aggregate<{ _id: string; count: number; value: number }>([
      { $group: { _id: '$category', count: { $sum: 1 }, value: { $sum: '$purchasePrice' } } },
      { $sort: { count: -1 } },
    ]),
    Asset.aggregate<{ _id: null; total: number; value: number; avgHealth: number; avgUtilization: number }>([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          value: { $sum: '$purchasePrice' },
          avgHealth: { $avg: '$healthScore' },
          avgUtilization: { $avg: '$utilization' },
        },
      },
    ]),
  ]);

  const summary = totals[0] ?? { total: 0, value: 0, avgHealth: 0, avgUtilization: 0 };

  return {
    total: summary.total,
    portfolioValue: Math.round(summary.value),
    avgHealth: Math.round(summary.avgHealth ?? 0),
    avgUtilization: Math.round(summary.avgUtilization ?? 0),
    byStatus: byStatus.map((s) => ({ status: s._id, count: s.count })),
    byCategory: byCategory.map((c) => ({ category: c._id, count: c.count, value: Math.round(c.value) })),
  };
}

/**
 * Apply one change to a selection.
 *
 * Written as a loop over `updateAsset` rather than a single `updateMany`, on
 * purpose: that function writes the activity timeline, retires tracking on a
 * status change and marks the estate for re-derivation. A bulk write that
 * skipped all of it would leave a hundred assets with a new status, no audit
 * trail and stale scores.
 *
 * Failures are collected rather than thrown. Someone changing the custodian of
 * forty assets should not lose thirty-nine of them because one was deleted in
 * another tab — the response says which ones did not apply and why.
 */
export async function bulkUpdateAssets(
  ids: string[],
  patch: UpdateAssetInput,
  actor: string,
): Promise<{ updated: string[]; failed: { id: string; reason: string }[] }> {
  const updated: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      await updateAsset(id, patch, actor);
      updated.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof ApiError ? err.message : 'Update failed' });
    }
  }

  logger.info('Bulk asset update', { requested: ids.length, updated: updated.length, failed: failed.length });
  return { updated, failed };
}
