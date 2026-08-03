// ─────────────────────────────────────────────────────────────────────────────
// Access Genie — Asset Tracking domain types
//
// One rule governs this file: **the tracking technology is an implementation
// detail, never a workflow.** RFID / BLE / GPS / QR / UWB are recorded on the
// device estate (Tracking Infrastructure is an admin module, so the estate is
// legitimately visible there) but no operational screen asks a user to pick a
// technology. Operators reason about `LocationPrecision` — how well we know
// where a thing is — because that is the fact that changes what they do next.
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetCategory } from './domain.js';

// ── Locating ─────────────────────────────────────────────────────────────────

/**
 * How well we know where an asset is. This is the user-facing translation of
 * the underlying technology: UWB → Precise, BLE/RFID → Room, GPS → Site,
 * QR/handheld scan → Last scan. Users pick outcomes, not radios.
 */
export const LOCATION_PRECISIONS = ['Precise', 'Room', 'Site', 'Last scan'] as const;
export type LocationPrecision = (typeof LOCATION_PRECISIONS)[number];

/** Operational presence state — the answer to "can I go get it right now?". */
export const PRESENCE_STATES = [
  'Online', // seen inside the freshness window for its class
  'Stale', // last seen a while ago; not yet an exception
  'Offline', // past the freshness threshold — needs looking at
  'In Transit', // authorised movement between sites
  'Missing', // declared missing; investigation open
] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

/** Where the asset stands against its custody record. */
export const CUSTODY_STATES = ['In Place', 'Checked Out', 'In Transit', 'Unaccounted'] as const;
export type CustodyState = (typeof CUSTODY_STATES)[number];

export interface AssetPresence {
  assetId: string;
  assetName: string;
  category: AssetCategory;
  state: PresenceState;
  custody: CustodyState;
  /** Facility ▸ zone the asset is resolved to right now. */
  facility: string;
  zone: string;
  /** Where the asset is *supposed* to be — drives the "misplaced" exception. */
  homeZone: string;
  /** Position on the facility floor-plan, as % (0-100) of width/height. */
  position?: { x: number; y: number };
  precision: LocationPrecision;
  /** 0-100 — how much we trust this fix. Low confidence is itself a finding. */
  confidence: number;
  lastSeen: string; // ISO
  custodian: string;
  movingNow: boolean;
  /** Battery of the bound tag, when the tag has one (passive tags have none). */
  batteryPct?: number;
  criticality: 'Low' | 'Medium' | 'High' | 'Critical';
  valueInr: number;
  /** Open alert ids touching this asset — powers the map's attention ring. */
  alertIds: string[];
}

// ── Movement & journey replay ────────────────────────────────────────────────

export const JOURNEY_EVENT_KINDS = [
  'Seen',
  'Entered',
  'Exited',
  'Dwell',
  'Checked Out',
  'Checked In',
  'Gap', // coverage hole — we lost the asset for a while
  'Alert',
] as const;
export type JourneyEventKind = (typeof JOURNEY_EVENT_KINDS)[number];

export interface JourneyStop {
  at: string; // ISO
  zone: string;
  x: number; // % of floor-plan
  y: number;
  kind: JourneyEventKind;
  /** Minutes the asset stayed put at this stop. */
  dwellMin?: number;
  actor?: string;
  note?: string;
}

export interface AssetJourney {
  assetId: string;
  assetName: string;
  windowFrom: string;
  windowTo: string;
  stops: JourneyStop[];
  distanceM: number;
  zonesVisited: number;
  /** Number of coverage gaps in the window — an infrastructure signal. */
  gaps: number;
}

// ── Zones ────────────────────────────────────────────────────────────────────

export const ZONE_KINDS = [
  'Storeroom',
  'Data Hall',
  'Office',
  'Dock',
  'Secure Cage',
  'Lab',
  'Transit',
] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

/**
 * The policy a zone enforces. Expressed as an operational rule, not a geofence
 * primitive — "no exit without check-out" is a sentence a facilities manager
 * says out loud; "Exit trigger on polygon GF-5" is not.
 */
export const ZONE_POLICIES = [
  'Open',
  'Authorised only',
  'No exit without check-out',
  'Dwell limit',
  'After-hours watch',
] as const;
export type ZonePolicy = (typeof ZONE_POLICIES)[number];

export interface TrackedZone {
  id: string;
  name: string;
  facility: string;
  kind: ZoneKind;
  /** Rect on the floor-plan SVG, as % of the 0-100 box. */
  x: number;
  y: number;
  width: number;
  height: number;
  policy: ZonePolicy;
  /** Inventory truth for the zone. */
  expected: number;
  detected: number;
  /** Signal coverage, 0-100. Below ~85 the zone starts producing false gaps. */
  coverage: number;
  violations24h: number;
  armed: boolean;
  dwellLimitMin?: number;
}

// ── Inventory control ────────────────────────────────────────────────────────

export const ROOM_KINDS = ['Storeroom', 'Data Hall', 'Secure Cage', 'Staging', 'Dock'] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];

