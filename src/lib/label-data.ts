// ─────────────────────────────────────────────────────────────────────────────
// Label & tag printing — seed data and pure helpers.
//
// Everything here is deterministic (anchored to DEMO_NOW, no Math.random) so the
// server and client render the same bytes. Session mutations — new templates,
// new jobs — live in component state; this module is the read-only seed.
// ─────────────────────────────────────────────────────────────────────────────

import { DEMO_NOW } from '@/lib/utils';
import type { RegisteredAsset, TagBinding } from '@/types/onboarding';
import type {
  LabelFieldKey, LabelMedium, LabelSizeKey, LabelSizeSpec, LabelTemplate,
  PrintDevice, PrintJob,
} from '@/types/label';

const minsAgo = (m: number) => new Date(DEMO_NOW - m * 60_000).toISOString();
const hoursAgo = (h: number) => minsAgo(h * 60);
const daysAgo = (d: number) => hoursAgo(d * 24);

// ── Stock sizes ──────────────────────────────────────────────────────────────
// Real label stock, in millimetres. The preview renders in `mm` units, so what
// you see on screen is the size that comes out of the printer.

export const LABEL_SIZES: Record<LabelSizeKey, LabelSizeSpec> = {
  xs: { key: 'xs', label: 'Compact', widthMm: 25, heightMm: 15, codeMm: 11, idPt: 5.0, bodyPt: 3.6, fits: 1 },
  sm: { key: 'sm', label: 'Small', widthMm: 38, heightMm: 19, codeMm: 15, idPt: 6.2, bodyPt: 4.3, fits: 2 },
  md: { key: 'md', label: 'Standard', widthMm: 50, heightMm: 25, codeMm: 20, idPt: 7.5, bodyPt: 5.2, fits: 3 },
  lg: { key: 'lg', label: 'Large', widthMm: 62, heightMm: 29, codeMm: 24, idPt: 8.6, bodyPt: 6.0, fits: 4 },
  xl: { key: 'xl', label: 'Equipment', widthMm: 76, heightMm: 38, codeMm: 31, idPt: 10.5, bodyPt: 7.0, fits: 6 },
};

export const SIZE_ORDER: LabelSizeKey[] = ['xs', 'sm', 'md', 'lg', 'xl'];

export const sizeLabel = (key: LabelSizeKey): string => {
  const s = LABEL_SIZES[key];
  return `${s.label} · ${s.widthMm} × ${s.heightMm} mm`;
};

// ── Fields ───────────────────────────────────────────────────────────────────

export const LABEL_FIELDS: { key: LabelFieldKey; label: string; hint: string }[] = [
  { key: 'name', label: 'Asset name', hint: 'What a human calls it' },
  { key: 'serial', label: 'Serial number', hint: 'Manufacturer serial' },
  { key: 'category', label: 'Category', hint: 'Compute, Network, …' },
  { key: 'custodian', label: 'Custodian', hint: 'Who answers for it' },
  { key: 'location', label: 'Location', hint: 'Facility · zone at print time' },
  { key: 'criticality', label: 'Criticality', hint: 'Critical / High / …' },
  { key: 'tagId', label: 'Tag ID', hint: 'The bound identity tag' },
  { key: 'scanUrl', label: 'Scan URL', hint: 'The short link the code resolves to' },
  { key: 'owner', label: 'Owner org', hint: 'Legal owner line for audits' },
];

export const fieldLabel = (key: LabelFieldKey): string =>
  LABEL_FIELDS.find((f) => f.key === key)?.label ?? key;

export const MEDIA: { medium: LabelMedium; label: string; blurb: string }[] = [
  { medium: 'QR', label: 'QR', blurb: 'Camera-scannable, verifies on first scan' },
  { medium: 'DataMatrix', label: 'Data Matrix', blurb: 'Dense — survives on small metal parts' },
  { medium: 'Barcode', label: 'Barcode', blurb: 'Code-128 for legacy handheld scanners' },
  { medium: 'RFID', label: 'RFID', blurb: 'Encoded EPC — read by dock and room portals' },
  { medium: 'NFC', label: 'NFC', blurb: 'Tap-to-open from any phone' },
];

