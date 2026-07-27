// ─────────────────────────────────────────────────────────────────────────────
// Stage A source data — the things you can register *from*.
//
// Roughly 60–80% of enterprise assets arrive through procurement, so the goods
// receipt is the natural starting point: it already holds manufacturer, model,
// cost, vendor and warranty terms. Starting from a blank form throws all of
// that away (docs/21 §21.3.2).
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetCategory, SensorKind } from '@/types/asset';

/** A received PO line that is a capital asset waiting to be registered. */
export interface AssetPoLine {
  id: string;
  poRef: string;
  vendor: string;
  receivedAt: string;      // ISO date — the GRN
  description: string;
  manufacturer: string;
  model: string;
  classId: string;
  category: AssetCategory;
  unitCost: number;
  /** How many units landed. Registering line-with-quantity spawns n drafts. */
  quantity: number;
  /** Already-registered units on this line (drives "3 of 10 registered"). */
  registered: number;
  warrantyMonths: number;
  facilityHint: string;
}

export const ASSET_PO_LINES: AssetPoLine[] = [
  {
    id: 'POL-1', poRef: 'PO-2211', vendor: 'Dell India Pvt Ltd', receivedAt: '2026-07-18',
    description: 'PowerEdge R760 Rack Server', manufacturer: 'Dell', model: 'PowerEdge R760',
    classId: 'CLS-COMP', category: 'Compute', unitCost: 920000, quantity: 4, registered: 1,
    warrantyMonths: 60, facilityHint: 'Chennai Data Center',
  },
  {
    id: 'POL-2', poRef: 'PO-2212', vendor: 'Redington India Ltd', receivedAt: '2026-07-20',
    description: 'Catalyst 9300 48-port Switch', manufacturer: 'Cisco', model: 'Catalyst 9300',
    classId: 'CLS-NET', category: 'Network', unitCost: 640000, quantity: 2, registered: 0,
    warrantyMonths: 60, facilityHint: 'Bengaluru HQ',
  },
  {
    id: 'POL-3', poRef: 'PO-2213', vendor: 'Redington India Ltd', receivedAt: '2026-07-21',
    description: 'ThinkPad T14 Gen 5 (i7 / 32 GB)', manufacturer: 'Lenovo', model: 'ThinkPad T14 Gen 5',
    classId: 'CLS-END', category: 'Endpoints', unitCost: 148000, quantity: 12, registered: 3,
    warrantyMonths: 36, facilityHint: 'Bengaluru HQ',
  },
  {
    id: 'POL-4', poRef: 'PO-2214', vendor: 'Schneider Electric India', receivedAt: '2026-07-14',
    description: 'Smart-UPS SRT 5000 VA', manufacturer: 'APC', model: 'Smart-UPS SRT 5000',
    classId: 'CLS-INF', category: 'Infrastructure', unitCost: 385000, quantity: 2, registered: 0,
    warrantyMonths: 24, facilityHint: 'Hyderabad Central Warehouse',
  },
];

export const getPoLine = (id: string): AssetPoLine | undefined => ASSET_PO_LINES.find((l) => l.id === id);

// ── Ghost tags (S15) ─────────────────────────────────────────────────────────
// A tag reading in a zone with no asset behind it. Adopting it turns a
// data-integrity alert into a one-click registration; silent unknown reads are
// how a registry rots.

export interface UnknownTagRead {
  tagId: string;
  kind: SensorKind;
  zone: string;
  facility: string;
  firstSeen: string;
  reads24h: number;
}

export const UNKNOWN_TAG_READS: UnknownTagRead[] = [
  { tagId: 'RFID-E28011606311', kind: 'RFID Tag', zone: 'Loading Dock 4', facility: 'Hyderabad Central Warehouse', firstSeen: '2026-07-19', reads24h: 84 },
  { tagId: 'BLE-C39A6F2B7742', kind: 'BLE Beacon', zone: 'IT Storeroom', facility: 'Bengaluru HQ', firstSeen: '2026-07-22', reads24h: 31 },
  { tagId: 'UWB-ANCH-6620', kind: 'UWB Tag', zone: 'Staging Bay', facility: 'Hyderabad Central Warehouse', firstSeen: '2026-07-21', reads24h: 12 },
];

// ── Scan results (S10) ───────────────────────────────────────────────────────
// What a handheld gets off a barcode plus nameplate OCR at the dock. The point
// of the mobile path is that identity + location arrive together, in seconds.

export interface ScanResult {
  serial: string;
  manufacturer: string;
  model: string;
  classId: string;
  category: AssetCategory;
  /** Inferred from the gateway that saw the scan — not typed by the technician. */
  facility: string;
  building?: string;
  zone: string;
  confidence: number;
}

export const SCAN_RESULTS: ScanResult[] = [
  {
    serial: 'CN-0R740-77291-4B', manufacturer: 'Dell', model: 'PowerEdge R760',
    classId: 'CLS-COMP', category: 'Compute',
    facility: 'Hyderabad Central Warehouse', building: 'Building A', zone: 'Loading Dock',
    confidence: 96,
  },
  {
    serial: 'FDO2731V0KL', manufacturer: 'Cisco', model: 'Catalyst 9300',
    classId: 'CLS-NET', category: 'Network',
    facility: 'Hyderabad Central Warehouse', building: 'Building A', zone: 'Staging Bay',
    confidence: 91,
  },
  {
    serial: 'PF4X2K9Q', manufacturer: 'Lenovo', model: 'ThinkPad T14 Gen 5',
    classId: 'CLS-END', category: 'Endpoints',
    facility: 'Hyderabad Central Warehouse', building: 'Building A', zone: 'Loading Dock',
    confidence: 88,
  },
];