export interface InventoryRoom {
  id: string;
  name: string;
  facility: string;
  zoneId: string;
  kind: RoomKind;
  expected: number;
  detected: number;
  /** Detected but not on the expected list — the classic audit surprise. */
  unexpected: number;
  missing: number;
  /** detected-matching-expected ÷ expected, as %. The headline inventory KPI. */
  accuracy: number;
  lastVerified: string;
  custodian: string;
  rackCount: number;
  /** Continuous verification on = the room re-counts itself without a human. */
  autoVerify: boolean;
}

export const RACK_SLOT_STATES = ['Present', 'Missing', 'Unexpected', 'Empty'] as const;
export type RackSlotState = (typeof RACK_SLOT_STATES)[number];

export interface RackSlot {
  u: number; // rack unit position, 1 = bottom
  state: RackSlotState;
  assetId?: string;
  assetName?: string;
  tagId?: string;
}

export interface Rack {
  id: string;
  name: string;
  roomId: string;
  heightU: number;
  slots: RackSlot[];
  status: 'Verified' | 'Variance' | 'Unverified';
  lastVerified: string;
  /** Power/thermal context so rack monitoring answers more than "is it there". */
  loadPct: number;
  inletTempC: number;
}

export const AUDIT_STATES = ['Scheduled', 'In Progress', 'Review', 'Approved', 'Closed'] as const;
export type AuditState = (typeof AUDIT_STATES)[number];

/**
 * How the count is being taken. Deliberately technology-transparent:
 * "Automatic" is a room that counts itself, "Assisted" is a walk-through with a
 * handheld, "Manual" is eyes and a clipboard.
 */
export const AUDIT_METHODS = ['Automatic', 'Assisted', 'Manual'] as const;
export type AuditMethod = (typeof AUDIT_METHODS)[number];

export interface AuditSession {
  id: string;
  name: string;
  scope: string;
  facility: string;
  state: AuditState;
  method: AuditMethod;
  expected: number;
  detected: number;
  unexpected: number;
  missing: number;
  progress: number; // 0-100
  startedAt: string;
  dueAt: string;
  owner: string;
  approver?: string;
  /** Set once someone signs the variance off — the audit's legal moment. */
  approvedAt?: string;
  note?: string;
}

export const MOVEMENT_DIRECTIONS = ['Out', 'In'] as const;
export type MovementDirection = (typeof MOVEMENT_DIRECTIONS)[number];
export const MOVEMENT_STATES = ['Open', 'Returned', 'Overdue', 'Pending Approval', 'Rejected'] as const;
export type MovementState = (typeof MOVEMENT_STATES)[number];

export interface MovementTxn {
  id: string;
  assetId: string;
  assetName: string;
  direction: MovementDirection;
  person: string;
  department: string;
  at: string;
  dueBack?: string;
  returnedAt?: string;
  purpose: string;
  location: string;
  state: MovementState;
  approver?: string;
  /** True when the gate physically confirmed the asset, not just the paperwork. */
  verified: boolean;
}

export const UNKNOWN_STATES = ['New', 'Investigating', 'Matched', 'Registered', 'Ignored'] as const;
export type UnknownState = (typeof UNKNOWN_STATES)[number];

/** A tag the estate can hear but the registry cannot name. */
export interface UnknownDetection {
  id: string;
  tagId: string;
  firstSeen: string;
  lastSeen: string;
  zone: string;
  facility: string;
  seenCount: number;
  state: UnknownState;
  /** Best registry match the matcher could find, with its confidence. */
  suggestion?: string;
  suggestionConfidence?: number;
  reason: string;
}

export const EXCEPTION_KINDS = [
  'Missing',
  'Unexpected',
  'Misplaced',
  'Duplicate',
  'Unverified',
  'Ghost',
] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number]; // on the books, never once detected

export interface InventoryException {
  id: string;
  kind: ExceptionKind;
  assetId?: string;
  assetName?: string;
  tagId?: string;
  room: string;
  expectedRoom?: string;
  facility: string;
  detectedAt: string;
  ageHours: number;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  state: 'Open' | 'Assigned' | 'Resolved';
  owner?: string;
  valueInr: number;
  recommendation: string;
}

// ── Alerts & incidents ───────────────────────────────────────────────────────

export const TRACKING_ALERT_CATEGORIES = [
  'Missing Asset',
  'Unauthorized Movement',
  'Inventory Mismatch',
  'Unknown Tag',
  'Battery Low',
  'Gateway Offline',
  'Reader Offline',
  'Tracking Failure',
  'Duplicate Tag',
  'Asset Removed',
  'Geofence Violation',
] as const;
export type TrackingAlertCategory = (typeof TRACKING_ALERT_CATEGORIES)[number];

/** The one lifecycle every tracking alert follows, whatever raised it. */
export const ALERT_LIFECYCLES = [
  'New',
  'Acknowledged',
  'Assigned',
  'In Progress',
  'Escalated',
  'Resolved',
  'Closed',
] as const;
export type AlertLifecycle = (typeof ALERT_LIFECYCLES)[number];