// ── Templates ────────────────────────────────────────────────────────────────

export const seedTemplates: LabelTemplate[] = [
  {
    id: 'TPL-STD-QR',
    name: 'IT Standard — QR',
    description: 'The default for laptops, monitors and desk kit. Scan resolves to Asset 360.',
    medium: 'QR',
    size: 'md',
    fields: ['name', 'custodian', 'location'],
    showLogo: true,
    showBorder: true,
    stock: 'Polyester matte 50 × 25 mm',
    builtIn: true,
    updatedAt: daysAgo(41),
    updatedBy: 'Priya Menon',
    usageCount: 612,
  },
  {
    id: 'TPL-CAGE-RFID',
    name: 'Secure Cage — RFID',
    description: 'Encoded EPC for anything that crosses a dock or cage portal.',
    medium: 'RFID',
    size: 'lg',
    fields: ['name', 'serial', 'tagId', 'owner'],
    showLogo: true,
    showBorder: true,
    stock: 'RFID inlay polyester 62 × 29 mm',
    builtIn: true,
    updatedAt: daysAgo(23),
    updatedBy: 'Arun Kalyan',
    usageCount: 288,
  },
  {
    id: 'TPL-COMPACT',
    name: 'Small Kit — Compact QR',
    description: 'Cables, adapters, hand tools. Code plus ID, nothing else fits and nothing else matters.',
    medium: 'QR',
    size: 'xs',
    fields: ['name'],
    showLogo: false,
    showBorder: true,
    stock: 'Vinyl 25 × 15 mm',
    builtIn: true,
    updatedAt: daysAgo(66),
    updatedBy: 'Priya Menon',
    usageCount: 431,
  },
  {
    id: 'TPL-RACK',
    name: 'Rack & Server — Equipment',
    description: 'Large-format faceplate label. Readable from the cold aisle without a torch.',
    medium: 'DataMatrix',
    size: 'xl',
    fields: ['name', 'serial', 'location', 'criticality', 'custodian'],
    showLogo: true,
    showBorder: true,
    stock: 'Polyester 76 × 38 mm',
    builtIn: true,
    updatedAt: daysAgo(12),
    updatedBy: 'Rahul Desai',
    usageCount: 154,
  },
  {
    id: 'TPL-LEGACY-BC',
    name: 'Legacy Scanner — Barcode',
    description: 'Code-128 for the Chennai stores counter, whose handhelds predate cameras.',
    medium: 'Barcode',
    size: 'sm',
    fields: ['serial'],
    showLogo: false,
    showBorder: false,
    stock: 'Paper 38 × 19 mm',
    builtIn: true,
    updatedAt: daysAgo(88),
    updatedBy: 'Data migration',
    usageCount: 97,
  },
  {
    id: 'TPL-NFC-VISITOR',
    name: 'Loaner Pool — NFC',
    description: 'Tap-to-check-out for the loaner laptop pool. Encodes on the Bengaluru encoder.',
    medium: 'NFC',
    size: 'md',
    fields: ['name', 'custodian', 'scanUrl'],
    showLogo: true,
    showBorder: true,
    stock: 'NFC sticker 50 × 25 mm',
    builtIn: true,
    updatedAt: daysAgo(7),
    updatedBy: 'Arun Kalyan',
    usageCount: 63,
  },
];

export const DEFAULT_TEMPLATE_ID = 'TPL-STD-QR';

export const templateById = (id: string, list: LabelTemplate[] = seedTemplates): LabelTemplate | undefined =>
  list.find((t) => t.id === id);

/** Next template id for a session-created copy — counter-based, not clock-based. */
export function mintTemplateId(list: LabelTemplate[]): string {
  const max = list.reduce((m, t) => {
    const n = Number(t.id.replace('TPL-C', ''));
    return Number.isFinite(n) && n > m ? n : m;
  }, 100);
  return `TPL-C${max + 1}`;
}

// ── Devices ──────────────────────────────────────────────────────────────────

