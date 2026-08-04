import type { LocationPrecision, PresenceState } from '@access-genie/shared';
import {
  Asset,
  AssetJourney,
  AssetPresence,
  MovementTrail,
  ScopeNodeModel,
  Sensor,
  TrackingEvent,
  UnknownDetection,
  nextId,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { markEstateChanged } from './derivation.scheduler.js';
import { evaluateGeofences } from './geofence.service.js';
import type { ObservationInput } from '../validators/observation.validator.js';

/**
 * Observations — how reality gets into the system.
 *
 * This is the layer the platform was missing. Everything downstream of it —
 * presence, journeys, trails, utilization, "is it where it should be", the
 * whole tracking workspace — is *derived* from a stream of sightings, and until
 * there was a way to record a sighting, all of it could only ever show whatever
 * had been seeded. Assets were placed once at registration and never observed
 * again.
 *
 * One entry point covers every technology deliberately. An RFID portal read, a
 * BLE beacon fix, a UWB anchor solve, a GPS ping and someone scanning a QR
 * label with a phone are the same fact — *this asset was here at this time, to
 * this accuracy* — and they differ only in how much they can be trusted. Giving
 * each its own pipeline would mean five places to fix when the rules change,
 * and five subtly different answers to "when was it last seen".
 *
 * What differs per source is precision and confidence, and that is recorded
 * rather than smoothed away: a GPS fix outdoors and a QR scan at a desk are
 * both true, and a screen that treats them as equally precise is lying.
 */

/** How much each technology can actually tell you about where something is. */
const SOURCE_PROFILE: Record<ObservationInput['source'], { precision: LocationPrecision; confidence: number }> = {
  uwb: { precision: 'Precise', confidence: 96 },
  // A read means the tag passed this reader — room-level, not a coordinate.
  rfid: { precision: 'Room', confidence: 88 },
  ble: { precision: 'Room', confidence: 78 },
  // Accurate outdoors, and no better than "this site" once indoors.
  gps: { precision: 'Site', confidence: 70 },
  // A person physically had it in their hand. Highly trustworthy about
  // *presence*, and says nothing at all about where it went next.
  qr: { precision: 'Last scan', confidence: 92 },
  manual: { precision: 'Last scan', confidence: 60 },
};

/** How long a sighting stays fresh before presence decays. */
export const FRESH_MS = 15 * 60 * 1000;
export const STALE_MS = 4 * 60 * 60 * 1000;

/** Presence state derived from the age of the last sighting — never stored stale. */
export function presenceStateFor(lastSeen: Date, now = Date.now()): PresenceState {
  const age = now - lastSeen.getTime();
  if (age <= FRESH_MS) return 'Online';
  if (age <= STALE_MS) return 'Stale';
  return 'Offline';
}

/**
 * Resolve whatever the reader reported to an asset.
 *
 * Readers report the identifier printed on the tag, not our asset id, so the
 * lookup walks the ways a tag can be bound: the device registry, the asset's
 * own tracking id, and the bindings recorded during onboarding. A tag nobody
 * recognises is not an error — it is an unknown detection, which is a finding
 * in its own right (something is in the building that should not be).
 */
async function resolveAsset(input: ObservationInput) {
  if (input.assetId) {
    const asset = await Asset.findById(input.assetId).lean();
    if (!asset) throw ApiError.notFound('Asset');
    return { asset, tagId: input.tagId ?? asset.trackingId };
  }

  const tagId = input.tagId!;
  const sensor = await Sensor.findOne({ tagId }).lean();
  if (sensor?.assetId) {
    const asset = await Asset.findById(sensor.assetId).lean();
    if (asset) return { asset, tagId };
  }

  const direct = await Asset.findOne({
    $or: [{ trackingId: tagId }, { 'onboarding.bindings.tagId': tagId }],
  }).lean();
  if (direct) return { asset: direct, tagId };

  return { asset: null, tagId };
}

/** Record an unrecognised tag rather than discarding the sighting. */
async function recordUnknown(tagId: string, input: ObservationInput, at: Date): Promise<void> {
  const existing = await UnknownDetection.findOne({ tagId });
  if (existing) {
    existing.lastSeen = at;
    existing.seenCount = (existing.seenCount ?? 0) + 1;
    if (input.zone) existing.zone = input.zone;
    await existing.save();
    return;
  }

  await UnknownDetection.create({
    _id: await nextId('unknownDetection', 'UNK'),
    tagId,
    zone: input.zone ?? 'Unknown',
    facility: input.facility ?? 'Unknown',
    firstSeen: at,
    lastSeen: at,
    seenCount: 1,
    state: 'New',
    suggestion: '',
    suggestionConfidence: 0,
    reason: `Unrecognised ${input.source.toUpperCase()} tag — not bound to any asset`,
  });
}

export interface ObservationResult {
  accepted: boolean;
  assetId?: string;
  assetName?: string;
  zone?: string;
  state?: PresenceState;
  /** True when the asset was seen somewhere other than its assigned home. */
  misplaced?: boolean;
  /** Fences this sighting broke, if any — reported back to the reader. */
  geofencesBreached?: string[];
  reason?: string;
}

/**
 * Record one sighting and fan it out to everything derived from it.
 *
 * Deliberately idempotent-ish rather than strictly so: repeated reads of a
 * stationary tag are the normal case for RFID portals, so a repeat in the same
 * zone refreshes `lastSeen` without adding a journey stop or a trail point.
 * Recording every read would bury the movement that matters under thousands of
 * identical rows.
 */
export async function recordObservation(input: ObservationInput): Promise<ObservationResult> {
  const at = input.at ? new Date(input.at) : new Date();
  const { asset, tagId } = await resolveAsset(input);

  if (!asset) {
    await recordUnknown(tagId!, input, at);
    return { accepted: false, reason: `No asset is bound to tag ${tagId}`, zone: input.zone };
  }

  const profile = SOURCE_PROFILE[input.source];
  const zone = input.zone ?? asset.location?.zone ?? asset.location?.name ?? 'Unassigned';
  const facility = input.facility ?? asset.location?.name ?? 'Unassigned';

  const assetId = String(asset._id);
  const previous = await AssetPresence.findById(assetId).lean();
  const movedZone = previous?.zone !== zone;

  // Where it is *supposed* to be. Assigned location, not observed — the gap
  // between the two is exactly what makes an asset "misplaced".
  const homeZone = previous?.homeZone || asset.location?.zone || asset.location?.name || zone;

  await AssetPresence.updateOne(
    { _id: assetId },
    {
      $set: {
        assetName: asset.name,
        category: asset.category,
        state: 'Online',
        facility,
        zone,
        precision: profile.precision,
        confidence: input.confidence ?? profile.confidence,
        lastSeen: at,
        custodian: asset.custodian ?? 'Unassigned',
        movingNow: movedZone,
        ...(input.position ? { position: input.position } : {}),
      },
      $setOnInsert: { homeZone, custody: 'In Place' },
    },
    { upsert: true },
  );

  // Only a change of zone is movement worth remembering.
  if (movedZone) {
    await TrackingEvent.create({
      _id: await nextId('trackingEvent', 'EV'),
      at,
      kind: 'Movement',
      title: `${asset.name} seen in ${zone}`,
      detail: `${input.source.toUpperCase()} read${previous?.zone ? ` — moved from ${previous.zone}` : ''}`,
      zone,
      actor: input.actor ?? `${input.source} reader`,
      tone: zone === homeZone ? 'emerald' : 'amber',
      assetId,
      assetName: asset.name,
    });

    await AssetJourney.updateOne(
      { _id: assetId },
      {
        $set: { assetName: asset.name, windowTo: at },
        $setOnInsert: { windowFrom: at, distanceM: 0, gaps: 0 },
        $push: {
          stops: {
            $each: [{ at, zone, facility, dwellMin: 0, precision: profile.precision }],
            // A rolling window — a journey is for reading, not an archive.
            $slice: -50,
          },
        },
        $inc: { zonesVisited: 1 },
      },
      { upsert: true },
    );

    if (input.position) {
      await MovementTrail.updateOne(
        { _id: assetId },
        {
          $set: { assetName: asset.name },
          $push: {
            points: { $each: [{ ...input.position, timestamp: at, label: zone }], $slice: -100 },
          },
        },
        { upsert: true },
      );
    }
  }

  // Keep the device registry honest about when its hardware last spoke.
  if (tagId) {
    await Sensor.updateOne(
      { tagId },
      {
        $set: {
          lastReading: at,
          ...(input.rssi !== undefined ? { signalStrength: input.rssi } : {}),
          ...(input.gatewayId ? { gatewayId: input.gatewayId } : {}),
          ...(input.zone ? { zone: input.zone } : {}),
        },
      },
    );
  }

  // Fences are tested on the sighting itself: a restricted zone checked on a
  // timer is not a restricted zone.
  const breached = await evaluateGeofences({
    assetId,
    zone,
    zoneId: input.zone,
    previousZone: previous?.zone,
    position: input.position,
    at,
    source: input.source,
  });

  // A sighting changes utilization, and can change risk (misplaced, or seen
  // again after going quiet). Debounced — a gateway sweep is one pass, not one
  // per read.
  markEstateChanged('observation');

  return {
    accepted: true,
    assetId,
    assetName: asset.name,
    zone,
    state: 'Online',
    misplaced: zone !== homeZone,
    ...(breached.length > 0 ? { geofencesBreached: breached } : {}),
  };
}

/** Batch ingest — what a gateway actually posts, one payload per sweep. */
export async function recordObservations(inputs: ObservationInput[]): Promise<ObservationResult[]> {
  const results: ObservationResult[] = [];
  // Sequential on purpose: two reads of the same asset in one batch must apply
  // in order, or the older one can win the `lastSeen` race.
  for (const input of inputs) results.push(await recordObservation(input));
  return results;
}

/**
 * Zones that can be observed, derived from the location hierarchy.
 *
 * Same reasoning as facilities: a zone someone created under Org & Facilities
 * is a real place an asset can be, and the tracking workspace should not need
 * its own parallel list of them.
 */
export async function observableZones(): Promise<{ id: string; name: string; facility: string }[]> {
  const nodes = await ScopeNodeModel.find({ level: { $in: ['zone', 'building', 'floor'] } }).lean();
  const byId = new Map(nodes.map((n) => [n._id, n]));
  const facilities = await ScopeNodeModel.find({ level: 'facility' }).lean();
  const facilityById = new Map(facilities.map((f) => [f._id, f]));

  const facilityOf = (node: (typeof nodes)[number]): string => {
    let cursor: { parentId?: string } | undefined = node;
    for (let i = 0; i < 6 && cursor?.parentId; i++) {
      if (facilityById.has(cursor.parentId)) return facilityById.get(cursor.parentId)!.name;
      cursor = byId.get(cursor.parentId) ?? facilityById.get(cursor.parentId);
    }
    return 'Unassigned';
  };

  return nodes.map((n) => ({ id: n._id, name: n.name, facility: facilityOf(n) }));
}
