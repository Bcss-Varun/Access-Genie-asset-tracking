import {
  Alert,
  Asset,
  Geofence,
  OPEN_TRACKING_ALERT_STATES,
  ScopeNodeModel,
  TrackedFacility,
  TrackedZone,
  TrackingAlert,
  TrackingEvent,
  nextId,
  type AssetDoc,
  type GeofenceDoc,
} from '../models/index.js';
import type { AlertPriority } from '@access-genie/shared';
import { logger } from '../config/logger.js';

/**
 * Geofence evaluation.
 *
 * A geofence is a rule about where something may be, and until now it was only
 * a rectangle drawn on a plan: the shapes could be created and edited, and
 * nothing ever checked an asset against one. Breaches were seeded rows.
 *
 * Evaluated on the observation, not on a timer, for one reason: a restricted
 * zone that is checked every ten minutes is not a restricted zone. The sighting
 * *is* the event that can breach a rule, so that is when the rule is tested.
 *
 * The four rules answer different questions and are deliberately not collapsed:
 *
 *   Restricted  nothing may be here      → breach on any presence
 *   Entry       tell me when it arrives  → breach on entering
 *   Exit        tell me when it leaves   → breach on leaving
 *   Dwell       it may pass through but not settle → breach on staying
 *
 * A breach raises one alert and one event. It does not raise a second alert
 * while the first is unresolved — an asset parked in a restricted zone would
 * otherwise generate an alert per sighting until somebody moved it, which
 * floods the queue exactly when it most needs to be readable.
 */

/** Does this fence cover the zone the asset was seen in? */
function coversZone(fence: GeofenceDoc, zoneId?: string, zoneName?: string): boolean {
  if (!fence.zoneId) return false;
  return fence.zoneId === zoneId || fence.zoneId === zoneName;
}

/** Is a point inside the fence rectangle? Used when the fix carries coordinates. */
function containsPoint(fence: GeofenceDoc, position?: { x: number; y: number }): boolean {
  if (!position) return false;
  return (
    position.x >= fence.x &&
    position.x <= fence.x + fence.width &&
    position.y >= fence.y &&
    position.y <= fence.y + fence.height
  );
}

export interface BreachContext {
  assetId: string;
  zone: string;
  zoneId?: string;
  previousZone?: string;
  position?: { x: number; y: number };
  /** Facility name the sighting was made in, when the reader reported one. */
  facility?: string;
  at: Date;
  source: string;
}

interface Breach {
  fence: GeofenceDoc;
  reason: string;
}

/** Which fences this sighting violates, and why. */
function detect(fences: GeofenceDoc[], ctx: BreachContext): Breach[] {
  const out: Breach[] = [];

  for (const fence of fences) {
    if (!fence.active) continue;

    const inFenceNow = coversZone(fence, ctx.zoneId, ctx.zone) || containsPoint(fence, ctx.position);
    const wasInFence = ctx.previousZone
      ? coversZone(fence, undefined, ctx.previousZone)
      : false;

    switch (fence.rule) {
      case 'Restricted':
        if (inFenceNow) out.push({ fence, reason: `entered restricted area ${fence.name}` });
        break;
      case 'Entry':
        if (inFenceNow && !wasInFence) out.push({ fence, reason: `entered ${fence.name}` });
        break;
      case 'Exit':
        if (!inFenceNow && wasInFence) out.push({ fence, reason: `left ${fence.name}` });
        break;
      case 'Dwell':
        // Presence on two consecutive sightings in the same fence is the
        // cheapest honest proxy for dwelling, without keeping a timer per asset.
        if (inFenceNow && wasInFence) out.push({ fence, reason: `still inside ${fence.name}` });
        break;
    }
  }

  return out;
}

/**
 * Test one sighting against every active fence and raise what it breaches.
 *
 * Returns the fence names breached so the caller — the observation intake — can
 * report them back to whatever reported the sighting.
 */
