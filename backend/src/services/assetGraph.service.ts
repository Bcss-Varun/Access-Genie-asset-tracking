import type { AssetCategory, Criticality, LocationPrecision, TrackingTech } from '@access-genie/shared';
import {
  AssetPresence,
  CustodyRecord,
  Sensor,
  TrackedFacility,
  TrackedZone,
  TrackingDevice,
  Zone,
  nextId,
  type AssetDoc,
} from '../models/index.js';
import { logger } from '../config/logger.js';

/**
 * Projecting an asset into the asset graph.
 *
 * "One asset graph" is the product's central claim: the tracking dot, the
 * custody line and the registry row are the same object. That only holds if
 * creating an asset is more than one insert — the record has to *appear* as a
 * dot on the live map, as the opening entry in its chain of custody, and as a
 * device in the estate when it carries a tag.
 *
 * Doing that in one place is what stops a newly registered asset from being
 * invisible on three screens out of ten, which is exactly what it was before
 * this module existed.
 *
 * Every step here is best-effort and idempotent: a projection failure must never
 * fail the registration itself. An asset that exists but is missing from the map
 * is recoverable; a registration that half-committed is not.
 */

/** Deterministic 0–1 from a string, so an asset always lands on the same spot. */
function hashUnit(seed: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

interface Placement {
  facility: string;
  zone: string;
  position?: { x: number; y: number };
}

/**
 * Resolve an asset's location onto the tracking estate.
 *
 * An asset records where it is in business terms ("Bengaluru HQ ▸ Floor 3 ▸ IT
 * Storeroom"); the map needs a facility, a zone and a point. Matching is by
 * name, most specific first, because that is the only key the two models share.
 */
async function resolvePlacement(asset: AssetDoc): Promise<Placement | null> {
  const facilityName = asset.location?.name;
  if (!facilityName) return null;

  const facility = await TrackedFacility.findOne({ name: facilityName }).lean();
  if (!facility) {
    // The asset is somewhere the tracking estate does not cover. That is a real
    // state, not an error — it simply has no dot until the site is instrumented.
    return null;
  }

  const candidates = [asset.location.zone, asset.location.building].filter(Boolean) as string[];
  let zone = null;
  for (const name of candidates) {
    zone = await TrackedZone.findOne({ facility: facilityName, name }).lean();
    if (zone) break;
  }

  if (!zone) {
    return { facility: facilityName, zone: candidates[0] ?? facilityName };
  }

  // Inset from the zone's edges so the marker reads as inside it, not on the line.
  const pad = 3;
  return {
    facility: facilityName,
    zone: zone.name,
    position: {
      x: round1(zone.x + pad + hashUnit(asset._id, 1) * Math.max(1, zone.width - pad * 2)),
      y: round1(zone.y + pad + hashUnit(asset._id, 2) * Math.max(1, zone.height - pad * 2)),
    },
  };
}

/** How precisely a technology can place something. Drives the map's confidence ring. */
const PRECISION_BY_TECH: Record<TrackingTech, LocationPrecision> = {
  UWB: 'Precise',
  BLE: 'Room',
  RFID: 'Room',
  QR: 'Last scan',
  GPS: 'Site',
  LoRaWAN: 'Site',
};

const CONFIDENCE_BY_TECH: Record<TrackingTech, number> = {
  UWB: 97,
  BLE: 88,
  RFID: 85,
  QR: 70,
  GPS: 80,
  LoRaWAN: 74,
};

/**
 * Make (or refresh) the asset's presence row — the dot on the live map.
 *
 * An untagged asset still gets one: the registry knows where it is *supposed* to
 * be, and showing it at low precision is more useful than not showing it at all.
 * `precision: 'Last scan'` is the honest label for that.
 */
async function upsertPresence(asset: AssetDoc, placement: Placement): Promise<void> {
  const tech = asset.trackingTech;
  const tracked = Boolean(asset.trackingId && tech);

  await AssetPresence.updateOne(
    { _id: asset._id },
    {
      $set: {
        assetName: asset.name,
        category: asset.category as AssetCategory,
        facility: placement.facility,
        zone: placement.zone,
        criticality: (asset.criticality ?? 'Medium') as Criticality,
        valueInr: asset.purchasePrice ?? 0,
        custodian: asset.custodian,
        precision: tracked && tech ? PRECISION_BY_TECH[tech] : 'Last scan',
        confidence: tracked && tech ? CONFIDENCE_BY_TECH[tech] : 55,
        lastSeen: new Date(),
        ...(placement.position ? { position: placement.position } : {}),
        ...(asset.telemetry?.batteryLevel !== undefined ? { batteryPct: asset.telemetry.batteryLevel } : {}),
      },
      // Only on insert: a re-projection must not undo an operator's decision to
      // mark something missing, or reset its home zone after a transfer.
      $setOnInsert: {
        state: 'Online',
        custody: 'In Place',
        homeZone: placement.zone,
        movingNow: false,
        alertIds: [],
      },
    },
    { upsert: true },
  );
}

/**
 * Mirror the bound tag into the device estate.
 *
 * A tag that exists on the asset but not in the estate is a device nobody can
 * find, replace or report on — so binding one has to create the record too.
 */
async function upsertDevice(asset: AssetDoc, placement: Placement | null): Promise<void> {
  if (!asset.trackingId || !asset.trackingTech) return;

  const deviceId = `DEV-${asset._id.replace(/[^A-Za-z0-9]/g, '')}`;
  const now = new Date();

  await TrackingDevice.updateOne(
    { _id: deviceId },
    {
      $set: {
        name: `${asset.trackingTech} tag · ${asset.name}`,
        technology: asset.trackingTech,
        facility: placement?.facility ?? asset.location?.name ?? '',
        zone: placement?.zone ?? '',
        assetId: asset._id,
        assetName: asset.name,
        lastSeen: now,
      },
      $setOnInsert: {
        role: 'Tag',
        state: 'Healthy',
        firmware: '1.0.0',
        firmwareLatest: '1.0.0',
        uptimePct: 100,
        serves: 0,
        installedAt: now,
        diagnostics: [],
      },
    },
    { upsert: true },
  );

  // The operational device list (Tag & Device Registry) reads `Sensor`, so the
  // tag has to land there too or it is registered but not manageable.
  const existing = await Sensor.findOne({ tagId: asset.trackingId }).lean();
  if (!existing) {
    const kindByTech: Record<TrackingTech, string> = {
      RFID: 'RFID Tag',
      BLE: 'BLE Beacon',
      UWB: 'UWB Tag',
      GPS: 'GPS Tracker',
      QR: 'QR Label',
      LoRaWAN: 'LoRaWAN Sensor',
    };

    await Sensor.create({
      _id: await nextId('sensor', 'SEN'),
      name: `${asset.name} tag`,
      kind: kindByTech[asset.trackingTech],
      assetId: asset._id,
      assetName: asset.name,
      status: 'Online',
      signalStrength: 90,
      firmwareVersion: '1.0.0',
      // Unassigned until a survey places it under a specific reader.
      gatewayId: '',
      zone: placement?.zone,
      lastReading: now,
      tagId: asset.trackingId,
      facility: placement?.facility,
    });
  }
}

/** Open the chain of custody, or record a hand-over. */
async function recordCustody(
  asset: AssetDoc,
  actor: string,
  action: 'Assigned' | 'Transferred',
): Promise<void> {
  await CustodyRecord.create({
    _id: await nextId('custody', 'CU'),
    assetId: asset._id,
    assetName: asset.name,
    holder: asset.custodian,
    action,
    at: new Date(),
    by: actor,
  });
}

/**
 * Project a newly created asset across the graph.
 *
 * Called after the asset itself is committed. Returns the `mapPosition` to stamp
 * on the asset so it also appears on the live map, which filters on that field.
 */
export async function projectNewAsset(
  asset: AssetDoc,
  actor: string,
): Promise<{ mapPosition?: { x: number; y: number } }> {
  try {
    const placement = await resolvePlacement(asset);

    await Promise.all([
      placement ? upsertPresence(asset, placement) : Promise.resolve(),
      upsertDevice(asset, placement),
      recordCustody(asset, actor, 'Assigned'),
    ]);

    return { mapPosition: placement?.position ?? (await fallbackPosition(asset)) };
  } catch (err) {
    logger.error('Asset created but could not be fully projected into the graph', {
      assetId: asset._id,
      err: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

/**
 * A point on the live map's own zone set, for assets at a site the tracking
 * workspace does not model. Without one they would be absent from the live map
 * even though the registry knows exactly where they are.
 */
async function fallbackPosition(asset: AssetDoc): Promise<{ x: number; y: number } | undefined> {
  const zoneName = asset.location?.zone ?? asset.location?.building;
  const zone = zoneName ? await Zone.findOne({ name: zoneName }).lean() : null;
  if (!zone) return undefined;

  const pad = 3;
  return {
    x: round1(zone.x + pad + hashUnit(asset._id, 3) * Math.max(1, zone.width - pad * 2)),
    y: round1(zone.y + pad + hashUnit(asset._id, 4) * Math.max(1, zone.height - pad * 2)),
  };
}

/**
 * Re-project an asset after an edit.
 *
 * Only the changes that mean something downstream are acted on: a move updates
 * the dot, a new custodian opens a custody entry, a newly bound tag registers a
 * device. Everything else is just a field edit.
 */
export async function projectAssetUpdate(
  asset: AssetDoc,
  previous: Pick<AssetDoc, 'custodian' | 'trackingId' | 'location'>,
  actor: string,
): Promise<{ mapPosition?: { x: number; y: number } }> {
  try {
    const moved = previous.location?.zone !== asset.location?.zone || previous.location?.name !== asset.location?.name;
    const placement = await resolvePlacement(asset);

    await Promise.all([
      placement ? upsertPresence(asset, placement) : Promise.resolve(),
      asset.trackingId && asset.trackingId !== previous.trackingId
        ? upsertDevice(asset, placement)
        : Promise.resolve(),
      asset.custodian !== previous.custodian
        ? recordCustody(asset, actor, 'Transferred')
        : Promise.resolve(),
    ]);

    // The map position only needs recomputing when the asset actually moved.
    if (!moved) return {};
    return { mapPosition: placement?.position ?? (await fallbackPosition(asset)) };
  } catch (err) {
    logger.error('Asset updated but could not be fully re-projected', {
      assetId: asset._id,
      err: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

/**
 * Withdraw a retired asset from the graph.
 *
 * Presence and the device binding go — a retired asset must stop occupying a
 * dot on the map and stop being counted as live hardware. Custody and activity
 * stay: they are history, and history is not deleted here or anywhere.
 */
export async function retireAssetFromGraph(assetId: string): Promise<void> {
  try {
    await Promise.all([
      AssetPresence.deleteOne({ _id: assetId }),
      TrackingDevice.deleteMany({ assetId }),
      Sensor.updateMany({ assetId }, { $unset: { assetId: '', assetName: '' }, $set: { status: 'Offline' } }),
    ]);
  } catch (err) {
    logger.error('Asset deleted but could not be fully withdrawn from the graph', {
      assetId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
