// ─────────────────────────────────────────────────────────────────────────────
// Access Genie — Asset Tracking data layer (demo slice)
//
// Everything here is deterministic: timestamps are anchored to the demo clock
// and the synthetic fleet comes out of a seeded PRNG, so the server render and
// the client hydration always agree. No `Math.random()`, no `Date.now()`.
//
// The 14 hand-authored assets from `mock-data` stay authoritative — this module
// enriches them with live tracking state and surrounds them with a fleet large
// enough that the KPIs, maps and audits read like a real estate.
// ─────────────────────────────────────────────────────────────────────────────

import { mockAssets } from '@/lib/mock-data';
import type { AssetCategory } from '@/types/asset';
import type {
  AlertPriority,
  AssetJourney,
  AssetPresence,
  AuditSession,
  AutomationRule,
  CoverageCell,
  CustodyState,
  DeviceRole,
  FirmwareCampaign,
  Incident,
  InventoryException,
  InventoryRoom,
  LocationPrecision,
  MovementTxn,
  PresenceState,
  Rack,
  RackSlot,
  TrackedFacility,
  TrackedZone,
  TrackingAlert,
  TrackingDevice,
  TrackingEvent,
  UnknownDetection,
} from '@/types/tracking';

// ── Clock ────────────────────────────────────────────────────────────────────
const NOW = '2026-07-23T09:00:00.000Z';
export const TRACKING_NOW = Date.parse(NOW);
const minsAgo = (m: number) => new Date(TRACKING_NOW - m * 60_000).toISOString();
const hoursAgo = (h: number) => minsAgo(h * 60);
const daysAgo = (d: number) => hoursAgo(d * 24);
const minsAhead = (m: number) => new Date(TRACKING_NOW + m * 60_000).toISOString();
const hoursAhead = (h: number) => minsAhead(h * 60);
const daysAhead = (d: number) => hoursAhead(d * 24);

// ── Seeded PRNG (mulberry32) — pure, so the fleet is byte-identical everywhere ─
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const between = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const round1 = (n: number) => Math.round(n * 10) / 10;

// ─────────────────────────────────────────────────────────────────────────────
// Facilities — the scope every tracking screen filters by
// ─────────────────────────────────────────────────────────────────────────────

export const TRACKED_FACILITIES: TrackedFacility[] = [
  {
    slug: 'hyderabad-warehouse',
    name: 'Hyderabad Central Warehouse',
    short: 'Hyderabad WH',
    building: 'Building A · Dock, Staging & Secure Cage',
    emoji: '🏭',
    assetsTracked: 0,
    coverage: 91,
    twinReady: true,
  },
  {
    slug: 'bengaluru-hq',
    name: 'Bengaluru HQ',
    short: 'Bengaluru HQ',
    building: 'Floors 1–4 · Offices, Studio & IT Storeroom',
    emoji: '🏢',
    assetsTracked: 0,
    coverage: 87,
    twinReady: true,
  },
  {
    slug: 'chennai-dc',
    name: 'Chennai Data Center',
    short: 'Chennai DC',
    building: 'Server Rooms Alpha & Beta · Restricted',
    emoji: '🖥️',
    assetsTracked: 0,
    coverage: 96,
    twinReady: true,
  },
];

export const facilityBySlug = (slug: string): TrackedFacility | undefined =>
  TRACKED_FACILITIES.find((f) => f.slug === slug);
export const facilityByName = (name: string): TrackedFacility | undefined =>
  TRACKED_FACILITIES.find((f) => f.name === name);

// ─────────────────────────────────────────────────────────────────────────────
// Zones — one floor-plan per facility, drawn on the same 0-100 SVG box
// ─────────────────────────────────────────────────────────────────────────────

export const trackedZones: TrackedZone[] = [
  // ── Hyderabad Central Warehouse ────────────────────────────────────────────
  { id: 'Z-WH-DOCK', name: 'Loading Dock 4', facility: 'Hyderabad Central Warehouse', kind: 'Dock', x: 2, y: 2, width: 30, height: 20, policy: 'No exit without check-out', expected: 340, detected: 336, coverage: 94, violations24h: 3, armed: true },
  { id: 'Z-WH-STAGE', name: 'Staging Bay', facility: 'Hyderabad Central Warehouse', kind: 'Storeroom', x: 2, y: 26, width: 30, height: 22, policy: 'Dwell limit', expected: 370, detected: 370, coverage: 92, violations24h: 1, armed: true, dwellLimitMin: 480 },
  { id: 'Z-WH-PICK', name: 'Picking Zone', facility: 'Hyderabad Central Warehouse', kind: 'Storeroom', x: 2, y: 52, width: 30, height: 46, policy: 'Open', expected: 612, detected: 610, coverage: 89, violations24h: 0, armed: false },
  { id: 'Z-WH-MAIN', name: 'Main Warehouse', facility: 'Hyderabad Central Warehouse', kind: 'Storeroom', x: 36, y: 2, width: 40, height: 60, policy: 'Open', expected: 1180, detected: 1174, coverage: 90, violations24h: 0, armed: false },
  { id: 'Z-WH-CAGE', name: 'Secure Cage', facility: 'Hyderabad Central Warehouse', kind: 'Secure Cage', x: 36, y: 66, width: 40, height: 32, policy: 'Authorised only', expected: 210, detected: 206, coverage: 78, violations24h: 2, armed: true },
  { id: 'Z-WH-YARD', name: 'Outbound Yard', facility: 'Hyderabad Central Warehouse', kind: 'Transit', x: 80, y: 2, width: 18, height: 96, policy: 'After-hours watch', expected: 96, detected: 94, coverage: 71, violations24h: 1, armed: true },

  // ── Bengaluru HQ ───────────────────────────────────────────────────────────
  { id: 'Z-HQ-LOBBY', name: 'Lobby', facility: 'Bengaluru HQ', kind: 'Office', x: 2, y: 2, width: 28, height: 24, policy: 'No exit without check-out', expected: 42, detected: 41, coverage: 88, violations24h: 4, armed: true },
  { id: 'Z-HQ-STORE', name: 'IT Storeroom', facility: 'Bengaluru HQ', kind: 'Storeroom', x: 2, y: 30, width: 28, height: 32, policy: 'Authorised only', expected: 486, detected: 486, coverage: 95, violations24h: 0, armed: true },
  { id: 'Z-HQ-TOOL', name: 'IT Tool Room', facility: 'Bengaluru HQ', kind: 'Lab', x: 2, y: 66, width: 28, height: 32, policy: 'No exit without check-out', expected: 128, detected: 127, coverage: 90, violations24h: 1, armed: true },
  { id: 'Z-HQ-F3', name: 'Floor 3 Desks', facility: 'Bengaluru HQ', kind: 'Office', x: 34, y: 2, width: 34, height: 44, policy: 'Open', expected: 1310, detected: 1296, coverage: 84, violations24h: 0, armed: false },
  { id: 'Z-HQ-CONF', name: 'Conference Room A', facility: 'Bengaluru HQ', kind: 'Office', x: 34, y: 50, width: 34, height: 20, policy: 'Dwell limit', expected: 24, detected: 24, coverage: 86, violations24h: 0, armed: false, dwellLimitMin: 240 },
  { id: 'Z-HQ-STUDIO', name: 'Design Studio', facility: 'Bengaluru HQ', kind: 'Office', x: 34, y: 74, width: 34, height: 24, policy: 'Dwell limit', expected: 168, detected: 167, coverage: 82, violations24h: 1, armed: true, dwellLimitMin: 1440 },
  { id: 'Z-HQ-PRINT', name: 'Print Station', facility: 'Bengaluru HQ', kind: 'Office', x: 72, y: 2, width: 26, height: 22, policy: 'Open', expected: 18, detected: 18, coverage: 80, violations24h: 0, armed: false },
  { id: 'Z-HQ-MEET', name: 'Meeting Rooms 4–9', facility: 'Bengaluru HQ', kind: 'Office', x: 72, y: 28, width: 26, height: 34, policy: 'Open', expected: 74, detected: 72, coverage: 76, violations24h: 0, armed: false },
  { id: 'Z-HQ-EXIT', name: 'Main Exit & Reception', facility: 'Bengaluru HQ', kind: 'Transit', x: 72, y: 66, width: 26, height: 32, policy: 'No exit without check-out', expected: 12, detected: 12, coverage: 93, violations24h: 5, armed: true },

  // ── Chennai Data Center ────────────────────────────────────────────────────
  { id: 'Z-DC-ALPHA', name: 'Server Room Alpha', facility: 'Chennai Data Center', kind: 'Data Hall', x: 2, y: 2, width: 44, height: 46, policy: 'Authorised only', expected: 640, detected: 640, coverage: 98, violations24h: 2, armed: true },
  { id: 'Z-DC-BETA', name: 'Server Room Beta', facility: 'Chennai Data Center', kind: 'Data Hall', x: 2, y: 52, width: 44, height: 46, policy: 'Authorised only', expected: 410, detected: 409, coverage: 97, violations24h: 0, armed: true },
  { id: 'Z-DC-UTIL', name: 'Utility Room', facility: 'Chennai Data Center', kind: 'Lab', x: 50, y: 2, width: 22, height: 46, policy: 'Authorised only', expected: 86, detected: 86, coverage: 95, violations24h: 0, armed: true },
  { id: 'Z-DC-STORE', name: 'DC Storeroom', facility: 'Chennai Data Center', kind: 'Storeroom', x: 50, y: 52, width: 22, height: 46, policy: 'Authorised only', expected: 240, detected: 238, coverage: 93, violations24h: 0, armed: true },
  { id: 'Z-DC-MDF', name: 'MDF / Carrier Room', facility: 'Chennai Data Center', kind: 'Data Hall', x: 76, y: 2, width: 22, height: 46, policy: 'Authorised only', expected: 118, detected: 118, coverage: 96, violations24h: 0, armed: true },
  { id: 'Z-DC-INWARD', name: 'Goods Inward', facility: 'Chennai Data Center', kind: 'Dock', x: 76, y: 52, width: 22, height: 46, policy: 'No exit without check-out', expected: 64, detected: 62, coverage: 89, violations24h: 1, armed: true },
];

export const zonesForFacility = (facility: string): TrackedZone[] =>
  trackedZones.filter((z) => z.facility === facility);
export const zoneById = (id: string): TrackedZone | undefined => trackedZones.find((z) => z.id === id);
export const zoneByName = (facility: string, name: string): TrackedZone | undefined =>
  trackedZones.find((z) => z.facility === facility && z.name === name);

