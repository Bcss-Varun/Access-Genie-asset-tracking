// ─────────────────────────────────────────────────────────────────────────────
// The tracking workspace's data, and the views derived from it.
//
// Same arrangement as lib/dataset.ts: the collections are module bindings filled
// by `hydrateTracking()` when `GET /api/v1/tracking/workspace` resolves, and the
// derivations below are pure functions over them. The six workspace screens read
// these directly.
//
// The derivations live here rather than on the server because they are *views*,
// not data: "the action queue", "this facility's KPIs", "which devices hang off
// this gateway" are questions the UI asks about a set it already holds. Pushing
// them server-side would mean a round trip every time a facility filter moved.
//
// As in the dataset module: never derive from these at module scope in a screen.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AlertLifecycle,
  AlertPriority,
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
} from '@access-genie/shared';
import { nowMs } from './utils';

/** The wire shape of `GET /tracking/workspace`. */
export interface TrackingWorkspace {
  facilities: TrackedFacility[];
  zones: TrackedZone[];
  presence: AssetPresence[];
  journeys: AssetJourney[];
  rooms: InventoryRoom[];
  racks: Rack[];
  audits: AuditSession[];
  movements: MovementTxn[];
  unknownDetections: UnknownDetection[];
  exceptions: InventoryException[];
  alerts: TrackingAlert[];
  incidents: Incident[];
  automationRules: AutomationRule[];
  devices: TrackingDevice[];
  coverage: CoverageCell[];
  firmwareCampaigns: FirmwareCampaign[];
  events: TrackingEvent[];
  observedAt: string;
}

// ── Collections ──────────────────────────────────────────────────────────────
export let TRACKED_FACILITIES: TrackedFacility[] = [];
export let trackedZones: TrackedZone[] = [];
export let assetPresence: AssetPresence[] = [];
export let journeys: AssetJourney[] = [];
export let inventoryRooms: InventoryRoom[] = [];
export let racks: Rack[] = [];
export let auditSessions: AuditSession[] = [];
export let movementTxns: MovementTxn[] = [];
export let unknownDetections: UnknownDetection[] = [];
export let inventoryExceptions: InventoryException[] = [];
export let trackingAlerts: TrackingAlert[] = [];
export let incidents: Incident[] = [];
export let automationRules: AutomationRule[] = [];
export let trackingDevices: TrackingDevice[] = [];
export let coverageCells: CoverageCell[] = [];
export let firmwareCampaigns: FirmwareCampaign[] = [];
export let trackingEvents: TrackingEvent[] = [];

/** When the server assembled this snapshot. */
export let observedAt: string = new Date().toISOString();

/** Replace the workspace. Called once per fetch, from the query function. */
export function hydrateTracking(next: TrackingWorkspace): void {
  TRACKED_FACILITIES = next.facilities ?? [];
  trackedZones = next.zones ?? [];
  assetPresence = next.presence ?? [];
  journeys = next.journeys ?? [];
  inventoryRooms = next.rooms ?? [];
  racks = next.racks ?? [];
  auditSessions = next.audits ?? [];
  movementTxns = next.movements ?? [];
  unknownDetections = next.unknownDetections ?? [];
  inventoryExceptions = next.exceptions ?? [];
  trackingAlerts = next.alerts ?? [];
  incidents = next.incidents ?? [];
  automationRules = next.automationRules ?? [];
  trackingDevices = next.devices ?? [];
  coverageCells = next.coverage ?? [];
  firmwareCampaigns = next.firmwareCampaigns ?? [];
  trackingEvents = next.events ?? [];
  observedAt = next.observedAt ?? new Date().toISOString();
}

/**
 * The clock the workspace measures against.
 *
 * A function, not a constant: a wall-board left open overnight must keep ageing
 * its rows rather than freezing at the moment the bundle loaded.
 */
export const TRACKING_NOW = (): number => nowMs();

// ── Facilities & zones ───────────────────────────────────────────────────────
export const facilityBySlug = (slug: string): TrackedFacility | undefined =>
  TRACKED_FACILITIES.find((f) => f.slug === slug);

export const facilityByName = (name: string): TrackedFacility | undefined =>
  TRACKED_FACILITIES.find((f) => f.name === name);

export const zonesForFacility = (facility: string): TrackedZone[] =>
  trackedZones.filter((z) => z.facility === facility);