export const printDevices: PrintDevice[] = [
  {
    id: 'PRN-BLR-01',
    name: 'IT Storeroom — Zebra ZT411',
    kind: 'Label printer',
    model: 'Zebra ZT411 300dpi',
    facility: 'Bengaluru HQ',
    zone: 'IT Storeroom',
    state: 'Online',
    media: 78,
    queueDepth: 0,
    supports: ['QR', 'DataMatrix', 'Barcode'],
    lastSeen: minsAgo(1),
  },
  {
    id: 'ENC-BLR-02',
    name: 'IT Storeroom — Zebra ZT411 RFID',
    kind: 'RFID encoder',
    model: 'Zebra ZT411 RFID (UHF)',
    facility: 'Bengaluru HQ',
    zone: 'IT Storeroom',
    state: 'Low media',
    media: 9,
    queueDepth: 1,
    supports: ['QR', 'Barcode', 'RFID', 'NFC'],
    lastSeen: minsAgo(3),
    note: 'RFID inlay roll at 9% — about 40 labels left.',
  },
  {
    id: 'PRN-HYD-01',
    name: 'Dock 4 — Zebra ZD621',
    kind: 'Label printer',
    model: 'Zebra ZD621 203dpi',
    facility: 'Hyderabad Central Warehouse',
    zone: 'Loading Dock 4',
    state: 'Online',
    media: 54,
    queueDepth: 2,
    supports: ['QR', 'DataMatrix', 'Barcode'],
    lastSeen: minsAgo(2),
  },
  {
    id: 'ENC-HYD-02',
    name: 'Secure Cage — Zebra R110Xi4',
    kind: 'RFID encoder',
    model: 'Zebra R110Xi4 (UHF)',
    facility: 'Hyderabad Central Warehouse',
    zone: 'Secure Cage',
    state: 'Offline',
    media: 62,
    queueDepth: 3,
    supports: ['RFID', 'NFC'],
    lastSeen: hoursAgo(6),
    note: 'No heartbeat since 03:00 — network switch in the cage was power-cycled.',
  },
  {
    id: 'PRN-MAA-01',
    name: 'Server Room Alpha — Brother QL-820',
    kind: 'Label printer',
    model: 'Brother QL-820NWB',
    facility: 'Chennai Data Center',
    zone: 'Server Room Alpha',
    state: 'Online',
    media: 91,
    queueDepth: 0,
    supports: ['QR', 'DataMatrix', 'Barcode'],
    lastSeen: minsAgo(4),
  },
  {
    id: 'PRN-DESK-01',
    name: 'My desktop (PDF / A4 sheet)',
    kind: 'Desktop printer',
    model: 'Browser print dialog',
    facility: 'Any',
    zone: '—',
    state: 'Online',
    media: 100,
    queueDepth: 0,
    supports: ['QR', 'DataMatrix', 'Barcode'],
    lastSeen: minsAgo(0),
    note: 'Prints an A4 sheet through the browser. Cannot encode RFID or NFC.',
  },
];

export const deviceById = (id: string): PrintDevice | undefined =>
  printDevices.find((d) => d.id === id);

export const DEVICE_READY: PrintDevice['state'][] = ['Online', 'Busy', 'Low media'];

/** A device can take work if it is reachable and speaks the medium. */
export const deviceCanRun = (d: PrintDevice, medium: LabelMedium): boolean =>
  DEVICE_READY.includes(d.state) && d.supports.includes(medium);

// ── Job history ──────────────────────────────────────────────────────────────

