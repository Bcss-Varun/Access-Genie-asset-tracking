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

/** Nobody holds an asset whose custodian is blank or explicitly Unassigned. */
const isHeld = (custodian: string | undefined): boolean => Boolean(custodian?.trim()) && custodian !== 'Unassigned';

async function recordCustody(
  asset: AssetDoc, actor: string, action: 'Assigned' | 'Transferred' | 'Checked In', holder = asset.custodian,
): Promise<void> {
  // Same counter *and* prefix as custody.service's check-in/out rows. The two
  // writers used to share the counter but not the prefix, so one asset's chain
  // read CU-4, CUS-5, CU-6 — two numbering schemes for one log.
  await CustodyRecord.create({ _id: await nextId('custody', 'CUS'), assetId: asset._id,
    assetName: asset.name, holder, action, at: new Date(), by: actor });
}

/** No map position or presence exists until an observation supplies evidence. */
export async function projectNewAsset(asset: AssetDoc, actor: string): Promise<{ mapPosition?: { x: number; y: number } }> {
  try {
    await projectMetadata(asset);
    // A custody row is evidence that somebody signed for the asset. Writing one
    // for an asset nobody holds put "Assigned → Unassigned" at the top of the
    // custody log for every registration, which reads as a hand-over that
    // never happened.
    if (isHeld(asset.custodian)) await recordCustody(asset, actor, 'Assigned');
  }
  catch (err) { logger.error('Asset created but graph metadata could not be projected', { assetId: asset._id, err }); }
  return {};
}

export async function projectAssetUpdate(
  asset: AssetDoc, previous: Pick<AssetDoc, 'custodian' | 'trackingId' | 'location'>, actor: string,
): Promise<{ mapPosition?: { x: number; y: number } }> {
  try {
    await projectMetadata(asset);
    if (asset.custodian !== previous.custodian) {
      // Clearing the custodian is a return to the pool, recorded the way the
      // check-in screen records it — against the person who handed it back —
      // rather than as a "transfer" to a holder called Unassigned.
      if (isHeld(asset.custodian)) await recordCustody(asset, actor, 'Transferred');
      else if (isHeld(previous.custodian)) await recordCustody(asset, actor, 'Checked In', previous.custodian);
    }
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
