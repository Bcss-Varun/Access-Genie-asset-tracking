import { assertAssetVisible, type VisibleScope } from './tenancy.service.js';
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
    if (input.tagId && input.tagId !== asset.trackingId) {
      const binding = await Sensor.exists({ tagId: input.tagId, assetId: asset._id });
      if (!binding) throw ApiError.badRequest('The tag is not bound to this asset.');
    }
    return { asset, tagId: input.tagId ?? asset.trackingId };
  }

  const tagId = input.tagId!;
  const sensor = await Sensor.findOne({ tagId }).lean();
  if (sensor?.assetId) {
    const asset = await Asset.findById(sensor.assetId).lean();
    if (asset) return { asset, tagId };
  }

  const direct = await Asset.findOne({
    trackingId: tagId,
  }).lean();
  if (direct) return { asset: direct, tagId };

  return { asset: null, tagId };
}

/** Record an unrecognised tag rather than discarding the sighting. */
async function recordUnknown(tagId: string, input: ObservationInput, at: Date): Promise<void> {
  const existing = await UnknownDetection.findOne({ tagId, facility: input.facility ?? 'Unknown' });
  if (existing) {
    if (existing.lastSeen >= at) return;
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
const observationsInFlight = new Map<string, Promise<unknown>>();
export async function recordObservation(input: ObservationInput, scope?: VisibleScope): Promise<ObservationResult> {
  if (input.at && new Date(input.at).getTime() > Date.now() + 5 * 60_000) throw ApiError.badRequest('Observation time is more than five minutes in the future.');
  const resolved = await resolveAsset(input);
  if (scope) await authorizeObservation(scope, input);
  const key = resolved.asset?._id ?? `${input.facility}:${resolved.tagId}`;
  const prior = observationsInFlight.get(key) ?? Promise.resolve();
  const next = prior.catch(() => undefined).then(() => applyObservation(input));
  observationsInFlight.set(key, next);
  try { return await next; }
  finally { if (observationsInFlight.get(key) === next) observationsInFlight.delete(key); }
}

export async function authorizeObservation(scope: VisibleScope, input: ObservationInput): Promise<void> {
  const { asset } = await resolveAsset(input);
  if (asset) await assertAssetVisible(scope, asset._id);
  if (!scope.coversAll && (input.facility || !asset)) {
    const candidates = scope.rows.filter(node => node.level === 'facility' && node.name === input.facility);
    if (candidates.length !== 1 || !scope.ids.has(candidates[0]!._id)) throw ApiError.notFound('Facility');
  }
}

async function applyObservation(input: ObservationInput): Promise<ObservationResult> {
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
  if (previous && previous.lastSeen >= at) return {
    accepted: true, assetId, assetName: asset.name, zone: previous.zone,
    state: presenceStateFor(previous.lastSeen), reason: 'Ignored an observation older than or equal to the latest sighting',
  };
  const movedZone = previous?.zone !== zone;

  // Where it is *supposed* to be. Assigned location, not observed — the gap
  // between the two is exactly what makes an asset "misplaced".
  const homeZone = previous?.homeZone || asset.location?.zone || asset.location?.name || zone;

  try { await AssetPresence.updateOne(
    { _id: assetId, $or: [{ lastSeen: { $lt: at } }, { lastSeen: { $exists: false } }] },
    {
      $set: {
        assetName: asset.name,
        category: asset.category,
        state: presenceStateFor(at),
        facility,
        zone,
        precision: profile.precision,
        confidence: input.confidence ?? profile.confidence,
        lastSeen: at,
        custodian: asset.custodian ?? 'Unassigned',
        movingNow: movedZone,
        ...(input.position ? { position: input.position } : {}),
      },
      ...(!input.position ? { $unset: { position: '' } } : {}),
      $setOnInsert: { homeZone, custody: 'In Place' },
    },
    { upsert: true },
  );

  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
    const latest = await AssetPresence.findById(assetId).lean();
    if (!latest) throw error;
    return { accepted: true, assetId, assetName: asset.name, zone: latest.zone, state: presenceStateFor(latest.lastSeen), reason: 'A newer observation already exists' };
  }

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
        $set: { assetName: asset.name },
        $max: { windowTo: at },
        $setOnInsert: { windowFrom: at, distanceM: 0, gaps: 0 },
        $push: {
          stops: {
            $each: [{ at, zone, facility, dwellMin: 0, precision: profile.precision }],
            // A rolling window — a journey is for reading, not an archive.
            $sort: { at: 1 },
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
            points: { $each: [{ ...input.position, timestamp: at, label: zone }], $sort: { timestamp: 1 }, $slice: -100 },
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
    state: presenceStateFor(at),
    misplaced: zone !== homeZone,
    ...(breached.length > 0 ? { geofencesBreached: breached } : {}),
  };
}

/** Batch ingest — what a gateway actually posts, one payload per sweep. */
export async function recordObservations(inputs: ObservationInput[], scope?: VisibleScope): Promise<ObservationResult[]> {
  if (scope) for (const input of inputs) await authorizeObservation(scope, input);
  const results: ObservationResult[] = [];
  // Sequential on purpose: two reads of the same asset in one batch must apply
  // in order, or the older one can win the `lastSeen` race.
  for (const input of inputs) results.push(await recordObservation(input, scope));
  return results;
}

/**
 * Zones that can be observed, derived from the location hierarchy.
 *
 * Same reasoning as facilities: a zone someone created under Org & Facilities
 * is a real place an asset can be, and the tracking workspace should not need
 * its own parallel list of them.
 */
export async function observableZones(scope: VisibleScope): Promise<{ id: string; name: string; facility: string }[]> {
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

  return nodes.filter(n => scope.coversAll || scope.ids.has(n._id)).map((n) => ({ id: n._id, name: n.name, facility: facilityOf(n) }));
}