export const seedJobs: PrintJob[] = [
  {
    id: 'PJ-2041',
    createdAt: minsAgo(6),
    createdBy: 'Priya Menon',
    templateId: 'TPL-CAGE-RFID',
    deviceId: 'ENC-HYD-02',
    assetIds: ['AST-1012', 'AST-1011'],
    copies: 1,
    state: 'Failed',
    printed: 0,
    encoded: 0,
    bound: 0,
    failureReason: 'Encoder unreachable — Secure Cage device has not answered since 03:00.',
  },
  {
    id: 'PJ-2040',
    createdAt: minsAgo(11),
    createdBy: 'Arun Kalyan',
    templateId: 'TPL-STD-QR',
    deviceId: 'PRN-HYD-01',
    assetIds: ['AST-1011', 'AST-1006', 'AST-1004'],
    copies: 1,
    state: 'Printing',
    printed: 1,
    encoded: 0,
    bound: 1,
  },
  {
    id: 'PJ-2039',
    createdAt: minsAgo(34),
    createdBy: 'Arun Kalyan',
    templateId: 'TPL-COMPACT',
    deviceId: 'PRN-BLR-01',
    assetIds: ['AST-1014'],
    copies: 4,
    state: 'Completed',
    printed: 4,
    encoded: 0,
    bound: 1,
    completedAt: minsAgo(33),
  },
  {
    id: 'PJ-2038',
    createdAt: hoursAgo(3),
    createdBy: 'Priya Menon',
    templateId: 'TPL-RACK',
    deviceId: 'PRN-MAA-01',
    assetIds: ['AST-1001', 'AST-1002', 'AST-1008', 'AST-1009'],
    copies: 1,
    state: 'Completed',
    printed: 4,
    encoded: 0,
    bound: 0,
    completedAt: hoursAgo(3),
  },
  {
    id: 'PJ-2037',
    createdAt: hoursAgo(9),
    createdBy: 'Rahul Desai',
    templateId: 'TPL-CAGE-RFID',
    deviceId: 'ENC-BLR-02',
    assetIds: ['AST-1003', 'AST-1010', 'AST-1013'],
    copies: 1,
    state: 'Held',
    printed: 0,
    encoded: 0,
    bound: 0,
    failureReason: 'Held by Rahul Desai — waiting on the inlay roll swap.',
  },
  {
    id: 'PJ-2036',
    createdAt: daysAgo(1),
    createdBy: 'Priya Menon',
    templateId: 'TPL-LEGACY-BC',
    deviceId: 'PRN-MAA-01',
    assetIds: ['AST-1005', 'AST-1007'],
    copies: 2,
    state: 'Completed',
    printed: 4,
    encoded: 0,
    bound: 0,
    completedAt: daysAgo(1),
  },
];

export const JOB_OPEN_STATES: PrintJob['state'][] = ['Queued', 'Printing', 'Held', 'Failed'];
export const isOpenJob = (j: PrintJob): boolean => JOB_OPEN_STATES.includes(j.state);

/** Next job id — counter-based, so it never depends on the wall clock. */
export function mintJobId(jobs: PrintJob[]): string {
  const max = jobs.reduce((m, j) => {
    const n = Number(j.id.replace('PJ-', ''));
    return Number.isFinite(n) && n > m ? n : m;
  }, 2000);
  return `PJ-${max + 1}`;
}

// ── Tag identity ─────────────────────────────────────────────────────────────
//
// A label is only half the job. The other half is the binding it creates, and
// the three states that follow from it (docs/21 M7): an asset can be untagged,
// tagged-but-never-read, or verified. "Bound but never read" is the common
// real-world failure, so it gets its own state rather than being counted as
// success.

export type IdentityState = 'Unlabelled' | 'Bound' | 'Verified';

export interface IdentityStatus {
  state: IdentityState;
  /** The live identity binding, when there is one. */
  binding?: TagBinding;
  /** Location/telemetry tags the asset carries instead — context, not identity. */
  otherTags: TagBinding[];
}

/**
 * An asset's identity-label status. Location tags (BLE, UWB, GPS) deliberately
 * do NOT count: you cannot read a beacon off a shelf with your phone, so an
 * asset with a beacon and no printed label still needs a label.
 */
export function identityStatus(asset: RegisteredAsset): IdentityStatus {
  const live = asset.onboarding.bindings.filter((b) => !b.retiredAt);
  const binding = live.find((b) => b.role === 'identity');
  const otherTags = live.filter((b) => b.role !== 'identity');
  if (!binding) return { state: 'Unlabelled', otherTags };
  return { state: binding.state === 'Verified' ? 'Verified' : 'Bound', binding, otherTags };
}

// Tag id minting (`mintTagId`, `takenTagIds`) deliberately lives in
// `@/lib/onboarding` alongside the other tag helpers — the printer and the
// onboarding Track card must draw from one pool or they will collide.