export async function evaluateGeofences(ctx: BreachContext): Promise<string[]> {
  const fences = await Geofence.find({ active: true }).lean<GeofenceDoc[]>();
  const breaches = detect(fences, ctx);
  const asset = await Asset.findById(ctx.assetId).lean<AssetDoc>();

  if (breaches.length === 0) return evaluateArmedZones(asset, ctx);

  const assetName = asset?.name ?? ctx.assetId;
  const raised: string[] = [];

  for (const { fence, reason } of breaches) {
    const openAlert = await Alert.findOne({
      assetId: ctx.assetId,
      type: 'Geofence',
      status: { $ne: 'Resolved' },
      title: new RegExp(fence.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    })
      .select('_id')
      .lean();

    // Already flagged and not yet dealt with — refresh the count, stay quiet.
    if (openAlert) {
      await Geofence.updateOne({ _id: fence._id }, { $inc: { breaches24h: 1 } });
      continue;
    }

    await Alert.create({
      _id: await nextId('alert', 'ALT'),
      title: `${assetName} ${reason}`,
      severity: fence.rule === 'Restricted' ? 'Critical' : 'Warning',
      type: 'Geofence',
      assetId: ctx.assetId,
      assetName,
      status: 'Open',
      source: `${ctx.source} observation`,
      createdAt: ctx.at,
    });

    await TrackingEvent.create({
      _id: await nextId('trackingEvent', 'EV'),
      at: ctx.at,
      kind: 'Alert',
      title: `Geofence breach — ${fence.name}`,
      detail: `${assetName} ${reason}`,
      zone: ctx.zone,
      actor: `${ctx.source} reader`,
      tone: fence.rule === 'Restricted' ? 'red' : 'amber',
      assetId: ctx.assetId,
      assetName,
    });

    await Geofence.updateOne({ _id: fence._id }, { $inc: { breaches24h: 1 } });
    // The Tracking Alerts console works its own queue; a breach that only
    // reached the general alert centre never showed up there at all.
    await raiseTrackingAlert(asset, ctx, {
      title: `Geofence breach — ${fence.name}`,
      summary: `${assetName} ${reason}`,
      priority: fence.rule === 'Restricted' ? 'P1' : 'P2',
      source: `Geofence ${fence.name}`,
    });
    raised.push(fence.name);
  }

  raised.push(...(await evaluateArmedZones(asset, ctx)));

  if (raised.length > 0) {
    logger.info('Geofence breach', { assetId: ctx.assetId, zone: ctx.zone, fences: raised });
  }
  return raised;
}

/** Response window per priority — when an unacknowledged alert counts as breached. */
const SLA_HOURS: Record<AlertPriority, number> = { P1: 1, P2: 4, P3: 24, P4: 72 };

/**
 * Open a tracking alert for a breach, unless one is already open for this
 * asset and place — a tag sitting in a restricted room is one problem, not one
 * alert per read.
 */
async function raiseTrackingAlert(
  asset: AssetDoc | null,
  ctx: BreachContext,
  alert: { title: string; summary: string; priority: AlertPriority; source: string },
): Promise<void> {
  const facility = ctx.facility ?? asset?.location?.name ?? 'Unassigned';
  const open = await TrackingAlert.exists({
    assetId: ctx.assetId,
    location: ctx.zone,
    category: 'Unauthorized Movement',
    state: { $in: OPEN_TRACKING_ALERT_STATES },
  });
  if (open) return;

  await TrackingAlert.create({
    _id: await nextId('trackingAlert', 'TRK-ALT'),
    category: 'Unauthorized Movement',
    priority: alert.priority,
    state: 'New',
    title: alert.title,
    summary: alert.summary,
    assetId: ctx.assetId,
    assetName: asset?.name ?? ctx.assetId,
    facility,
    location: ctx.zone,
    raisedAt: ctx.at,
    slaDueAt: new Date(ctx.at.getTime() + SLA_HOURS[alert.priority] * 3_600_000),
    source: alert.source,
    valueAtRiskInr: asset?.bookValue ?? asset?.purchasePrice ?? 0,
    timeline: [{ at: ctx.at, actor: `${ctx.source} reader`, action: 'Raised', note: alert.summary }],
  });
}

/**
 * Zones armed on the Geofences screen.
 *
 * That screen arms *tracked zones* and sets their policy, but breach detection
 * only ever read the separate geofence rectangles — so arming a zone changed
 * nothing, and its "Violations 24h" never moved. A policy is now enforced on
 * the sighting the same way a fence rule is. Dwell limits need a timer per asset
 * and are not evaluated here.
 */
async function evaluateArmedZones(asset: AssetDoc | null, ctx: BreachContext): Promise<string[]> {
  const zones = await TrackedZone.find({
    armed: true,
    policy: { $in: ['Authorised only', 'After-hours watch', 'No exit without check-out'] },
    $or: [{ name: { $in: [ctx.zone, ctx.previousZone].filter(Boolean) } }, ...(ctx.zoneId ? [{ _id: ctx.zoneId }] : [])],
  }).lean();
  if (zones.length === 0) return [];

  // Zones belong to a facility by slug; the sighting names its facility. Two
  // sites can both have a "Server Room", and only the one the asset is in counts.
  // A facility's slug is its stored tracking record's id when it has one, and
  // otherwise its scope node's id lower-cased (see trackingWorkspace.service).
  const slugs = new Set<string>();
  if (ctx.facility) {
    const [stored, nodes] = await Promise.all([
      TrackedFacility.find({ name: ctx.facility }).select('_id').lean(),
      ScopeNodeModel.find({ level: 'facility', name: ctx.facility }).select('_id').lean(),
    ]);
    for (const f of stored) slugs.add(String(f._id));
    for (const n of nodes) slugs.add(String(n._id).toLowerCase());
  }
  const inFacility = (slug: string) => !ctx.facility || slugs.has(slug);

  const raised: string[] = [];
  for (const zone of zones) {
    if (!inFacility(zone.facility)) continue;
    const inNow = zone._id === ctx.zoneId || zone.name === ctx.zone;
    const wasIn = ctx.previousZone === zone.name;

    let reason: string | null = null;
    if (zone.policy === 'No exit without check-out') {
      if (wasIn && !inNow) reason = `left ${zone.name} without a check-out`;
    } else if (inNow && !wasIn) {
      reason = zone.policy === 'Authorised only'
        ? `entered ${zone.name}, which is authorised-only`
        : `entered ${zone.name} while it is under watch`;
    }
    if (!reason) continue;

    const assetName = asset?.name ?? ctx.assetId;
    await TrackedZone.updateOne({ _id: zone._id }, { $inc: { violations24h: 1 } });
    await raiseTrackingAlert(asset, ctx, {
      title: `Zone policy breach — ${zone.name}`,
      summary: `${assetName} ${reason}`,
      priority: zone.policy === 'Authorised only' ? 'P1' : 'P2',
      source: `Zone ${zone.name} (${zone.policy})`,
    });
    await TrackingEvent.create({
      _id: await nextId('trackingEvent', 'EV'),
      at: ctx.at,
      kind: 'Alert',
      title: `Zone policy breach — ${zone.name}`,
      detail: `${assetName} ${reason}`,
      zone: ctx.zone,
      actor: `${ctx.source} reader`,
      tone: zone.policy === 'Authorised only' ? 'red' : 'amber',
      assetId: ctx.assetId,
      assetName,
    });
    raised.push(zone.name);
  }
  return raised;
}
