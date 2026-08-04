import { Alert, Asset, Geofence, TrackingEvent, nextId, type AssetDoc, type GeofenceDoc } from '../models/index.js';
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
  if (fences.length === 0) return [];

  const breaches = detect(fences, ctx);
  if (breaches.length === 0) return [];

  const asset = await Asset.findById(ctx.assetId).lean<AssetDoc>();
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
    raised.push(fence.name);
  }

  if (raised.length > 0) {
    logger.info('Geofence breach', { assetId: ctx.assetId, zone: ctx.zone, fences: raised });
  }
  return raised;
}
