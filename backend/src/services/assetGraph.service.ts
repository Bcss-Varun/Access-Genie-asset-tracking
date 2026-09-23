import { AssetPresence, CustodyRecord, Sensor, TrackingDevice, nextId, type AssetDoc } from '../models/index.js';
import { logger } from '../config/logger.js';

/** Registry edits update descriptive fields, never evidence of a physical sighting. */
async function projectMetadata(asset: AssetDoc): Promise<void> {
  await AssetPresence.updateOne({ _id: asset._id }, { $set: {
    assetName: asset.name, category: asset.category, criticality: asset.criticality ?? 'Medium',
    valueInr: asset.purchasePrice ?? 0, custodian: asset.custodian,
    homeZone: asset.location?.zone ?? asset.location?.name ?? 'Unassigned',
  } });
  // Hardware must be provisioned separately. Binding cannot invent firmware,
  // gateway assignments, a healthy device, or a successful radio reading.
  await Sensor.updateMany({ assetId: asset._id, tagId: { $ne: asset.trackingId ?? '' } },
    { $unset: { assetId: '', assetName: '' } });
  if (asset.trackingId && asset.trackingTech !== 'QR') {
    await Sensor.updateOne({ tagId: asset.trackingId }, { $set: { assetId: asset._id, assetName: asset.name } });
  }
  await TrackingDevice.updateMany({ assetId: asset._id }, { $set: { assetName: asset.name } });
}

async function recordCustody(asset: AssetDoc, actor: string, action: 'Assigned' | 'Transferred'): Promise<void> {
  await CustodyRecord.create({ _id: await nextId('custody', 'CU'), assetId: asset._id,
    assetName: asset.name, holder: asset.custodian, action, at: new Date(), by: actor });
}

/** No map position or presence exists until an observation supplies evidence. */
export async function projectNewAsset(asset: AssetDoc, actor: string): Promise<{ mapPosition?: { x: number; y: number } }> {
  try { await projectMetadata(asset); await recordCustody(asset, actor, 'Assigned'); }
  catch (err) { logger.error('Asset created but graph metadata could not be projected', { assetId: asset._id, err }); }
  return {};
}

export async function projectAssetUpdate(
  asset: AssetDoc, previous: Pick<AssetDoc, 'custodian' | 'trackingId' | 'location'>, actor: string,
): Promise<{ mapPosition?: { x: number; y: number } }> {
  try {
    await projectMetadata(asset);
    if (asset.custodian !== previous.custodian) await recordCustody(asset, actor, 'Transferred');
  } catch (err) { logger.error('Asset updated but graph metadata could not be projected', { assetId: asset._id, err }); }
  return {};
}

/** Withdraw current presence and binding while preserving custody history. */
export async function retireAssetFromGraph(assetId: string): Promise<void> {
  try {
    await Promise.all([
      AssetPresence.deleteOne({ _id: assetId }), TrackingDevice.deleteMany({ assetId }),
      Sensor.updateMany({ assetId }, { $unset: { assetId: '', assetName: '' }, $set: { status: 'Offline' } }),
    ]);
  } catch (err) { logger.error('Asset could not be fully withdrawn from the graph', { assetId, err }); }
}