export const ALERT_PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;
export type AlertPriority = (typeof ALERT_PRIORITIES)[number];

export interface AlertTimelineEntry {
  at: string;
  actor: string;
  action: string;
  note?: string;
}

export interface TrackingAlert {
  id: string;
  category: TrackingAlertCategory;
  title: string;
  summary: string;
  priority: AlertPriority;
  state: AlertLifecycle;
  assetId?: string;
  assetName?: string;
  deviceId?: string;
  facility: string;
  location: string;
  raisedAt: string;
  ackAt?: string;
  resolvedAt?: string;
  slaDueAt: string;
  slaBreached: boolean;
  assignee?: string;
  team: string;
  incidentId?: string;
  source: string;
  /** What the platform thinks you should do — one sentence, one click away. */
  recommendation: string;
  recommendationAction: string;
  valueAtRiskInr?: number;
  timeline: AlertTimelineEntry[];
}

export const INCIDENT_STATES = ['Open', 'Investigating', 'Contained', 'Resolved', 'Closed'] as const;
export type IncidentState = (typeof INCIDENT_STATES)[number];

/** Several alerts that are really one event. Incidents carry the narrative. */
export interface Incident {
  id: string;
  title: string;
  severity: 'Sev1' | 'Sev2' | 'Sev3';
  state: IncidentState;
  alertIds: string[];
  openedAt: string;
  resolvedAt?: string;
  commander: string;
  facility: string;
  summary: string;
  assetsAffected: number;
  valueAtRiskInr: number;
  nextAction: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  category: TrackingAlertCategory;
  /** Plain-language trigger — the rule reads as a sentence in the table. */
  when: string;
  then: string[];
  priority: AlertPriority;
  assignTeam: string;
  escalateAfterMin: number;
  enabled: boolean;
  firedToday: number;
  /** Duplicates the rule swallowed — the number that keeps alert fatigue down. */
  suppressedToday: number;
}

// ── Tracking infrastructure ──────────────────────────────────────────────────

/**
 * What the device *does*, not what radio it speaks. A "Reader" is a Reader
 * whether it reads RFID or scans QR; the radio is a spec on its detail page.
 */
export const DEVICE_ROLES = ['Tag', 'Reader', 'Gateway', 'Anchor', 'Scan Station', 'Sensor'] as const;
export type DeviceRole = (typeof DEVICE_ROLES)[number];

export const DEVICE_STATES = ['Healthy', 'Degraded', 'Offline', 'Maintenance', 'Unprovisioned'] as const;
export type DeviceState = (typeof DEVICE_STATES)[number];

export interface DeviceDiagnostic {
  label: string;
  value: string;
  state: 'ok' | 'warn' | 'bad';
}

export interface TrackingDevice {
  id: string;
  name: string;
  role: DeviceRole;
  state: DeviceState;
  /** The radio. Admin-only detail — never a filter on an operational screen. */
  technology: 'RFID' | 'BLE' | 'UWB' | 'GPS' | 'QR' | 'LoRaWAN';
  facility: string;
  zone: string;
  firmware: string;
  firmwareLatest: string;
  uptimePct: number;
  batteryPct?: number;
  signalPct?: number;
  /** Tags served (for readers/gateways) or assets covered (for anchors). */
  serves: number;
  /** Parent in the topology: a tag reports through a gateway, an anchor through a cluster. */
  parentId?: string;
  lastSeen: string;
  installedAt: string;
  /** Predicted end of serviceable life — drives the replacement queue. */
  replaceBy?: string;
  ip?: string;
  assetId?: string;
  assetName?: string;
  diagnostics: DeviceDiagnostic[];
}

export interface CoverageCell {
  zoneId: string;
  zone: string;
  facility: string;
  coverage: number; // 0-100
  devices: number;
  blindSpots: number;
  assetsAtRisk: number;
}

export interface FirmwareCampaign {
  id: string;
  name: string;
  targetRole: DeviceRole;
  fromVersion: string;
  toVersion: string;
  total: number;
  done: number;
  failed: number;
  state: 'Draft' | 'Scheduled' | 'Running' | 'Paused' | 'Complete';
  window: string;
  owner: string;
}

// ── Activity feed ────────────────────────────────────────────────────────────

export const TRACKING_EVENT_KINDS = ['Movement', 'Custody', 'Detection', 'Alert', 'Audit', 'Device'] as const;
export type TrackingEventKind = (typeof TRACKING_EVENT_KINDS)[number];

export interface TrackingEvent {
  id: string;
  at: string;
  kind: TrackingEventKind;
  title: string;
  detail: string;
  assetId?: string;
  assetName?: string;
  zone?: string;
  actor: string;
  tone: 'good' | 'warn' | 'bad' | 'info';
}

// ── Facilities (the scope every module is filtered by) ───────────────────────

export interface TrackedFacility {
  slug: string;
  name: string;
  short: string;
  building: string;
  emoji: string;
  assetsTracked: number;
  coverage: number;
  /** Digital-twin readiness — a facility without a floor-plan can't be twinned. */
  twinReady: boolean;
}