/** A point inside a zone rect, laid out on a deterministic jitter grid. */
function pointIn(zoneId: string, r: () => number): { x: number; y: number } {
  const z = zoneById(zoneId);
  if (!z) return { x: 50, y: 50 };
  const pad = 3;
  return {
    x: round1(z.x + pad + r() * Math.max(1, z.width - pad * 2)),
    y: round1(z.y + pad + r() * Math.max(1, z.height - pad * 2)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Presence — where every tracked asset is right now
// ─────────────────────────────────────────────────────────────────────────────

/** Zone the 14 authored assets resolve to on their facility's plan. */
const AUTHORED_ZONE: Record<string, string> = {
  'AST-1001': 'Z-DC-ALPHA',
  'AST-1002': 'Z-DC-ALPHA',
  'AST-1003': 'Z-HQ-F3',
  'AST-1004': 'Z-HQ-STUDIO',
  'AST-1005': 'Z-DC-UTIL',
  'AST-1006': 'Z-HQ-EXIT',
  'AST-1007': 'Z-HQ-CONF',
  'AST-1008': 'Z-DC-ALPHA',
  'AST-1009': 'Z-DC-BETA',
  'AST-1010': 'Z-HQ-STORE',
  'AST-1011': 'Z-WH-PICK',
  'AST-1012': 'Z-WH-DOCK',
  'AST-1013': 'Z-HQ-PRINT',
  'AST-1014': 'Z-HQ-TOOL',
};

/** Where each authored asset *should* be — the difference is the exception. */
const AUTHORED_HOME: Record<string, string> = {
  'AST-1003': 'Z-HQ-STORE', // checked out to a desk, legitimately
  'AST-1006': 'Z-HQ-LOBBY', // walked out of the building — the missing case
  'AST-1010': 'Z-HQ-STORE',
};

const AUTHORED_OVERRIDE: Partial<
  Record<
    string,
    {
      state: PresenceState;
      custody: CustodyState;
      precision: LocationPrecision;
      confidence: number;
      lastSeen: string;
      moving?: boolean;
      battery?: number;
      alerts?: string[];
    }
  >
> = {
  'AST-1001': { state: 'Online', custody: 'In Place', precision: 'Room', confidence: 97, lastSeen: minsAgo(2), alerts: ['TRK-ALT-002'] },
  'AST-1002': { state: 'Online', custody: 'In Place', precision: 'Room', confidence: 98, lastSeen: minsAgo(1) },
  'AST-1003': { state: 'Online', custody: 'Checked Out', precision: 'Room', confidence: 88, lastSeen: hoursAgo(2), battery: 100 },
  'AST-1004': { state: 'Online', custody: 'In Place', precision: 'Precise', confidence: 94, lastSeen: minsAgo(4), battery: 88 },
  'AST-1005': { state: 'Online', custody: 'In Place', precision: 'Room', confidence: 96, lastSeen: minsAgo(8), battery: 92 },
  'AST-1006': { state: 'Missing', custody: 'Unaccounted', precision: 'Last scan', confidence: 22, lastSeen: hoursAgo(52), battery: 12, alerts: ['TRK-ALT-001', 'TRK-ALT-004'] },
  'AST-1007': { state: 'Online', custody: 'In Place', precision: 'Precise', confidence: 91, lastSeen: minsAgo(3), battery: 64 },
  'AST-1008': { state: 'Online', custody: 'In Place', precision: 'Room', confidence: 98, lastSeen: minsAgo(1) },
  'AST-1009': { state: 'Stale', custody: 'In Place', precision: 'Precise', confidence: 61, lastSeen: minsAgo(14), battery: 17, alerts: ['TRK-ALT-008'] },
  'AST-1010': { state: 'Online', custody: 'In Place', precision: 'Last scan', confidence: 74, lastSeen: hoursAgo(9) },
  'AST-1011': { state: 'Online', custody: 'Checked Out', precision: 'Precise', confidence: 93, lastSeen: minsAgo(4), moving: true, battery: 52 },
  'AST-1012': { state: 'Online', custody: 'In Place', precision: 'Room', confidence: 97, lastSeen: minsAgo(1) },
  'AST-1013': { state: 'Stale', custody: 'In Place', precision: 'Last scan', confidence: 55, lastSeen: daysAgo(2) },
  'AST-1014': { state: 'In Transit', custody: 'In Transit', precision: 'Site', confidence: 68, lastSeen: minsAgo(6), moving: true, battery: 58 },
};

const CUSTODIANS = [
  'IT Ops Team', 'Network Team', 'Storage Team', 'Security Team', 'Facilities Team',
  'Warehouse Team', 'IT Support', 'Sneha Iyer', 'Deepak Nair', 'Aditya Rao',
  'Manoj Reddy', 'Field Tech 2B', 'Design Team', 'Unassigned',
] as const;

const FLEET_MODELS: Record<AssetCategory, readonly string[]> = {
  Compute: ['Dell PowerEdge R660', 'HPE ProLiant DL380', 'Lenovo ThinkSystem SR650', 'Dell OptiPlex 7010', 'Lenovo ThinkPad T14s', 'Dell Latitude 5440'],
  Network: ['Cisco Catalyst 9300', 'Juniper EX4400', 'Aruba CX 6300', 'Cisco Nexus 9336', 'Fortinet FortiSwitch 448E', 'Aruba AP-635'],
  Endpoints: ['Dell UltraSharp 27"', 'Zebra TC58 Handheld', 'iPad Air (Ops)', 'HP EliteDisplay E243', 'Logitech Rally Bar', 'Honeywell CK65'],
  Infrastructure: ['APC Smart-UPS 5000', 'Vertiv Liebert PDU', 'Rittal Cooling Unit', 'Eaton 9PX UPS', 'Schneider Rack PDU'],
  Sensors: ['Rack Thermal Probe', 'Door Contact Sensor', 'Humidity Probe', 'Power Meter', 'Vibration Sensor'],
};

const CATEGORY_WEIGHTS: readonly AssetCategory[] = [
  'Compute', 'Compute', 'Compute', 'Endpoints', 'Endpoints', 'Endpoints',
  'Network', 'Network', 'Infrastructure', 'Sensors',
];

const PRECISION_BY_ZONE: Record<string, LocationPrecision> = {
  'Data Hall': 'Room',
  'Secure Cage': 'Precise',
  Storeroom: 'Room',
  Office: 'Precise',
  Dock: 'Room',
  Lab: 'Precise',
  Transit: 'Site',
};

function buildPresence(): AssetPresence[] {
  const r = rng(0x4147_2026);
  const out: AssetPresence[] = [];

  // ── The 14 authored assets, enriched ───────────────────────────────────────
  for (const a of mockAssets) {
    const zoneId = AUTHORED_ZONE[a.id];
    const zone = zoneById(zoneId);
    if (!zone) continue;
    const o = AUTHORED_OVERRIDE[a.id];
    const homeZoneId = AUTHORED_HOME[a.id] ?? zoneId;
    out.push({
      assetId: a.id,
      assetName: a.name,
      category: a.category,
      state: o?.state ?? 'Online',
      custody: o?.custody ?? 'In Place',
      facility: zone.facility,
      zone: zone.name,
      homeZone: zoneById(homeZoneId)?.name ?? zone.name,
      position: pointIn(zoneId, r),
      precision: o?.precision ?? 'Room',
      confidence: o?.confidence ?? 90,
      lastSeen: o?.lastSeen ?? minsAgo(5),
      custodian: a.custodian,
      movingNow: o?.moving ?? false,
      batteryPct: o?.battery,
      criticality: a.criticality ?? 'Medium',
      valueInr: a.purchasePrice,
      alertIds: o?.alerts ?? [],
    });
  }

  // ── The surrounding fleet ──────────────────────────────────────────────────
  const zonePool = trackedZones.filter((z) => z.kind !== 'Transit');
  for (let i = 0; i < 96; i++) {
    const zone = pick(r, zonePool);
    const category = pick(r, CATEGORY_WEIGHTS);
    const model = pick(r, FLEET_MODELS[category]);
    const roll = r();
    // Most of the estate is healthy; the tail is what the operator works on.
    const state: PresenceState =
      roll > 0.965 ? 'Missing' : roll > 0.90 ? 'Offline' : roll > 0.80 ? 'Stale' : roll > 0.965 ? 'In Transit' : 'Online';
    const custodyRoll = r();
    const custody: CustodyState =
      state === 'Missing' ? 'Unaccounted' : custodyRoll > 0.88 ? 'Checked Out' : custodyRoll > 0.84 ? 'In Transit' : 'In Place';
    const lastSeenMin =
      state === 'Online' ? between(r, 1, 25)
        : state === 'Stale' ? between(r, 90, 1400)
          : state === 'Offline' ? between(r, 1500, 4300)
            : between(r, 2900, 6200);
    const hasBattery = r() > 0.35;
    // A drifted asset is one sitting outside its home zone — the misplaced case.
    const drifted = r() > 0.93;
    const home = drifted ? pick(r, zonePool) : zone;
    out.push({
      assetId: `AST-2${String(100 + i).padStart(3, '0')}`,
      assetName: model,
      category,
      state,
      custody,
      facility: zone.facility,
      zone: zone.name,
      homeZone: home.name,
      position: pointIn(zone.id, r),
      precision: PRECISION_BY_ZONE[zone.kind] ?? 'Room',
      confidence: state === 'Online' ? between(r, 86, 99) : state === 'Stale' ? between(r, 55, 80) : between(r, 12, 48),
      lastSeen: minsAgo(lastSeenMin),
      custodian: pick(r, CUSTODIANS),
      movingNow: state === 'Online' && r() > 0.9,
      batteryPct: hasBattery ? between(r, 9, 100) : undefined,
      criticality: pick(r, ['Low', 'Medium', 'Medium', 'High', 'Critical'] as const),
      valueInr: between(r, 4, 180) * 10_000,
      alertIds: [],
    });
  }
  return out;
}

export const assetPresence: AssetPresence[] = buildPresence();

export const presenceById = (assetId: string): AssetPresence | undefined =>
  assetPresence.find((p) => p.assetId === assetId);

/** `'all'` means the whole estate — every screen's scope selector uses this. */
export function presenceForFacility(slug: string): AssetPresence[] {
  if (slug === 'all') return assetPresence;
  const f = facilityBySlug(slug);
  return f ? assetPresence.filter((p) => p.facility === f.name) : [];
}

// Facility headline counts, filled in once presence exists.
for (const f of TRACKED_FACILITIES) {
  f.assetsTracked = assetPresence.filter((p) => p.facility === f.name).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Journeys — where an asset has been, and where the trail goes cold
// ─────────────────────────────────────────────────────────────────────────────

export const journeys: AssetJourney[] = [
  {
    assetId: 'AST-1006',
    assetName: 'iPad Pro 12.9" (Field Ops)',
    windowFrom: hoursAgo(56),
    windowTo: hoursAgo(52),
    distanceM: 340,
    zonesVisited: 4,
    gaps: 1,
    stops: [
      { at: hoursAgo(56), zone: 'Design Studio', x: 48, y: 84, kind: 'Seen', dwellMin: 96, actor: 'Field Tech 2B' },
      { at: hoursAgo(54), zone: 'Floor 3 Desks', x: 50, y: 24, kind: 'Entered', dwellMin: 42 },
      { at: hoursAgo(53), zone: 'Lobby', x: 16, y: 14, kind: 'Entered', dwellMin: 8 },
      { at: hoursAgo(52), zone: 'Main Exit & Reception', x: 84, y: 80, kind: 'Exited', note: 'Left the building with no check-out on file', actor: 'Policy: No exit without check-out' },
      { at: hoursAgo(52), zone: 'Main Exit & Reception', x: 84, y: 80, kind: 'Alert', note: 'Unauthorized movement raised — TRK-ALT-004' },
      { at: hoursAgo(51), zone: '—', x: 92, y: 92, kind: 'Gap', dwellMin: 3060, note: 'No detection since. Recovery search open.' },
    ],
  },
  {
    assetId: 'AST-1011',
    assetName: 'Zebra TC52 Mobile Computer',
    windowFrom: hoursAgo(9),
    windowTo: minsAgo(4),
    distanceM: 1840,
    zonesVisited: 4,
    gaps: 0,
    stops: [
      { at: hoursAgo(9), zone: 'Picking Zone', x: 10, y: 70, kind: 'Checked Out', actor: 'Kiosk WH-1', note: 'Shift handover to Warehouse Team' },
      { at: hoursAgo(7), zone: 'Main Warehouse', x: 52, y: 30, kind: 'Entered', dwellMin: 118 },
      { at: hoursAgo(5), zone: 'Staging Bay', x: 16, y: 36, kind: 'Entered', dwellMin: 41 },
      { at: hoursAgo(3), zone: 'Loading Dock 4', x: 16, y: 11, kind: 'Entered', dwellMin: 96 },
      { at: minsAgo(40), zone: 'Main Warehouse', x: 46, y: 44, kind: 'Seen', dwellMin: 22 },
      { at: minsAgo(4), zone: 'Picking Zone', x: 12, y: 74, kind: 'Seen', dwellMin: 4 },
    ],
  },
  {
    assetId: 'AST-1003',
    assetName: 'Lenovo ThinkPad T14',
    windowFrom: daysAgo(2),
    windowTo: hoursAgo(2),
    distanceM: 410,
    zonesVisited: 3,
    gaps: 0,
    stops: [
      { at: daysAgo(2), zone: 'IT Storeroom', x: 14, y: 44, kind: 'Seen', dwellMin: 1380 },
      { at: hoursAgo(3), zone: 'IT Storeroom', x: 14, y: 44, kind: 'Checked Out', actor: 'Sneha Iyer', note: 'QR scan at the storeroom desk' },
      { at: hoursAgo(2), zone: 'Floor 3 Desks', x: 48, y: 20, kind: 'Entered', dwellMin: 118 },
    ],
  },
  {
    assetId: 'AST-1014',
    assetName: 'Fluke Networks DSX-8000',
    windowFrom: daysAgo(2),
    windowTo: minsAgo(6),
    distanceM: 96,
    zonesVisited: 3,
    gaps: 1,
    stops: [
      { at: daysAgo(2), zone: 'Goods Inward', x: 84, y: 70, kind: 'Seen', dwellMin: 240, note: 'Received at Chennai DC' },
      { at: daysAgo(1), zone: 'IT Tool Room', x: 14, y: 80, kind: 'Entered', dwellMin: 1180, note: 'Commissioning + calibration check' },
      { at: hoursAgo(4), zone: '—', x: 60, y: 60, kind: 'Gap', dwellMin: 45, note: 'Coverage hole in the corridor between Tool Room and Exit' },
      { at: minsAgo(6), zone: 'In transit — Bengaluru ▸ Hyderabad', x: 88, y: 84, kind: 'Checked Out', actor: 'Manoj Reddy', note: 'Approved transfer AGT-3391' },
    ],
  },
  {
    assetId: 'AST-1004',
    assetName: 'MacBook Pro 16"',
    windowFrom: hoursAgo(20),
    windowTo: minsAgo(4),
    distanceM: 260,
    zonesVisited: 2,
    gaps: 0,
    stops: [
      { at: hoursAgo(20), zone: 'Design Studio', x: 46, y: 86, kind: 'Seen', dwellMin: 840 },
      { at: hoursAgo(6), zone: 'Conference Room A', x: 50, y: 58, kind: 'Entered', dwellMin: 74 },
      { at: minsAgo(4), zone: 'Design Studio', x: 46, y: 86, kind: 'Seen', dwellMin: 296 },
    ],
  },
];

export const journeyForAsset = (assetId: string): AssetJourney | undefined =>
  journeys.find((j) => j.assetId === assetId);

// ─────────────────────────────────────────────────────────────────────────────
// Inventory control
// ─────────────────────────────────────────────────────────────────────────────

export const inventoryRooms: InventoryRoom[] = [
  { id: 'ROOM-01', name: 'IT Storeroom', facility: 'Bengaluru HQ', zoneId: 'Z-HQ-STORE', kind: 'Storeroom', expected: 486, detected: 486, unexpected: 0, missing: 0, accuracy: 100, lastVerified: minsAgo(18), custodian: 'Sneha Iyer', rackCount: 0, autoVerify: true },
  { id: 'ROOM-02', name: 'Secure Cage', facility: 'Hyderabad Central Warehouse', zoneId: 'Z-WH-CAGE', kind: 'Secure Cage', expected: 210, detected: 206, unexpected: 1, missing: 4, accuracy: 98.1, lastVerified: hoursAgo(14), custodian: 'Tarun Fernandes', rackCount: 2, autoVerify: false },
  { id: 'ROOM-03', name: 'Server Room Alpha', facility: 'Chennai Data Center', zoneId: 'Z-DC-ALPHA', kind: 'Data Hall', expected: 640, detected: 640, unexpected: 0, missing: 0, accuracy: 100, lastVerified: minsAgo(6), custodian: 'IT Ops Team', rackCount: 3, autoVerify: true },
  { id: 'ROOM-04', name: 'Server Room Beta', facility: 'Chennai Data Center', zoneId: 'Z-DC-BETA', kind: 'Data Hall', expected: 410, detected: 409, unexpected: 0, missing: 1, accuracy: 99.8, lastVerified: minsAgo(11), custodian: 'Storage Team', rackCount: 2, autoVerify: true },
  { id: 'ROOM-05', name: 'Staging Bay', facility: 'Hyderabad Central Warehouse', zoneId: 'Z-WH-STAGE', kind: 'Staging', expected: 370, detected: 370, unexpected: 3, missing: 0, accuracy: 99.2, lastVerified: hoursAgo(2), custodian: 'Warehouse Team', rackCount: 0, autoVerify: true },
  { id: 'ROOM-06', name: 'Loading Dock 4', facility: 'Hyderabad Central Warehouse', zoneId: 'Z-WH-DOCK', kind: 'Dock', expected: 340, detected: 336, unexpected: 2, missing: 4, accuracy: 98.2, lastVerified: minsAgo(42), custodian: 'Deepak Nair', rackCount: 0, autoVerify: true },
  { id: 'ROOM-07', name: 'DC Storeroom', facility: 'Chennai Data Center', zoneId: 'Z-DC-STORE', kind: 'Storeroom', expected: 240, detected: 238, unexpected: 0, missing: 2, accuracy: 99.2, lastVerified: hoursAgo(5), custodian: 'Storage Team', rackCount: 1, autoVerify: true },
  { id: 'ROOM-08', name: 'IT Tool Room', facility: 'Bengaluru HQ', zoneId: 'Z-HQ-TOOL', kind: 'Storeroom', expected: 128, detected: 127, unexpected: 0, missing: 1, accuracy: 99.2, lastVerified: hoursAgo(7), custodian: 'Network Team', rackCount: 0, autoVerify: false },
];

export const roomById = (id: string) => inventoryRooms.find((r) => r.id === id);
export const roomsForFacility = (slug: string): InventoryRoom[] => {
  if (slug === 'all') return inventoryRooms;
  const f = facilityBySlug(slug);
  return f ? inventoryRooms.filter((r) => r.facility === f.name) : [];
};

// ── Racks ────────────────────────────────────────────────────────────────────

function buildRacks(): Rack[] {
  const r = rng(0x5241_434b);
  const specs: { id: string; name: string; roomId: string; status: Rack['status'] }[] = [
    { id: 'RACK-A12', name: 'Rack A12', roomId: 'ROOM-03', status: 'Verified' },
    { id: 'RACK-A42', name: 'Rack A42', roomId: 'ROOM-03', status: 'Variance' },
    { id: 'RACK-A01', name: 'Rack A01', roomId: 'ROOM-03', status: 'Verified' },
    { id: 'RACK-B08', name: 'Rack B08', roomId: 'ROOM-04', status: 'Variance' },
    { id: 'RACK-B14', name: 'Rack B14', roomId: 'ROOM-04', status: 'Verified' },
    { id: 'RACK-C02', name: 'Cage Rack C02', roomId: 'ROOM-02', status: 'Unverified' },
    { id: 'RACK-C03', name: 'Cage Rack C03', roomId: 'ROOM-02', status: 'Variance' },
    { id: 'RACK-S01', name: 'DC Store Rack S01', roomId: 'ROOM-07', status: 'Verified' },
  ];
  const named: Record<string, { u: number; assetId: string; assetName: string }[]> = {
    'RACK-A42': [{ u: 18, assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server' }],
    'RACK-A12': [{ u: 30, assetId: 'AST-1002', assetName: 'Cisco Catalyst 9500 Switch' }],
    'RACK-A01': [{ u: 8, assetId: 'AST-1008', assetName: 'Fortinet FortiGate 100F Firewall' }],
    'RACK-B08': [{ u: 22, assetId: 'AST-1009', assetName: 'Synology RS2418+ NAS' }],
  };

  return specs.map((spec) => {
    const heightU = 42;
    const slots: RackSlot[] = [];
    const pinned = named[spec.id] ?? [];
    for (let u = heightU; u >= 1; u--) {
      const hit = pinned.find((p) => p.u === u);
      if (hit) {
        slots.push({ u, state: 'Present', assetId: hit.assetId, assetName: hit.assetName, tagId: `RFID-E280116060${u}` });
        continue;
      }
      const roll = r();
      if (roll > 0.62) {
        const state: RackSlot['state'] =
          spec.status === 'Variance' && roll > 0.955 ? 'Missing'
            : spec.status === 'Variance' && roll > 0.945 ? 'Unexpected'
              : 'Present';
        slots.push({
          u,
          state,
          assetId: state === 'Unexpected' ? undefined : `AST-2${String(300 + u).padStart(3, '0')}`,
          assetName: state === 'Unexpected' ? undefined : pick(r, FLEET_MODELS.Compute.concat(FLEET_MODELS.Network)),
          tagId: state === 'Unexpected' ? `RFID-UNKNOWN-${String(u).padStart(2, '0')}` : undefined,
        });
      } else {
        slots.push({ u, state: 'Empty' });
      }
    }
    return {
      ...spec,
      heightU,
      slots,
      lastVerified: spec.status === 'Unverified' ? hoursAgo(between(r, 30, 80)) : minsAgo(between(r, 4, 400)),
      loadPct: between(r, 38, 92),
      inletTempC: round1(19 + r() * 9),
    };
  });
}

export const racks: Rack[] = buildRacks();
export const racksForRoom = (roomId: string): Rack[] => racks.filter((k) => k.roomId === roomId);
export const rackById = (id: string) => racks.find((k) => k.id === id);

// ── Audits ───────────────────────────────────────────────────────────────────

export const auditSessions: AuditSession[] = [
  { id: 'AUD-2041', name: 'Q2 FY27 — Secure Cage full count', scope: 'Secure Cage', facility: 'Hyderabad Central Warehouse', state: 'Review', method: 'Assisted', expected: 210, detected: 206, unexpected: 1, missing: 4, progress: 100, startedAt: hoursAgo(14), dueAt: hoursAhead(10), owner: 'Tarun Fernandes', approver: 'Sneha Iyer', note: '4 units unaccounted for; one unregistered tag detected on shelf 3.' },
  { id: 'AUD-2042', name: 'Weekly — Server Room Alpha', scope: 'Server Room Alpha', facility: 'Chennai Data Center', state: 'Approved', method: 'Automatic', expected: 640, detected: 640, unexpected: 0, missing: 0, progress: 100, startedAt: daysAgo(1), dueAt: daysAgo(1), owner: 'IT Ops Team', approver: 'Manoj Reddy', approvedAt: hoursAgo(20) },
  { id: 'AUD-2043', name: 'Dock 4 — inbound reconciliation', scope: 'Loading Dock 4', facility: 'Hyderabad Central Warehouse', state: 'In Progress', method: 'Automatic', expected: 340, detected: 268, unexpected: 2, missing: 0, progress: 79, startedAt: minsAgo(42), dueAt: hoursAhead(2), owner: 'Deepak Nair' },
  { id: 'AUD-2044', name: 'Monthly — Bengaluru IT Storeroom', scope: 'IT Storeroom', facility: 'Bengaluru HQ', state: 'Approved', method: 'Automatic', expected: 486, detected: 486, unexpected: 0, missing: 0, progress: 100, startedAt: daysAgo(4), dueAt: daysAgo(4), owner: 'Sneha Iyer', approver: 'Sneha Iyer', approvedAt: daysAgo(4) },
  { id: 'AUD-2045', name: 'Q2 FY27 — Server Room Beta', scope: 'Server Room Beta', facility: 'Chennai Data Center', state: 'Scheduled', method: 'Automatic', expected: 410, detected: 0, unexpected: 0, missing: 0, progress: 0, startedAt: daysAhead(3), dueAt: daysAhead(4), owner: 'Storage Team' },
  { id: 'AUD-2046', name: 'Spot check — Floor 3 desks', scope: 'Floor 3 Desks', facility: 'Bengaluru HQ', state: 'Review', method: 'Manual', expected: 1310, detected: 1296, unexpected: 0, missing: 14, progress: 100, startedAt: daysAgo(12), dueAt: daysAgo(11), owner: 'Sneha Iyer', note: '14 endpoints not found at desks — likely with staff working remotely.' },
  { id: 'AUD-2047', name: 'DC Storeroom — quarterly', scope: 'DC Storeroom', facility: 'Chennai Data Center', state: 'Closed', method: 'Assisted', expected: 240, detected: 238, unexpected: 0, missing: 2, progress: 100, startedAt: daysAgo(9), dueAt: daysAgo(8), owner: 'Storage Team', approver: 'Manoj Reddy', approvedAt: daysAgo(8) },
  { id: 'AUD-2048', name: 'IT Tool Room — calibration sweep', scope: 'IT Tool Room', facility: 'Bengaluru HQ', state: 'Scheduled', method: 'Assisted', expected: 128, detected: 0, unexpected: 0, missing: 0, progress: 0, startedAt: daysAhead(10), dueAt: daysAhead(11), owner: 'Network Team' },
];

export const auditsForFacility = (slug: string): AuditSession[] => {
  if (slug === 'all') return auditSessions;
  const f = facilityBySlug(slug);
  return f ? auditSessions.filter((a) => a.facility === f.name) : [];
};

// ── Check-in / check-out ─────────────────────────────────────────────────────

export const movementTxns: MovementTxn[] = [
  { id: 'MOV-8801', assetId: 'AST-1003', assetName: 'Lenovo ThinkPad T14', direction: 'Out', person: 'Sneha Iyer', department: 'IT Operations', at: hoursAgo(3), dueBack: daysAhead(4), purpose: 'Replacement laptop — Floor 3 desk', location: 'Bengaluru HQ · IT Storeroom', state: 'Open', verified: true },
  { id: 'MOV-8802', assetId: 'AST-1011', assetName: 'Zebra TC52 Mobile Computer', direction: 'Out', person: 'Warehouse Team', department: 'Warehouse', at: hoursAgo(9), dueBack: hoursAhead(3), purpose: 'Shift picking round', location: 'Hyderabad WH · Kiosk WH-1', state: 'Open', verified: true },
  { id: 'MOV-8803', assetId: 'AST-1014', assetName: 'Fluke Networks DSX-8000', direction: 'Out', person: 'Manoj Reddy', department: 'Network Engineering', at: minsAgo(6), dueBack: daysAhead(2), purpose: 'Site survey — Hyderabad WH cabling audit', location: 'Bengaluru HQ · IT Tool Room', state: 'Pending Approval', approver: 'Sneha Iyer', verified: false },
  { id: 'MOV-8804', assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)', direction: 'Out', person: 'Field Tech 2B', department: 'Field Operations', at: daysAgo(6), dueBack: daysAgo(2), purpose: 'Field inspection round', location: 'Bengaluru HQ · Kiosk HQ-1', state: 'Overdue', verified: true },
  { id: 'MOV-8805', assetId: 'AST-2104', assetName: 'Zebra TC58 Handheld', direction: 'In', person: 'Deepak Nair', department: 'Warehouse', at: hoursAgo(2), returnedAt: hoursAgo(2), purpose: 'Returned after night shift', location: 'Hyderabad WH · Kiosk WH-1', state: 'Returned', verified: true },
  { id: 'MOV-8806', assetId: 'AST-2117', assetName: 'Dell Latitude 5440', direction: 'Out', person: 'Aditya Rao', department: 'Design', at: daysAgo(11), dueBack: daysAgo(4), purpose: 'Remote working allocation', location: 'Bengaluru HQ · IT Storeroom', state: 'Overdue', verified: true },
  { id: 'MOV-8807', assetId: 'AST-2131', assetName: 'iPad Air (Ops)', direction: 'In', person: 'Sneha Iyer', department: 'IT Operations', at: hoursAgo(5), returnedAt: hoursAgo(5), purpose: 'Reallocation to storeroom pool', location: 'Bengaluru HQ · IT Storeroom', state: 'Returned', verified: true },
  { id: 'MOV-8808', assetId: 'AST-2145', assetName: 'Honeywell CK65', direction: 'Out', person: 'Warehouse Team', department: 'Warehouse', at: hoursAgo(11), dueBack: hoursAhead(1), purpose: 'Inbound receiving', location: 'Hyderabad WH · Kiosk WH-1', state: 'Open', verified: true },
  { id: 'MOV-8809', assetId: 'AST-2152', assetName: 'Logitech Rally Bar', direction: 'Out', person: 'Facilities Team', department: 'Facilities', at: daysAgo(2), dueBack: daysAhead(5), purpose: 'Meeting Room 7 refit', location: 'Bengaluru HQ · IT Storeroom', state: 'Open', verified: false },
  { id: 'MOV-8810', assetId: 'AST-2163', assetName: 'Vertiv Liebert PDU', direction: 'Out', person: 'Storage Team', department: 'Infrastructure', at: daysAgo(1), dueBack: daysAhead(1), purpose: 'Rack B08 power upgrade', location: 'Chennai DC · DC Storeroom', state: 'Open', verified: true },
  { id: 'MOV-8811', assetId: 'AST-2171', assetName: 'Aruba AP-635', direction: 'Out', person: 'Deepak Nair', department: 'Network Engineering', at: hoursAgo(20), purpose: 'AP replacement — Meeting Rooms', location: 'Bengaluru HQ · IT Storeroom', state: 'Rejected', approver: 'Manoj Reddy', verified: false },
  { id: 'MOV-8812', assetId: 'AST-2188', assetName: 'Dell UltraSharp 27"', direction: 'In', person: 'IT Support', department: 'IT Operations', at: daysAgo(1), returnedAt: daysAgo(1), purpose: 'Desk decommission', location: 'Bengaluru HQ · IT Storeroom', state: 'Returned', verified: true },
];

// ── Unknown tags ─────────────────────────────────────────────────────────────

export const unknownDetections: UnknownDetection[] = [
  { id: 'UNK-01', tagId: 'RFID-E28011606991', firstSeen: hoursAgo(14), lastSeen: minsAgo(9), zone: 'Secure Cage', facility: 'Hyderabad Central Warehouse', seenCount: 412, state: 'Investigating', suggestion: 'AST-1120 · Dell PowerEdge R660 (retired 2026-03)', suggestionConfidence: 71, reason: 'Tag reads consistently but no registry binding' },
  { id: 'UNK-02', tagId: 'BLE-C39A6F2B7712', firstSeen: hoursAgo(6), lastSeen: minsAgo(2), zone: 'Floor 3 Desks', facility: 'Bengaluru HQ', seenCount: 1180, state: 'New', suggestion: 'Contractor device — not enterprise-issued', suggestionConfidence: 44, reason: 'Unregistered beacon inside an occupied zone' },
  { id: 'UNK-03', tagId: 'RFID-E28011606447', firstSeen: minsAgo(38), lastSeen: minsAgo(3), zone: 'Loading Dock 4', facility: 'Hyderabad Central Warehouse', seenCount: 64, state: 'Matched', suggestion: 'Inbound PO-2209 line 3 — not yet received', suggestionConfidence: 92, reason: 'Detected before goods receipt was posted' },
  { id: 'UNK-04', tagId: 'UWB-ANCH-7781', firstSeen: daysAgo(3), lastSeen: hoursAgo(31), zone: 'Staging Bay', facility: 'Hyderabad Central Warehouse', seenCount: 88, state: 'Ignored', reason: 'Vendor demo tag left on site after evaluation' },
  { id: 'UNK-05', tagId: 'QR-AG-9982', firstSeen: hoursAgo(2), lastSeen: hoursAgo(2), zone: 'DC Storeroom', facility: 'Chennai Data Center', seenCount: 1, state: 'New', suggestion: 'Label printed but never bound to an asset', suggestionConfidence: 83, reason: 'Scanned label with no registry record' },
  { id: 'UNK-06', tagId: 'BLE-C39A6F2B8140', firstSeen: daysAgo(5), lastSeen: minsAgo(21), zone: 'Design Studio', facility: 'Bengaluru HQ', seenCount: 2940, state: 'Registered', suggestion: 'AST-2131 · iPad Air (Ops)', suggestionConfidence: 96, reason: 'Matched and bound during onboarding' },
];

// ── Inventory exceptions ─────────────────────────────────────────────────────

export const inventoryExceptions: InventoryException[] = [
  { id: 'EXC-01', kind: 'Missing', assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)', room: 'Main Exit & Reception', expectedRoom: 'IT Storeroom', facility: 'Bengaluru HQ', detectedAt: hoursAgo(52), ageHours: 52, severity: 'Critical', state: 'Assigned', owner: 'Tarun Fernandes', valueInr: 115000, recommendation: 'Escalate to Security — last detection was an unauthorised exit' },
  { id: 'EXC-02', kind: 'Missing', assetId: 'AST-2119', assetName: 'Dell OptiPlex 7010', room: 'Secure Cage', expectedRoom: 'Secure Cage', facility: 'Hyderabad Central Warehouse', detectedAt: hoursAgo(14), ageHours: 14, severity: 'High', state: 'Open', valueInr: 68000, recommendation: 'Re-scan shelf 3 — the cage reader has been offline 14h' },
  { id: 'EXC-03', kind: 'Unexpected', tagId: 'RFID-E28011606991', room: 'Secure Cage', facility: 'Hyderabad Central Warehouse', detectedAt: hoursAgo(14), ageHours: 14, severity: 'High', state: 'Assigned', owner: 'Tarun Fernandes', valueInr: 0, recommendation: 'Identify and register, or remove from the cage' },
  { id: 'EXC-04', kind: 'Misplaced', assetId: 'AST-2141', assetName: 'Cisco Catalyst 9300', room: 'Staging Bay', expectedRoom: 'Main Warehouse', facility: 'Hyderabad Central Warehouse', detectedAt: hoursAgo(6), ageHours: 6, severity: 'Medium', state: 'Open', valueInr: 420000, recommendation: 'Return to Main Warehouse bay 12 or update the home zone' },
  { id: 'EXC-05', kind: 'Duplicate', tagId: 'RFID-E28011606012', assetId: 'AST-1012', assetName: 'Zebra RFID Gateway G-4', room: 'Loading Dock 4', facility: 'Hyderabad Central Warehouse', detectedAt: hoursAgo(3), ageHours: 3, severity: 'Medium', state: 'Open', valueInr: 260000, recommendation: 'Two tags report the same identity — retire the cloned tag' },
  { id: 'EXC-06', kind: 'Ghost', assetId: 'AST-2166', assetName: 'Eaton 9PX UPS', room: 'DC Storeroom', expectedRoom: 'DC Storeroom', facility: 'Chennai Data Center', detectedAt: daysAgo(21), ageHours: 504, severity: 'Medium', state: 'Open', valueInr: 96000, recommendation: 'On the books but never once detected — verify it was ever delivered' },
  { id: 'EXC-07', kind: 'Unverified', assetId: 'AST-1013', assetName: 'HP LaserJet Enterprise M507', room: 'Print Station', expectedRoom: 'Print Station', facility: 'Bengaluru HQ', detectedAt: daysAgo(2), ageHours: 48, severity: 'Low', state: 'Open', valueInr: 62000, recommendation: 'Label-only asset — schedule a walk-by scan' },
  { id: 'EXC-08', kind: 'Missing', assetId: 'AST-2108', assetName: 'Lenovo ThinkPad T14s', room: 'Floor 3 Desks', expectedRoom: 'Floor 3 Desks', facility: 'Bengaluru HQ', detectedAt: daysAgo(12), ageHours: 288, severity: 'Medium', state: 'Resolved', owner: 'Sneha Iyer', valueInr: 102000, recommendation: 'Confirmed with staff member working remotely — closed' },
  { id: 'EXC-09', kind: 'Unexpected', tagId: 'RFID-E28011606447', room: 'Loading Dock 4', facility: 'Hyderabad Central Warehouse', detectedAt: minsAgo(38), ageHours: 1, severity: 'Low', state: 'Open', valueInr: 0, recommendation: 'Matches inbound PO-2209 — post the goods receipt' },
  { id: 'EXC-10', kind: 'Misplaced', assetId: 'AST-2172', assetName: 'APC Smart-UPS 5000', room: 'Goods Inward', expectedRoom: 'Utility Room', facility: 'Chennai Data Center', detectedAt: hoursAgo(30), ageHours: 30, severity: 'Medium', state: 'Assigned', owner: 'Storage Team', valueInr: 148000, recommendation: 'Move to Utility Room power row B and re-verify' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Alerts & incidents
// ─────────────────────────────────────────────────────────────────────────────

export const trackingAlerts: TrackingAlert[] = [
  {
    id: 'TRK-ALT-001', category: 'Missing Asset', priority: 'P1', state: 'Escalated',
    title: 'iPad Pro 12.9" has not been detected for 52 hours',
    summary: 'Last detection was an unauthorised exit at Bengaluru HQ reception. No signal since.',
    assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)',
    facility: 'Bengaluru HQ', location: 'Main Exit & Reception',
    raisedAt: hoursAgo(52), ackAt: hoursAgo(51), slaDueAt: hoursAgo(48), slaBreached: true,
    assignee: 'Tarun Fernandes', team: 'Security', incidentId: 'INC-4401', source: 'Presence Monitor',
    recommendation: 'Open a recovery search and notify the last known custodian',
    recommendationAction: 'Start recovery search', valueAtRiskInr: 115000,
    timeline: [
      { at: hoursAgo(52), actor: 'Presence Monitor', action: 'Alert raised', note: 'Exit detected with no check-out on file' },
      { at: hoursAgo(51), actor: 'Tarun Fernandes', action: 'Acknowledged' },
      { at: hoursAgo(48), actor: 'Automation', action: 'Escalated', note: 'SLA breached — no resolution in 4h' },
      { at: hoursAgo(20), actor: 'Tarun Fernandes', action: 'Comment', note: 'Custodian unreachable; reception CCTV pulled for review' },
    ],
  },
  {
    id: 'TRK-ALT-002', category: 'Tracking Failure', priority: 'P2', state: 'In Progress',
    title: 'Rack A42 tag stopped reporting inlet position',
    summary: 'Dell PowerEdge R740 resolves to the room but not to the rack — precision downgraded.',
    assetId: 'AST-1001', assetName: 'Dell PowerEdge R740 Server',
    facility: 'Chennai Data Center', location: 'Server Room Alpha · Rack A42',
    raisedAt: hoursAgo(6), ackAt: hoursAgo(5), slaDueAt: hoursAhead(2), slaBreached: false,
    assignee: 'Deepak Nair', team: 'IT Operations', source: 'Precision Monitor',
    recommendation: 'Replace the tag on the next data hall visit',
    recommendationAction: 'Raise tag replacement',
    timeline: [
      { at: hoursAgo(6), actor: 'Precision Monitor', action: 'Alert raised' },
      { at: hoursAgo(5), actor: 'Deepak Nair', action: 'Acknowledged' },
      { at: hoursAgo(4), actor: 'Deepak Nair', action: 'Assigned', note: 'Scheduled with the Thursday DC visit' },
    ],
  },
  {
    id: 'TRK-ALT-003', category: 'Reader Offline', priority: 'P1', state: 'Assigned',
    title: 'Secure Cage reader offline for 14 hours',
    summary: 'The cage cannot verify its own contents. 210 assets are currently unverifiable.',
    deviceId: 'DEV-RD-09',
    facility: 'Hyderabad Central Warehouse', location: 'Secure Cage',
    raisedAt: hoursAgo(14), ackAt: hoursAgo(13), slaDueAt: hoursAgo(12), slaBreached: true,
    assignee: 'Deepak Nair', team: 'IoT Platform', incidentId: 'INC-4402', source: 'Device Health',
    recommendation: 'Dispatch a technician — power and uplink both unreachable',
    recommendationAction: 'Dispatch technician', valueAtRiskInr: 8400000,
    timeline: [
      { at: hoursAgo(14), actor: 'Device Health', action: 'Alert raised', note: 'No heartbeat for 30 min' },
      { at: hoursAgo(13), actor: 'Deepak Nair', action: 'Acknowledged' },
      { at: hoursAgo(12), actor: 'Automation', action: 'Escalated', note: 'SLA breached' },
      { at: hoursAgo(11), actor: 'Deepak Nair', action: 'Assigned', note: 'Site visit booked for 14:00 IST' },
    ],
  },
  {
    id: 'TRK-ALT-004', category: 'Unauthorized Movement', priority: 'P1', state: 'Escalated',
    title: 'Asset left Bengaluru HQ without a check-out',
    summary: 'Exit policy on Main Exit & Reception was violated at 05:00 IST.',
    assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)',
    facility: 'Bengaluru HQ', location: 'Main Exit & Reception',
    raisedAt: hoursAgo(52), ackAt: hoursAgo(52), slaDueAt: hoursAgo(51), slaBreached: true,
    assignee: 'Tarun Fernandes', team: 'Security', incidentId: 'INC-4401', source: 'Zone Policy',
    recommendation: 'Link to the missing-asset investigation and pull door access logs',
    recommendationAction: 'Attach to incident',
    timeline: [
      { at: hoursAgo(52), actor: 'Zone Policy', action: 'Alert raised' },
      { at: hoursAgo(52), actor: 'Tarun Fernandes', action: 'Acknowledged' },
      { at: hoursAgo(52), actor: 'Automation', action: 'Linked to INC-4401' },
    ],
  },
  {
    id: 'TRK-ALT-005', category: 'Inventory Mismatch', priority: 'P2', state: 'New',
    title: 'Secure Cage count is 4 short of expected',
    summary: 'Audit AUD-2041 detected 206 of 210 expected assets, plus 1 unregistered tag.',
    facility: 'Hyderabad Central Warehouse', location: 'Secure Cage',
    raisedAt: hoursAgo(13), slaDueAt: hoursAhead(11), slaBreached: false,
    team: 'Inventory', source: 'Audit Engine',
    recommendation: 'Re-count after the cage reader is restored',
    recommendationAction: 'Schedule re-count', valueAtRiskInr: 272000,
    timeline: [{ at: hoursAgo(13), actor: 'Audit Engine', action: 'Alert raised' }],
  },
  {
    id: 'TRK-ALT-006', category: 'Unknown Tag', priority: 'P3', state: 'Acknowledged',
    title: 'Unregistered tag reading inside the Secure Cage',
    summary: 'RFID-E28011606991 has been read 412 times in 14h with no registry binding.',
    facility: 'Hyderabad Central Warehouse', location: 'Secure Cage',
    raisedAt: hoursAgo(14), ackAt: hoursAgo(9), slaDueAt: daysAhead(1), slaBreached: false,
    assignee: 'Tarun Fernandes', team: 'Inventory', source: 'Detection Matcher',
    recommendation: 'Best match is a unit retired in March — confirm and re-register or remove',
    recommendationAction: 'Open match review',
    timeline: [
      { at: hoursAgo(14), actor: 'Detection Matcher', action: 'Alert raised' },
      { at: hoursAgo(9), actor: 'Tarun Fernandes', action: 'Acknowledged' },
    ],
  },
  {
    id: 'TRK-ALT-007', category: 'Gateway Offline', priority: 'P2', state: 'Acknowledged',
    title: 'Bengaluru Floor 3 anchor cluster degraded',
    summary: 'Uptime dropped to 94.2%. Precision on Floor 3 has fallen back to room-level.',
    deviceId: 'DEV-AN-05',
    facility: 'Bengaluru HQ', location: 'Floor 3 Desks',
    raisedAt: hoursAgo(9), ackAt: hoursAgo(8), slaDueAt: hoursAhead(3), slaBreached: false,
    assignee: 'Deepak Nair', team: 'IoT Platform', source: 'Device Health',
    recommendation: 'Firmware v2.3.7 is two releases behind — schedule the upgrade',
    recommendationAction: 'Add to firmware campaign',
    timeline: [
      { at: hoursAgo(9), actor: 'Device Health', action: 'Alert raised' },
      { at: hoursAgo(8), actor: 'Deepak Nair', action: 'Acknowledged' },
    ],
  },
  {
    id: 'TRK-ALT-008', category: 'Battery Low', priority: 'P3', state: 'Assigned',
    title: 'Tag battery at 17% on Synology RS2418+ NAS',
    summary: 'Estimated 6 days of life left. The asset will go dark without a swap.',
    assetId: 'AST-1009', assetName: 'Synology RS2418+ NAS', deviceId: 'DEV-TG-09',
    facility: 'Chennai Data Center', location: 'Server Room Beta · Rack B08',
    raisedAt: hoursAgo(11), ackAt: hoursAgo(10), slaDueAt: daysAhead(3), slaBreached: false,
    assignee: 'Storage Team', team: 'IoT Platform', source: 'Device Health',
    recommendation: 'Batch with the 6 other low-battery tags in Chennai DC',
    recommendationAction: 'Batch battery swap',
    timeline: [
      { at: hoursAgo(11), actor: 'Device Health', action: 'Alert raised' },
      { at: hoursAgo(10), actor: 'Deepak Nair', action: 'Acknowledged' },
      { at: hoursAgo(10), actor: 'Deepak Nair', action: 'Assigned', note: 'Storage Team to handle on next rack visit' },
    ],
  },
  {
    id: 'TRK-ALT-009', category: 'Geofence Violation', priority: 'P2', state: 'Resolved',
    title: 'After-hours movement detected in the Secure Cage',
    summary: 'Movement at 02:14 IST outside the authorised 08:00–20:00 window.',
    facility: 'Hyderabad Central Warehouse', location: 'Secure Cage',
    raisedAt: daysAgo(1), ackAt: daysAgo(1), resolvedAt: hoursAgo(20), slaDueAt: daysAgo(1), slaBreached: false,
    assignee: 'Tarun Fernandes', team: 'Security', source: 'Zone Policy',
    recommendation: 'Confirmed as the approved overnight stock move — no action',
    recommendationAction: 'View resolution',
    timeline: [
      { at: daysAgo(1), actor: 'Zone Policy', action: 'Alert raised' },
      { at: daysAgo(1), actor: 'Tarun Fernandes', action: 'Acknowledged' },
      { at: hoursAgo(20), actor: 'Tarun Fernandes', action: 'Resolved', note: 'Matched to approved move order MO-771' },
    ],
  },
  {
    id: 'TRK-ALT-010', category: 'Duplicate Tag', priority: 'P2', state: 'New',
    title: 'Two tags reporting the same identity',
    summary: 'RFID-E28011606012 is being read at Loading Dock 4 and Staging Bay simultaneously.',
    assetId: 'AST-1012', assetName: 'Zebra RFID Gateway G-4',
    facility: 'Hyderabad Central Warehouse', location: 'Loading Dock 4',
    raisedAt: hoursAgo(3), slaDueAt: hoursAhead(21), slaBreached: false,
    team: 'IoT Platform', source: 'Detection Matcher',
    recommendation: 'Retire the cloned tag and re-bind the asset to a fresh identity',
    recommendationAction: 'Start tag replacement',
    timeline: [{ at: hoursAgo(3), actor: 'Detection Matcher', action: 'Alert raised' }],
  },
  {
    id: 'TRK-ALT-011', category: 'Asset Removed', priority: 'P2', state: 'In Progress',
    title: 'Switch removed from Rack B08 without a work order',
    summary: 'Rack monitoring saw slot 22 empty with no maintenance activity on file.',
    assetId: 'AST-1009', assetName: 'Synology RS2418+ NAS',
    facility: 'Chennai Data Center', location: 'Server Room Beta · Rack B08',
    raisedAt: hoursAgo(7), ackAt: hoursAgo(6), slaDueAt: hoursAhead(1), slaBreached: false,
    assignee: 'Storage Team', team: 'IT Operations', source: 'Rack Monitor',
    recommendation: 'Confirm against WO-5004 — the unit may be on the bench',
    recommendationAction: 'Check work orders',
    timeline: [
      { at: hoursAgo(7), actor: 'Rack Monitor', action: 'Alert raised' },
      { at: hoursAgo(6), actor: 'Manoj Reddy', action: 'Acknowledged' },
      { at: hoursAgo(6), actor: 'Manoj Reddy', action: 'Assigned' },
    ],
  },
  {
    id: 'TRK-ALT-012', category: 'Battery Low', priority: 'P3', state: 'New',
    title: 'Spare tag battery at 14%',
    summary: 'Unassigned UWB tag in the Staging Bay is close to end of life.',
    deviceId: 'DEV-TG-20',
    facility: 'Hyderabad Central Warehouse', location: 'Staging Bay',
    raisedAt: hoursAgo(3), slaDueAt: daysAhead(4), slaBreached: false,
    team: 'IoT Platform', source: 'Device Health',
    recommendation: 'Retire from the spare pool rather than swapping the cell',
    recommendationAction: 'Retire device',
    timeline: [{ at: hoursAgo(3), actor: 'Device Health', action: 'Alert raised' }],
  },
  {
    id: 'TRK-ALT-013', category: 'Tracking Failure', priority: 'P3', state: 'New',
    title: 'Coverage gap on the Tool Room ▸ Exit corridor',
    summary: '6 journeys in the last 24h show a blind spot of 40–50 minutes on this route.',
    facility: 'Bengaluru HQ', location: 'Corridor — Tool Room to Main Exit',
    raisedAt: hoursAgo(4), slaDueAt: daysAhead(2), slaBreached: false,
    team: 'IoT Platform', source: 'Coverage Analyser',
    recommendation: 'One additional reader would close the gap for ₹42,000',
    recommendationAction: 'Plan coverage fix',
    timeline: [{ at: hoursAgo(4), actor: 'Coverage Analyser', action: 'Alert raised' }],
  },
  {
    id: 'TRK-ALT-014', category: 'Inventory Mismatch', priority: 'P3', state: 'Acknowledged',
    title: 'Dock 4 short by 4 units against the manifest',
    summary: 'Inbound reconciliation is 79% complete and already 4 units behind.',
    facility: 'Hyderabad Central Warehouse', location: 'Loading Dock 4',
    raisedAt: minsAgo(38), ackAt: minsAgo(20), slaDueAt: hoursAhead(4), slaBreached: false,
    assignee: 'Deepak Nair', team: 'Inventory', source: 'Audit Engine',
    recommendation: 'Hold the manifest until the sweep completes',
    recommendationAction: 'Open audit',
    timeline: [
      { at: minsAgo(38), actor: 'Audit Engine', action: 'Alert raised' },
      { at: minsAgo(20), actor: 'Deepak Nair', action: 'Acknowledged' },
    ],
  },
  {
    id: 'TRK-ALT-015', category: 'Unknown Tag', priority: 'P4', state: 'Closed',
    title: 'Unregistered beacon in the Design Studio',
    summary: 'Matched to AST-2131 during onboarding and bound successfully.',
    facility: 'Bengaluru HQ', location: 'Design Studio',
    raisedAt: daysAgo(5), ackAt: daysAgo(5), resolvedAt: daysAgo(4), slaDueAt: daysAgo(4), slaBreached: false,
    assignee: 'Sneha Iyer', team: 'Inventory', source: 'Detection Matcher',
    recommendation: 'No further action',
    recommendationAction: 'View resolution',
    timeline: [
      { at: daysAgo(5), actor: 'Detection Matcher', action: 'Alert raised' },
      { at: daysAgo(4), actor: 'Sneha Iyer', action: 'Resolved', note: 'Bound to AST-2131' },
    ],
  },
  {
    id: 'TRK-ALT-016', category: 'Missing Asset', priority: 'P2', state: 'Assigned',
    title: 'OptiPlex 7010 not detected in the Secure Cage',
    summary: 'Expected on shelf 3 but absent from the last two verification passes.',
    assetId: 'AST-2119', assetName: 'Dell OptiPlex 7010',
    facility: 'Hyderabad Central Warehouse', location: 'Secure Cage',
    raisedAt: hoursAgo(14), ackAt: hoursAgo(12), slaDueAt: hoursAhead(10), slaBreached: false,
    assignee: 'Tarun Fernandes', team: 'Inventory', incidentId: 'INC-4402', source: 'Presence Monitor',
    recommendation: 'Blocked on the cage reader — re-verify once DEV-RD-09 is back',
    recommendationAction: 'Re-verify room', valueAtRiskInr: 68000,
    timeline: [
      { at: hoursAgo(14), actor: 'Presence Monitor', action: 'Alert raised' },
      { at: hoursAgo(12), actor: 'Tarun Fernandes', action: 'Assigned' },
    ],
  },
  {
    id: 'TRK-ALT-017', category: 'Geofence Violation', priority: 'P3', state: 'New',
    title: 'Dwell limit exceeded in the Staging Bay',
    summary: '3 pallets have been staged for over 8 hours against a 480-minute limit.',
    facility: 'Hyderabad Central Warehouse', location: 'Staging Bay',
    raisedAt: hoursAgo(2), slaDueAt: hoursAhead(22), slaBreached: false,
    team: 'Inventory', source: 'Zone Policy',
    recommendation: 'Route to outbound or move back to the Main Warehouse',
    recommendationAction: 'Open zone',
    timeline: [{ at: hoursAgo(2), actor: 'Zone Policy', action: 'Alert raised' }],
  },
  {
    id: 'TRK-ALT-018', category: 'Gateway Offline', priority: 'P4', state: 'Resolved',
    title: 'Print Station scan point briefly unreachable',
    summary: 'Recovered on its own after a 6-minute network blip.',
    deviceId: 'DEV-SS-08',
    facility: 'Bengaluru HQ', location: 'Print Station',
    raisedAt: hoursAgo(26), resolvedAt: hoursAgo(26), slaDueAt: hoursAgo(24), slaBreached: false,
    team: 'IoT Platform', source: 'Device Health',
    recommendation: 'Self-healed — no action',
    recommendationAction: 'View resolution',
    timeline: [
      { at: hoursAgo(26), actor: 'Device Health', action: 'Alert raised' },
      { at: hoursAgo(26), actor: 'Automation', action: 'Auto-resolved', note: 'Heartbeat restored within the grace window' },
    ],
  },
];

export const alertById = (id: string) => trackingAlerts.find((a) => a.id === id);

export const OPEN_ALERT_STATES: TrackingAlert['state'][] = ['New', 'Acknowledged', 'Assigned', 'In Progress', 'Escalated'];
export const isOpenAlert = (a: TrackingAlert) => OPEN_ALERT_STATES.includes(a.state);

export function alertsForFacility(slug: string): TrackingAlert[] {
  if (slug === 'all') return trackingAlerts;
  const f = facilityBySlug(slug);
  return f ? trackingAlerts.filter((a) => a.facility === f.name) : [];
}

export const openTrackingAlertCount = trackingAlerts.filter(isOpenAlert).length;

export const incidents: Incident[] = [
  {
    id: 'INC-4401', title: 'Suspected theft — Field Ops iPad', severity: 'Sev1', state: 'Investigating',
    alertIds: ['TRK-ALT-001', 'TRK-ALT-004'], openedAt: hoursAgo(52), commander: 'Tarun Fernandes',
    facility: 'Bengaluru HQ', assetsAffected: 1, valueAtRiskInr: 115000,
    summary: 'An asset left the building without a check-out and has not been detected since. Custodian is unreachable and CCTV review is in progress.',
    nextAction: 'Complete CCTV review and file a police report if unrecovered by 18:00 IST',
  },
  {
    id: 'INC-4402', title: 'Secure Cage cannot verify its contents', severity: 'Sev2', state: 'Contained',
    alertIds: ['TRK-ALT-003', 'TRK-ALT-016'], openedAt: hoursAgo(14), commander: 'Deepak Nair',
    facility: 'Hyderabad Central Warehouse', assetsAffected: 210, valueAtRiskInr: 8400000,
    summary: 'The cage reader lost power and uplink. 210 assets are unverifiable and one unit is already flagged missing. Physical access has been locked down pending restoration.',
    nextAction: 'Technician on site at 14:00 IST — restore power, then run a full re-count',
  },
  {
    id: 'INC-4403', title: 'Bengaluru Floor 3 precision degradation', severity: 'Sev3', state: 'Open',
    alertIds: ['TRK-ALT-007', 'TRK-ALT-013'], openedAt: hoursAgo(9), commander: 'Deepak Nair',
    facility: 'Bengaluru HQ', assetsAffected: 1310, valueAtRiskInr: 0,
    summary: 'Anchor degradation plus a corridor blind spot have dropped Floor 3 from precise to room-level positioning. No assets lost, but journeys show gaps.',
    nextAction: 'Bundle the firmware upgrade with the proposed corridor reader',
  },
  {
    id: 'INC-4404', title: 'Q1 stock reconciliation variance', severity: 'Sev3', state: 'Resolved',
    alertIds: [], openedAt: daysAgo(12), resolvedAt: daysAgo(9), commander: 'Sneha Iyer',
    facility: 'Bengaluru HQ', assetsAffected: 14, valueAtRiskInr: 1420000,
    summary: '14 endpoints missing from a desk spot-check were confirmed with remote-working staff.',
    nextAction: 'Closed — home-zone policy updated for remote allocations',
  },
];

export const incidentById = (id: string) => incidents.find((i) => i.id === id);

export const automationRules: AutomationRule[] = [
  { id: 'TRK-RULE-01', name: 'Asset leaves a site without a check-out', category: 'Unauthorized Movement', when: 'Exit detected on a zone with "No exit without check-out" and no open check-out', then: ['Raise P1', 'Notify Security on SMS + in-app', 'Open an incident', 'Lock the custodian record'], priority: 'P1', assignTeam: 'Security', escalateAfterMin: 60, enabled: true, firedToday: 1, suppressedToday: 0 },
  { id: 'TRK-RULE-02', name: 'Critical asset not detected for 24 hours', category: 'Missing Asset', when: 'lastSeen older than 24h and criticality is High or Critical', then: ['Raise P1', 'Assign to Security', 'Start a recovery search'], priority: 'P1', assignTeam: 'Security', escalateAfterMin: 240, enabled: true, firedToday: 2, suppressedToday: 4 },
  { id: 'TRK-RULE-03', name: 'Room count differs from expected', category: 'Inventory Mismatch', when: 'A verification pass detects fewer assets than expected', then: ['Raise P2', 'Assign to Inventory', 'Schedule a re-count'], priority: 'P2', assignTeam: 'Inventory', escalateAfterMin: 720, enabled: true, firedToday: 2, suppressedToday: 1 },
  { id: 'TRK-RULE-04', name: 'Unregistered tag seen more than 50 times', category: 'Unknown Tag', when: 'An unmatched identity is read 50+ times in a 12h window', then: ['Raise P3', 'Run the registry matcher', 'Queue for match review'], priority: 'P3', assignTeam: 'Inventory', escalateAfterMin: 1440, enabled: true, firedToday: 1, suppressedToday: 11 },
  { id: 'TRK-RULE-05', name: 'Reader or gateway stops reporting', category: 'Reader Offline', when: 'No heartbeat for 30 minutes', then: ['Raise P1 if the zone is armed, else P2', 'Assign to IoT Platform', 'Mark dependent zones unverifiable'], priority: 'P1', assignTeam: 'IoT Platform', escalateAfterMin: 120, enabled: true, firedToday: 1, suppressedToday: 2 },
  { id: 'TRK-RULE-06', name: 'Tag battery below 20%', category: 'Battery Low', when: 'batteryPct < 20 on a bound tag', then: ['Raise P3', 'Batch into the next swap round'], priority: 'P3', assignTeam: 'IoT Platform', escalateAfterMin: 4320, enabled: true, firedToday: 2, suppressedToday: 6 },
  { id: 'TRK-RULE-07', name: 'Two tags claim one identity', category: 'Duplicate Tag', when: 'The same identity is read in two zones within 60 seconds', then: ['Raise P2', 'Suspend the identity', 'Queue a tag replacement'], priority: 'P2', assignTeam: 'IoT Platform', escalateAfterMin: 720, enabled: true, firedToday: 1, suppressedToday: 0 },
  { id: 'TRK-RULE-08', name: 'Rack slot empties with no work order', category: 'Asset Removed', when: 'A monitored rack slot changes to empty and no work order is open', then: ['Raise P2', 'Assign to IT Operations', 'Attach the rack snapshot'], priority: 'P2', assignTeam: 'IT Operations', escalateAfterMin: 240, enabled: true, firedToday: 1, suppressedToday: 0 },
  { id: 'TRK-RULE-09', name: 'Dwell limit exceeded', category: 'Geofence Violation', when: 'An asset stays in a dwell-limited zone past its limit', then: ['Raise P3', 'Notify the zone custodian'], priority: 'P3', assignTeam: 'Inventory', escalateAfterMin: 1440, enabled: true, firedToday: 1, suppressedToday: 3 },
  { id: 'TRK-RULE-10', name: 'Movement outside working hours', category: 'Geofence Violation', when: 'Movement detected in an armed zone outside 08:00–20:00 IST', then: ['Raise P2', 'Notify Security', 'Capture a 5-minute detection window'], priority: 'P2', assignTeam: 'Security', escalateAfterMin: 60, enabled: true, firedToday: 0, suppressedToday: 0 },
  { id: 'TRK-RULE-11', name: 'Journey shows a coverage gap', category: 'Tracking Failure', when: '3+ journeys share a blind spot longer than 20 minutes', then: ['Raise P3', 'Assign to IoT Platform', 'Add to the coverage plan'], priority: 'P3', assignTeam: 'IoT Platform', escalateAfterMin: 2880, enabled: true, firedToday: 1, suppressedToday: 0 },
  { id: 'TRK-RULE-12', name: 'Check-out overdue by 48 hours', category: 'Missing Asset', when: 'An open check-out passes its due-back date by 48h', then: ['Raise P3', 'Email the holder and their manager'], priority: 'P3', assignTeam: 'Inventory', escalateAfterMin: 2880, enabled: false, firedToday: 0, suppressedToday: 0 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tracking infrastructure
// ─────────────────────────────────────────────────────────────────────────────

const DEVICE_NAME: Record<DeviceRole, string> = {
  Tag: 'Asset Tag', Reader: 'Reader', Gateway: 'Gateway', Anchor: 'Anchor',
  'Scan Station': 'Scan Station', Sensor: 'Environmental Sensor',
};

function buildDevices(): TrackingDevice[] {
  const out: TrackingDevice[] = [];

  // ── Hand-authored infrastructure (the ones alerts and incidents point at) ──
  out.push(
    { id: 'DEV-RD-01', name: 'Server Room Alpha Reader', role: 'Reader', state: 'Healthy', technology: 'RFID', facility: 'Chennai Data Center', zone: 'Server Room Alpha', firmware: 'v4.8.2', firmwareLatest: 'v4.8.2', uptimePct: 99.9, signalPct: 96, serves: 142, lastSeen: minsAgo(1), installedAt: daysAgo(680), ip: '10.4.1.11', diagnostics: [{ label: 'Read rate', value: '2,140 /min', state: 'ok' }, { label: 'Uplink latency', value: '18 ms', state: 'ok' }, { label: 'Antenna ports', value: '4 of 4 active', state: 'ok' }] },
    { id: 'DEV-RD-09', name: 'Secure Cage Reader', role: 'Reader', state: 'Offline', technology: 'RFID', facility: 'Hyderabad Central Warehouse', zone: 'Secure Cage', firmware: 'v4.6.0', firmwareLatest: 'v4.8.2', uptimePct: 81.3, signalPct: 0, serves: 0, lastSeen: hoursAgo(14), installedAt: daysAgo(1120), replaceBy: daysAhead(45), ip: '10.6.1.29', diagnostics: [{ label: 'Power', value: 'No response', state: 'bad' }, { label: 'Uplink', value: 'Unreachable', state: 'bad' }, { label: 'Firmware', value: '2 releases behind', state: 'warn' }] },
    { id: 'DEV-RD-03', name: 'Dock 4 Portal Reader', role: 'Reader', state: 'Healthy', technology: 'RFID', facility: 'Hyderabad Central Warehouse', zone: 'Loading Dock 4', firmware: 'v4.8.2', firmwareLatest: 'v4.8.2', uptimePct: 99.4, signalPct: 93, serves: 96, lastSeen: minsAgo(1), installedAt: daysAgo(540), ip: '10.6.1.21', diagnostics: [{ label: 'Read rate', value: '1,860 /min', state: 'ok' }, { label: 'Portal beam', value: 'Aligned', state: 'ok' }, { label: 'Duplicate reads', value: '1.2% (elevated)', state: 'warn' }] },
    { id: 'DEV-GW-02', name: 'Bengaluru HQ Gateway', role: 'Gateway', state: 'Healthy', technology: 'BLE', facility: 'Bengaluru HQ', zone: 'Lobby', firmware: 'v3.2.0', firmwareLatest: 'v3.2.0', uptimePct: 99.7, signalPct: 91, serves: 118, lastSeen: minsAgo(1), installedAt: daysAgo(400), ip: '10.4.1.12', diagnostics: [{ label: 'Connected tags', value: '118', state: 'ok' }, { label: 'Packet loss', value: '0.3%', state: 'ok' }, { label: 'Uplink latency', value: '24 ms', state: 'ok' }] },
    { id: 'DEV-AN-05', name: 'Floor 3 Anchor Cluster', role: 'Anchor', state: 'Degraded', technology: 'UWB', facility: 'Bengaluru HQ', zone: 'Floor 3 Desks', firmware: 'v2.3.7', firmwareLatest: 'v2.4.1', uptimePct: 94.2, signalPct: 62, serves: 28, lastSeen: minsAgo(9), installedAt: daysAgo(310), ip: '10.5.3.14', diagnostics: [{ label: 'Anchors reporting', value: '5 of 8', state: 'bad' }, { label: 'Ranging error', value: '±1.8 m (target ±0.3 m)', state: 'warn' }, { label: 'Firmware', value: 'v2.3.7 — upgrade available', state: 'warn' }] },
    { id: 'DEV-AN-04', name: 'Warehouse Anchor Cluster', role: 'Anchor', state: 'Healthy', technology: 'UWB', facility: 'Hyderabad Central Warehouse', zone: 'Main Warehouse', firmware: 'v2.4.1', firmwareLatest: 'v2.4.1', uptimePct: 99.1, signalPct: 88, serves: 64, lastSeen: minsAgo(2), installedAt: daysAgo(360), ip: '10.6.1.22', diagnostics: [{ label: 'Anchors reporting', value: '12 of 12', state: 'ok' }, { label: 'Ranging error', value: '±0.28 m', state: 'ok' }, { label: 'Clock sync', value: 'Locked', state: 'ok' }] },
    { id: 'DEV-GW-06', name: 'Chennai DC Sensor Gateway', role: 'Gateway', state: 'Healthy', technology: 'LoRaWAN', facility: 'Chennai Data Center', zone: 'Utility Room', firmware: 'v1.9.4', firmwareLatest: 'v1.9.4', uptimePct: 99.8, signalPct: 94, serves: 37, lastSeen: minsAgo(3), installedAt: daysAgo(500), ip: '10.4.1.31', diagnostics: [{ label: 'Connected sensors', value: '37', state: 'ok' }, { label: 'Spreading factor', value: 'SF7 (optimal)', state: 'ok' }, { label: 'Duty cycle', value: '4.1%', state: 'ok' }] },
    { id: 'DEV-GW-07', name: 'In-Transit Bridge', role: 'Gateway', state: 'Healthy', technology: 'GPS', facility: 'Hyderabad Central Warehouse', zone: 'Outbound Yard', firmware: 'v5.1.0', firmwareLatest: 'v5.1.0', uptimePct: 98.6, signalPct: 74, serves: 12, lastSeen: minsAgo(6), installedAt: daysAgo(220), ip: '10.9.0.7', diagnostics: [{ label: 'Satellites', value: '9 locked', state: 'ok' }, { label: 'Cellular', value: 'LTE −87 dBm', state: 'ok' }, { label: 'In-transit assets', value: '12', state: 'ok' }] },
    { id: 'DEV-SS-08', name: 'IT Storeroom Scan Station', role: 'Scan Station', state: 'Healthy', technology: 'QR', facility: 'Bengaluru HQ', zone: 'IT Storeroom', firmware: 'v3.0.2', firmwareLatest: 'v3.0.2', uptimePct: 99.9, signalPct: 100, serves: 210, lastSeen: minsAgo(1), installedAt: daysAgo(280), ip: '10.5.1.44', diagnostics: [{ label: 'Scans today', value: '184', state: 'ok' }, { label: 'Failed decodes', value: '0.4%', state: 'ok' }, { label: 'Kiosk session', value: 'Idle', state: 'ok' }] },
    { id: 'DEV-TG-09', name: 'Synology NAS Tag', role: 'Tag', state: 'Degraded', technology: 'UWB', facility: 'Chennai Data Center', zone: 'Server Room Beta', firmware: 'v2.3.7', firmwareLatest: 'v2.4.1', uptimePct: 96.4, batteryPct: 17, signalPct: 58, serves: 1, parentId: 'DEV-AN-05', lastSeen: minsAgo(14), installedAt: daysAgo(410), replaceBy: daysAhead(6), assetId: 'AST-1009', assetName: 'Synology RS2418+ NAS', diagnostics: [{ label: 'Battery', value: '17% — ~6 days left', state: 'bad' }, { label: 'Signal', value: '58%', state: 'warn' }, { label: 'Firmware', value: 'v2.3.7 — upgrade available', state: 'warn' }] },
    { id: 'DEV-TG-20', name: 'Spare Tag (unassigned)', role: 'Tag', state: 'Degraded', technology: 'UWB', facility: 'Hyderabad Central Warehouse', zone: 'Staging Bay', firmware: 'v2.3.7', firmwareLatest: 'v2.4.1', uptimePct: 92.0, batteryPct: 14, signalPct: 41, serves: 0, parentId: 'DEV-AN-04', lastSeen: hoursAgo(3), installedAt: daysAgo(390), replaceBy: daysAhead(4), diagnostics: [{ label: 'Battery', value: '14% — retire', state: 'bad' }, { label: 'Binding', value: 'Unassigned', state: 'warn' }, { label: 'Signal', value: '41%', state: 'warn' }] },
    { id: 'DEV-RD-11', name: 'Goods Inward Reader', role: 'Reader', state: 'Unprovisioned', technology: 'RFID', facility: 'Chennai Data Center', zone: 'Goods Inward', firmware: 'v4.8.2', firmwareLatest: 'v4.8.2', uptimePct: 0, signalPct: 0, serves: 0, lastSeen: daysAgo(2), installedAt: daysAgo(2), diagnostics: [{ label: 'Provisioning', value: 'Awaiting site assignment', state: 'warn' }, { label: 'Power', value: 'Connected', state: 'ok' }, { label: 'Uplink', value: 'Connected', state: 'ok' }] },
  );

  // ── Fleet fill: tags bound to the surrounding estate, plus sensors ─────────
  const r = rng(0x4445_5601);
  const parents = out.filter((d) => d.role === 'Gateway' || d.role === 'Anchor' || d.role === 'Reader');
  for (let i = 0; i < 64; i++) {
    const zone = pick(r, trackedZones);
    const roll = r();
    const role: DeviceRole = roll > 0.86 ? 'Sensor' : 'Tag';
    const parent = parents.filter((p) => p.facility === zone.facility)[0] ?? parents[0];
    const tech = role === 'Sensor' ? 'LoRaWAN' : pick(r, ['RFID', 'BLE', 'UWB', 'QR'] as const);
    const passive = tech === 'RFID' || tech === 'QR';
    const battery = passive ? undefined : between(r, 8, 100);
    const stateRoll = r();
    const state = stateRoll > 0.94 ? 'Offline' : stateRoll > 0.84 || (battery !== undefined && battery < 20) ? 'Degraded' : 'Healthy';
    out.push({
      id: `DEV-${role === 'Sensor' ? 'SN' : 'TG'}-${String(100 + i)}`,
      name: `${zone.name} ${DEVICE_NAME[role]} ${String(i + 1).padStart(2, '0')}`,
      role,
      state,
      technology: tech,
      facility: zone.facility,
      zone: zone.name,
      firmware: pick(r, ['v2.3.7', 'v2.4.1', 'v3.2.0', 'v1.9.4', 'v4.8.2']),
      firmwareLatest: role === 'Sensor' ? 'v1.9.4' : 'v2.4.1',
      uptimePct: round1(90 + r() * 10),
      batteryPct: battery,
      signalPct: state === 'Offline' ? 0 : between(r, 42, 99),
      serves: role === 'Sensor' ? 0 : 1,
      parentId: parent?.id,
      lastSeen: state === 'Offline' ? hoursAgo(between(r, 3, 40)) : minsAgo(between(r, 1, 120)),
      installedAt: daysAgo(between(r, 40, 900)),
      replaceBy: battery !== undefined && battery < 25 ? daysAhead(between(r, 3, 30)) : undefined,
      diagnostics: [
        { label: 'Battery', value: battery === undefined ? 'Passive — none' : `${battery}%`, state: battery === undefined ? 'ok' : battery < 20 ? 'bad' : battery < 40 ? 'warn' : 'ok' },
        { label: 'Signal', value: state === 'Offline' ? 'No signal' : `${between(r, 42, 99)}%`, state: state === 'Offline' ? 'bad' : 'ok' },
        { label: 'Last heard', value: state === 'Offline' ? 'Hours ago' : 'Minutes ago', state: state === 'Offline' ? 'bad' : 'ok' },
      ],
    });
  }
  return out;
}

export const trackingDevices: TrackingDevice[] = buildDevices();
export const deviceById = (id: string) => trackingDevices.find((d) => d.id === id);
export function devicesForFacility(slug: string): TrackingDevice[] {
  if (slug === 'all') return trackingDevices;
  const f = facilityBySlug(slug);
  return f ? trackingDevices.filter((d) => d.facility === f.name) : [];
}
export const childDevices = (parentId: string): TrackingDevice[] =>
  trackingDevices.filter((d) => d.parentId === parentId);

export const coverageCells: CoverageCell[] = trackedZones.map((z) => {
  const devices = trackingDevices.filter((d) => d.zone === z.name && d.role !== 'Tag').length;
  const blind = z.coverage >= 95 ? 0 : z.coverage >= 88 ? 1 : z.coverage >= 80 ? 2 : 3;
  return {
    zoneId: z.id,
    zone: z.name,
    facility: z.facility,
    coverage: z.coverage,
    devices,
    blindSpots: blind,
    assetsAtRisk: Math.round((z.expected * (100 - z.coverage)) / 100),
  };
});

export const firmwareCampaigns: FirmwareCampaign[] = [
  { id: 'FW-01', name: 'Anchor firmware v2.4.1 rollout', targetRole: 'Anchor', fromVersion: 'v2.3.7', toVersion: 'v2.4.1', total: 20, done: 12, failed: 1, state: 'Running', window: 'Nightly 01:00–04:00 IST', owner: 'Deepak Nair' },
  { id: 'FW-02', name: 'Reader security patch v4.8.2', targetRole: 'Reader', fromVersion: 'v4.6.0', toVersion: 'v4.8.2', total: 9, done: 8, failed: 0, state: 'Paused', window: 'Blocked on DEV-RD-09 being offline', owner: 'Deepak Nair' },
  { id: 'FW-03', name: 'Sensor gateway v1.9.4', targetRole: 'Gateway', fromVersion: 'v1.9.1', toVersion: 'v1.9.4', total: 4, done: 4, failed: 0, state: 'Complete', window: 'Completed 12 Jul', owner: 'IoT Platform' },
  { id: 'FW-04', name: 'Tag firmware v2.4.1 — Chennai batch', targetRole: 'Tag', fromVersion: 'v2.3.7', toVersion: 'v2.4.1', total: 46, done: 0, failed: 0, state: 'Scheduled', window: 'Starts 26 Jul, 01:00 IST', owner: 'IoT Platform' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Activity feed
// ─────────────────────────────────────────────────────────────────────────────

export const trackingEvents: TrackingEvent[] = [
  { id: 'TEV-01', at: minsAgo(2), kind: 'Detection', title: 'Unregistered tag read in the Secure Cage', detail: 'RFID-E28011606991 · 412th read in 14h', zone: 'Secure Cage', actor: 'Detection Matcher', tone: 'warn' },
  { id: 'TEV-02', at: minsAgo(4), kind: 'Movement', title: 'Zebra TC52 returned to the Picking Zone', detail: 'Completed a 1.84 km round through Dock 4', assetId: 'AST-1011', assetName: 'Zebra TC52 Mobile Computer', zone: 'Picking Zone', actor: 'Presence Monitor', tone: 'good' },
  { id: 'TEV-03', at: minsAgo(6), kind: 'Custody', title: 'Transfer submitted for approval', detail: 'Fluke DSX-8000 · Bengaluru HQ ▸ Hyderabad WH', assetId: 'AST-1014', assetName: 'Fluke Networks DSX-8000', actor: 'Manoj Reddy', tone: 'info' },
  { id: 'TEV-04', at: minsAgo(18), kind: 'Audit', title: 'IT Storeroom verified — 486 of 486', detail: 'Automatic verification pass, 100% accuracy', zone: 'IT Storeroom', actor: 'Audit Engine', tone: 'good' },
  { id: 'TEV-05', at: minsAgo(38), kind: 'Audit', title: 'Dock 4 reconciliation started', detail: '340 expected · 268 detected so far', zone: 'Loading Dock 4', actor: 'Deepak Nair', tone: 'info' },
  { id: 'TEV-06', at: hoursAgo(2), kind: 'Custody', title: 'ThinkPad T14 checked out', detail: 'Sneha Iyer · due back in 4 days', assetId: 'AST-1003', assetName: 'Lenovo ThinkPad T14', zone: 'IT Storeroom', actor: 'Scan Station DEV-SS-08', tone: 'good' },
  { id: 'TEV-07', at: hoursAgo(2), kind: 'Alert', title: 'Dwell limit exceeded in the Staging Bay', detail: '3 pallets over the 8-hour limit', zone: 'Staging Bay', actor: 'Zone Policy', tone: 'warn' },
  { id: 'TEV-08', at: hoursAgo(3), kind: 'Alert', title: 'Duplicate identity detected', detail: 'One tag identity read in two zones at once', assetId: 'AST-1012', assetName: 'Zebra RFID Gateway G-4', zone: 'Loading Dock 4', actor: 'Detection Matcher', tone: 'bad' },
  { id: 'TEV-09', at: hoursAgo(4), kind: 'Device', title: 'Coverage gap confirmed on the Tool Room corridor', detail: '6 journeys blind for 40–50 minutes', zone: 'IT Tool Room', actor: 'Coverage Analyser', tone: 'warn' },
  { id: 'TEV-10', at: hoursAgo(6), kind: 'Alert', title: 'Rack B08 slot 22 went empty', detail: 'No work order open for this removal', assetId: 'AST-1009', assetName: 'Synology RS2418+ NAS', zone: 'Server Room Beta', actor: 'Rack Monitor', tone: 'bad' },
  { id: 'TEV-11', at: hoursAgo(9), kind: 'Device', title: 'Floor 3 anchor cluster degraded', detail: '5 of 8 anchors reporting — precision downgraded', zone: 'Floor 3 Desks', actor: 'Device Health', tone: 'warn' },
  { id: 'TEV-12', at: hoursAgo(14), kind: 'Device', title: 'Secure Cage reader went offline', detail: '210 assets are now unverifiable', zone: 'Secure Cage', actor: 'Device Health', tone: 'bad' },
  { id: 'TEV-13', at: hoursAgo(20), kind: 'Alert', title: 'After-hours cage movement resolved', detail: 'Matched to approved move order MO-771', zone: 'Secure Cage', actor: 'Tarun Fernandes', tone: 'good' },
  { id: 'TEV-14', at: hoursAgo(52), kind: 'Alert', title: 'Asset left the building without a check-out', detail: 'iPad Pro 12.9" · escalated to Security', assetId: 'AST-1006', assetName: 'iPad Pro 12.9" (Field Ops)', zone: 'Main Exit & Reception', actor: 'Zone Policy', tone: 'bad' },
];

export function eventsForFacility(slug: string): TrackingEvent[] {
  if (slug === 'all') return trackingEvents;
  const f = facilityBySlug(slug);
  if (!f) return [];
  const zones = new Set(zonesForFacility(f.name).map((z) => z.name));
  return trackingEvents.filter((e) => !e.zone || zones.has(e.zone));
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived KPIs — every module reads its headline numbers from here, so the
// Dashboard and the workspace it links into can never disagree.
// ─────────────────────────────────────────────────────────────────────────────

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
  const facilityName = slug === 'all' ? null : facilityBySlug(slug)?.name ?? null;
  const zones = facilityName ? zonesForFacility(facilityName) : trackedZones;
  const unknowns = unknownDetections.filter(
    (u) => !facilityName || u.facility === facilityName,
  ).filter((u) => u.state === 'New' || u.state === 'Investigating');
  const txns = movementTxns.filter((t) => !facilityName || t.location.startsWith(facilityBySlug(slug)?.short ?? '') || t.location.includes(facilityName));

  const nonTags = devices.filter((d) => d.role !== 'Tag');
  const expectedTotal = rooms.reduce((s, r) => s + r.expected, 0);
  const matchedTotal = rooms.reduce((s, r) => s + (r.detected - r.unexpected), 0);

  const dayStart = TRACKING_NOW - 9 * 3600_000; // 00:00 IST on the demo day
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

/** Priority ordering used everywhere alerts are sorted. */
export const PRIORITY_RANK: Record<AlertPriority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

/** The Dashboard's "needs action" worklist: open, most urgent first. */
export function actionQueue(slug: string, limit = 6): TrackingAlert[] {
  return alertsForFacility(slug)
    .filter(isOpenAlert)
    .slice()
    .sort((a, b) => {
      if (a.slaBreached !== b.slaBreached) return a.slaBreached ? -1 : 1;
      if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      return Date.parse(a.raisedAt) - Date.parse(b.raisedAt);
    })
    .slice(0, limit);
}
