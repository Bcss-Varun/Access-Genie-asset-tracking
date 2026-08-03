import type { AssetClass as AssetClassWire } from '@access-genie/shared';
import { Asset, AssetClass, type AssetClassDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import type { CreateAssetClassInput, UpdateAssetClassInput } from '../validators/assetClass.validator.js';

/**
 * Asset classes.
 *
 * The one thing this layer adds over a plain read is `assetCount`: it is
 * computed from the asset collection on every read rather than stored, because
 * a denormalised count is a number that is wrong from the first asset anyone
 * creates. One grouped aggregation covers the whole list, so the cost is a
 * single extra query regardless of how many classes exist.
 */

/** Live asset count per class, keyed by class name (which is the asset category). */
async function countsByClassName(): Promise<Map<string, number>> {
  const rows = await Asset.aggregate<{ _id: string; count: number }>([
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);

  return new Map(rows.map((r) => [r._id, r.count]));
}

function toWire(doc: AssetClassDoc, counts: Map<string, number>): AssetClassWire {
  const { _id, createdAt: _created, updatedAt: _updated, ...rest } = doc;
  return { ...rest, id: _id, assetCount: counts.get(doc.name) ?? 0 } as AssetClassWire;
}

export async function listAssetClasses(): Promise<AssetClassWire[]> {
  const [classes, counts] = await Promise.all([
    AssetClass.find().sort({ name: 1 }).lean<AssetClassDoc[]>(),
    countsByClassName(),
  ]);

  return classes.map((c) => toWire(c, counts));
}

export async function getAssetClass(id: string): Promise<AssetClassWire> {
  const [record, counts] = await Promise.all([
    AssetClass.findById(id).lean<AssetClassDoc>(),
    countsByClassName(),
  ]);

  if (!record) throw ApiError.notFound('Asset class');
  return toWire(record, counts);
}

/**
 * Mint an id from the class name — `Network Switch` → `CLS-NETWORKS`.
 *
 * Class ids are read by humans in URLs and configuration, so they are derived
 * from the name rather than being an opaque sequence. A collision falls back to
 * a numeric suffix, which keeps the derivation total.
 */
async function mintClassId(name: string): Promise<string> {
  const stem = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);

  const base = `CLS-${stem || 'CLASS'}`;
  if (!(await AssetClass.exists({ _id: base }))) return base;

  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`;
    if (!(await AssetClass.exists({ _id: candidate }))) return candidate;
  }

  throw ApiError.conflict('Too many classes share this name');
}

export async function createAssetClass(input: CreateAssetClassInput): Promise<AssetClassWire> {
  if (await AssetClass.exists({ name: input.name })) {
    throw ApiError.conflict(`An asset class called "${input.name}" already exists`);
  }

  const created = await AssetClass.create({ ...input, _id: await mintClassId(input.name) });
  return getAssetClass(created._id);
}

export async function updateAssetClass(id: string, patch: UpdateAssetClassInput): Promise<AssetClassWire> {
  if (patch.name && (await AssetClass.exists({ name: patch.name, _id: { $ne: id } }))) {
    throw ApiError.conflict(`An asset class called "${patch.name}" already exists`);
  }

  const updated = await AssetClass.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean();
  if (!updated) throw ApiError.notFound('Asset class');

  return getAssetClass(id);
}

export async function deleteAssetClass(id: string): Promise<void> {
  const record = await AssetClass.findById(id).lean<AssetClassDoc>();
  if (!record) throw ApiError.notFound('Asset class');

  // Deleting a class that assets still belong to would leave those assets
  // describing themselves against a template that no longer exists — and their
  // per-class attributes unreadable. Refuse, and say how many are in the way.
  const inUse = await Asset.countDocuments({ category: record.name });
  if (inUse > 0) {
    throw ApiError.conflict(
      `${inUse} asset${inUse === 1 ? '' : 's'} still belong to "${record.name}". Reassign them before deleting the class.`,
    );
  }

  await AssetClass.deleteOne({ _id: id });
}