export const zoneById = (id: string): TrackedZone | undefined => trackedZones.find((z) => z.id === id);

export const zoneByName = (facility: string, name: string): TrackedZone | undefined =>
  trackedZones.find((z) => z.facility === facility && z.name === name);

// ── Presence & journeys ──────────────────────────────────────────────────────
export const presenceById = (assetId: string): AssetPresence | undefined =>
  assetPresence.find((p) => p.assetId === assetId);

export function presenceForFacility(slug: string): AssetPresence[] {
  if (slug === 'all') return assetPresence;
  const f = facilityBySlug(slug);
  return f ? assetPresence.filter((p) => p.facility === f.name) : [];
}

export const journeyForAsset = (assetId: string): AssetJourney | undefined =>
  journeys.find((j) => j.assetId === assetId);

// ── Inventory control ────────────────────────────────────────────────────────
export const roomById = (id: string) => inventoryRooms.find((r) => r.id === id);

export const roomsForFacility = (slug: string): InventoryRoom[] => {
  if (slug === 'all') return inventoryRooms;
  const f = facilityBySlug(slug);
  return f ? inventoryRooms.filter((r) => r.facility === f.name) : [];
};

export const racksForRoom = (roomId: string): Rack[] => racks.filter((k) => k.roomId === roomId);
export const rackById = (id: string) => racks.find((k) => k.id === id);

export const auditsForFacility = (slug: string): AuditSession[] => {
  if (slug === 'all') return auditSessions;
  const f = facilityBySlug(slug);
  return f ? auditSessions.filter((a) => a.facility === f.name) : [];
};

// ── Alerts & incidents ───────────────────────────────────────────────────────
export const alertById = (id: string) => trackingAlerts.find((a) => a.id === id);

/** The states in which an alert is still someone's problem. */
export const OPEN_ALERT_STATES: AlertLifecycle[] = [
  'New',
  'Acknowledged',
  'Assigned',
  'In Progress',
  'Escalated',
];

export const isOpenAlert = (a: TrackingAlert) => OPEN_ALERT_STATES.includes(a.state);

export function alertsForFacility(slug: string): TrackingAlert[] {
  if (slug === 'all') return trackingAlerts;
  const f = facilityBySlug(slug);
  return f ? trackingAlerts.filter((a) => a.facility === f.name) : [];
}

/** Badge count for the sidebar. A function, so it reflects the latest fetch. */
export const openTrackingAlertCount = (): number => trackingAlerts.filter(isOpenAlert).length;

export const incidentById = (id: string) => incidents.find((i) => i.id === id);

export const PRIORITY_RANK: Record<AlertPriority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

/**
 * What to do next, in order.
 *
 * Breached SLAs lead regardless of priority — a breached P3 is a promise already
 * broken, which outranks a P1 that still has time on the clock. Then priority,
 * then age.
 */
export function actionQueue(slug: string, limit = 6): TrackingAlert[] {
  return alertsForFacility(slug)
    .filter(isOpenAlert)
    .slice()
    .sort((a, b) => {
      if (a.slaBreached !== b.slaBreached) return a.slaBreached ? -1 : 1;
      if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      }
      return Date.parse(a.raisedAt) - Date.parse(b.raisedAt);
    })
    .slice(0, limit);
}

// ── Devices ──────────────────────────────────────────────────────────────────
export const deviceById = (id: string) => trackingDevices.find((d) => d.id === id);

export function devicesForFacility(slug: string): TrackingDevice[] {
  if (slug === 'all') return trackingDevices;
  const f = facilityBySlug(slug);
  return f ? trackingDevices.filter((d) => d.facility === f.name) : [];
}

export const childDevices = (parentId: string): TrackingDevice[] =>
  trackingDevices.filter((d) => d.parentId === parentId);

// ── Events ───────────────────────────────────────────────────────────────────
export function eventsForFacility(slug: string): TrackingEvent[] {
  if (slug === 'all') return trackingEvents;
  const f = facilityBySlug(slug);
  if (!f) return [];
  const zones = new Set(zonesForFacility(f.name).map((z) => z.name));
  return trackingEvents.filter((e) => !e.zone || zones.has(e.zone));
}

