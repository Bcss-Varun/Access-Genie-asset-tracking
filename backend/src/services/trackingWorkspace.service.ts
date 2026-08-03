import {
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
    TrackedFacility.find().sort({ name: 1 }).lean(),
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
    facilities: aliasId(facilities, 'slug'),
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
