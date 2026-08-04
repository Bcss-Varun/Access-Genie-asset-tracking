import {
  Asset,
  AssetJourney,
  AssetPresence,
  AuditSession,
  AutomationRule,
  CoverageCell,
  FirmwareCampaign,
  Incident,
  InventoryException,
  InventoryRoom,
  MovementTxn,
  Rack,
  ScopeNodeModel,
  TrackedFacility,
  TrackedZone,
  TrackingAlert,
  TrackingDevice,
  TrackingEvent,
  UnknownDetection,
  OPEN_TRACKING_ALERT_STATES,
} from '../models/index.js';
import { aliasId } from '../utils/response.js';

/**
 * The tracking workspace, as one payload.
 *
 * Six screens read this data — live tracking, inventory, journey, geofences,
 * alerts, infrastructure — and each one needs several of the slices at once
 * (the live map alone wants facilities, zones, presence, alerts and KPIs). Seventeen
 * separate requests per screen would mean seventeen loading states and a
 * waterfall; the whole estate is a few hundred rows, so it is cheaper in every
 * dimension to send it in one response and let the client derive its views.
 *
 * When the estate outgrows that — the point being roughly when a single
 * facility stops fitting comfortably in a response — this becomes
 * `?facility=` scoped, and the client already filters by facility everywhere,
 * so nothing above it has to change.
 */
export interface TrackingWorkspacePayload {
  facilities: unknown[];
  zones: unknown[];
  presence: unknown[];
  journeys: unknown[];
  rooms: unknown[];
  racks: unknown[];
  audits: unknown[];
  movements: unknown[];
  unknownDetections: unknown[];
  exceptions: unknown[];
  alerts: unknown[];
  incidents: unknown[];
  automationRules: unknown[];
  devices: unknown[];
  coverage: unknown[];
  firmwareCampaigns: unknown[];
  events: unknown[];
  /** Server clock, so "3 min ago" on the client is relative to the data, not the browser. */
  observedAt: string;
}

/**
 * The facilities the tracking workspace draws on.
 *
 * Derived from the scope hierarchy — the same facilities administered under
 * Org & Facilities — rather than from a list of its own. There used to be two
 * unconnected notions of "facility": the `ScopeNode` an asset's location points
 * at, and this workspace's `TrackedFacility`. Adding a site in Administration
 * therefore did nothing here, and the whole tracking area stayed empty with no
 * indication that a second, invisible list was the thing it was waiting for.
 *
 * A stored `TrackedFacility` still contributes the parts that are genuinely
 * about tracking rather than about location — the floor-plan flag, radio
 * coverage, the short label the map chips use — matched by name. Any stored
 * record with no matching scope node is kept as well, so a database seeded with
 * the demo estate reads exactly as before.
 */
async function facilitiesForWorkspace(): Promise<Record<string, unknown>[]> {
  const [scopeFacilities, stored, assetCounts] = await Promise.all([
    ScopeNodeModel.find({ level: 'facility' }).sort({ name: 1 }).lean(),
    TrackedFacility.find().sort({ name: 1 }).lean(),
    // `location.name` carries the facility name (see the registration flow), so
    // this is the live count of assets sitting anywhere in each site.
    Asset.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$location.name', count: { $sum: 1 } } },
    ]),
  ]);

  const counts = new Map(assetCounts.map((r) => [r._id, r.count]));
  const storedByName = new Map(stored.map((f) => [f.name, f]));

  const derived = scopeFacilities.map((node) => {
    const extra = storedByName.get(node.name);
    return {
      // The scope id is the slug: it is stable across a rename, and it appears
      // in the digital-twin URL where a name-derived slug would silently break
      // every saved link the first time someone corrects a typo.
      slug: extra?._id ?? node._id.toLowerCase(),
      name: node.name,
      short: extra?.short ?? node.name.split(/\s+/)[0] ?? node.name,
      building: extra?.building ?? '',
      emoji: extra?.emoji ?? '🏭',
      assetsTracked: counts.get(node.name) ?? 0,
      coverage: extra?.coverage ?? 0,
      twinReady: extra?.twinReady ?? false,
    };
  });

  const claimed = new Set(scopeFacilities.map((n) => n.name));
  const orphans = stored
    .filter((f) => !claimed.has(f.name))
    .map((f) => ({ ...f, slug: f._id, assetsTracked: counts.get(f.name) ?? f.assetsTracked }));

  return [...derived, ...orphans].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function getTrackingWorkspace(): Promise<TrackingWorkspacePayload> {
  const [
    facilities,
    zones,
    presence,
    journeys,
    rooms,
    racks,
    audits,
    movements,
    unknownDetections,
    exceptions,
    alerts,
    incidents,
    automationRules,
    devices,
    coverage,
    firmwareCampaigns,
    events,
  ] = await Promise.all([
    facilitiesForWorkspace(),
    TrackedZone.find().sort({ facility: 1, name: 1 }).lean(),
    AssetPresence.find().sort({ assetName: 1 }).lean(),
    AssetJourney.find().lean(),
    InventoryRoom.find().sort({ facility: 1, name: 1 }).lean(),
    Rack.find().sort({ name: 1 }).lean(),
    AuditSession.find().sort({ dueAt: 1 }).lean(),
    MovementTxn.find().sort({ at: -1 }).lean(),
    UnknownDetection.find().sort({ lastSeen: -1 }).lean(),
    InventoryException.find().sort({ detectedAt: -1 }).lean(),
    TrackingAlert.find().sort({ raisedAt: -1 }).lean(),
    Incident.find().sort({ openedAt: -1 }).lean(),
    AutomationRule.find().sort({ name: 1 }).lean(),
    TrackingDevice.find().sort({ facility: 1, name: 1 }).lean(),
    CoverageCell.find().lean(),
    FirmwareCampaign.find().sort({ name: 1 }).lean(),
    // The activity feed is the one unbounded collection here, so it is the one
    // that gets a ceiling.
    TrackingEvent.find().sort({ at: -1 }).limit(200).lean(),
  ]);

  return {
    // These four are keyed by a business identifier the contract also names —
    // see aliasId() for why a virtual cannot do this.
    facilities,
    zones,
    presence: aliasId(presence, 'assetId'),
    journeys: aliasId(journeys, 'assetId'),
    rooms,
    racks,
    audits,
    movements,
    unknownDetections,
    exceptions,
    alerts,
    incidents,
    automationRules,
    devices,
    coverage: aliasId(coverage, 'zoneId'),
    firmwareCampaigns,
    events,
    observedAt: new Date().toISOString(),
  };
}

/** Open tracking alerts — the number badged on the sidebar's tracking row. */
export async function countOpenTrackingAlerts(): Promise<number> {
  return TrackingAlert.countDocuments({ state: { $in: OPEN_TRACKING_ALERT_STATES } });
}