// ── KPIs ─────────────────────────────────────────────────────────────────────
export interface TrackingKpis {
  tracked: number;
  online: number;
  offline: number;
  missing: number;
  inTransit: number;
  checkedOut: number;
  misplaced: number;
  unknownTags: number;
  inventoryAccuracy: number;
  roomsVerified: number;
  roomsTotal: number;
  openAlerts: number;
  p1Alerts: number;
  slaBreached: number;
  openIncidents: number;
  devicesTotal: number;
  devicesHealthy: number;
  devicesOffline: number;
  devicesDegraded: number;
  infraHealth: number;
  coverage: number;
  lowBattery: number;
  /** What changed since 00:00 IST — the "what happened today" band. */
  inMotionNow: number;
  zoneViolations24h: number;
  checkedOutToday: number;
  checkedInToday: number;
  leftSiteToday: number;
}

export function trackingKpis(slug: string): TrackingKpis {
  const presence = presenceForFacility(slug);
  const rooms = roomsForFacility(slug);
  const alerts = alertsForFacility(slug).filter(isOpenAlert);
  const devices = devicesForFacility(slug);
  const facilityName = slug === 'all' ? null : (facilityBySlug(slug)?.name ?? null);
  const zones = facilityName ? zonesForFacility(facilityName) : trackedZones;

  const unknowns = unknownDetections
    .filter((u) => !facilityName || u.facility === facilityName)
    .filter((u) => u.state === 'New' || u.state === 'Investigating');

  const txns = movementTxns.filter(
    (t) =>
      !facilityName ||
      t.location.startsWith(facilityBySlug(slug)?.short ?? '') ||
      t.location.includes(facilityName),
  );

  const nonTags = devices.filter((d) => d.role !== 'Tag');
  const expectedTotal = rooms.reduce((s, r) => s + r.expected, 0);
  const matchedTotal = rooms.reduce((s, r) => s + (r.detected - r.unexpected), 0);

  // 00:00 IST today — which is 18:30 UTC the previous day.
  const dayStart = new Date(nowMs()).setUTCHours(-5, -30, 0, 0);
  const since = (iso?: string) => (iso ? Date.parse(iso) >= dayStart : false);

  return {
    tracked: presence.length,
    online: presence.filter((p) => p.state === 'Online').length,
    offline: presence.filter((p) => p.state === 'Offline' || p.state === 'Stale').length,
    missing: presence.filter((p) => p.state === 'Missing').length,
    inTransit: presence.filter((p) => p.state === 'In Transit').length,
    checkedOut: presence.filter((p) => p.custody === 'Checked Out').length,
    misplaced: presence.filter((p) => p.zone !== p.homeZone && p.custody === 'In Place').length,
    unknownTags: unknowns.length,
    inventoryAccuracy: expectedTotal ? Math.round((matchedTotal / expectedTotal) * 1000) / 10 : 100,
    roomsVerified: rooms.filter((r) => r.missing === 0 && r.unexpected === 0).length,
    roomsTotal: rooms.length,
    openAlerts: alerts.length,
    p1Alerts: alerts.filter((a) => a.priority === 'P1').length,
    slaBreached: alerts.filter((a) => a.slaBreached).length,
    openIncidents: incidents.filter(
      (i) => i.state !== 'Closed' && i.state !== 'Resolved' && (!facilityName || i.facility === facilityName),
    ).length,
    devicesTotal: devices.length,
    devicesHealthy: devices.filter((d) => d.state === 'Healthy').length,
    devicesOffline: devices.filter((d) => d.state === 'Offline').length,
    devicesDegraded: devices.filter((d) => d.state === 'Degraded').length,
    infraHealth: nonTags.length
      ? Math.round((nonTags.filter((d) => d.state === 'Healthy').length / nonTags.length) * 100)
      : 100,
    coverage: zones.length ? Math.round(zones.reduce((s, z) => s + z.coverage, 0) / zones.length) : 0,
    lowBattery: devices.filter((d) => typeof d.batteryPct === 'number' && d.batteryPct < 20).length,
    inMotionNow: presence.filter((p) => p.movingNow).length,
    zoneViolations24h: zones.reduce((s, z) => s + z.violations24h, 0),
    checkedOutToday: txns.filter((t) => t.direction === 'Out' && since(t.at)).length,
    checkedInToday: txns.filter((t) => t.direction === 'In' && since(t.returnedAt ?? t.at)).length,
    leftSiteToday: presence.filter((p) => p.custody === 'In Transit').length,
  };
}
