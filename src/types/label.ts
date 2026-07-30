// ─────────────────────────────────────────────────────────────────────────────
// Label & tag printing (docs/06 C6, docs/21 §21.3.4).
//
// The module has three nouns and they are deliberately separate:
//
//   LabelTemplate — how a label LOOKS (medium, stock size, fields, logo).
//   PrintDevice   — the physical printer or encoder a job is sent TO.
//   PrintJob      — one batch, with a state that survives the tab closing.
//
// The fourth noun — the tag binding itself — is NOT redefined here. It already
// lives in `@/types/onboarding` and is owned by the RegistryProvider, because a
// label that gets printed and a tag that gets bound must be the same event, not
// two systems that agree by accident.
// ─────────────────────────────────────────────────────────────────────────────

import type { SensorKind } from './asset';

/** What is encoded on the label. Barcode/DataMatrix/QR print; RFID/NFC write. */
export type LabelMedium = 'QR' | 'DataMatrix' | 'Barcode' | 'RFID' | 'NFC';

export type LabelSizeKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Fields a template may print under the asset ID (which is always shown). */
export type LabelFieldKey =
  | 'name'
  | 'serial'
  | 'category'
  | 'custodian'
  | 'location'
  | 'criticality'
  | 'tagId'
  | 'scanUrl'
  | 'owner';

export interface LabelSizeSpec {
  key: LabelSizeKey;
  label: string;
  widthMm: number;
  heightMm: number;
  /** Side of the code square, in mm. */
  codeMm: number;
  /** Type scale, in points — real units so screen preview matches paper. */
  idPt: number;
  bodyPt: number;
  /** How many body fields physically fit before the label is over-stuffed. */
  fits: number;
}

export interface LabelTemplate {
  id: string;
  name: string;
  description: string;
  medium: LabelMedium;
  size: LabelSizeKey;
  fields: LabelFieldKey[];
  showLogo: boolean;
  showBorder: boolean;
  /** Label stock this template is cut for — printers refuse mismatched media. */
  stock: string;
  /** Seeded templates cannot be deleted; copies of them can. */
  builtIn: boolean;
  updatedAt: string;
  updatedBy: string;
  /** Labels produced from this template in the last 90 days. */
  usageCount: number;
}

// ── Devices ──────────────────────────────────────────────────────────────────

export type PrintDeviceKind = 'Label printer' | 'RFID encoder' | 'NFC encoder' | 'Desktop printer';

/** Honest states: a printer that is out of media is not "online". */
export type PrintDeviceState = 'Online' | 'Busy' | 'Low media' | 'Offline' | 'Error';

export interface PrintDevice {
  id: string;
  name: string;
  kind: PrintDeviceKind;
  model: string;
  facility: string;
  zone: string;
  state: PrintDeviceState;
  /** Media remaining, as a percentage of a full roll. */
  media: number;
  /** Jobs already waiting on this device. */
  queueDepth: number;
  supports: LabelMedium[];
  lastSeen: string;
  /** Why it is unhappy — shown verbatim, never summarised away. */
  note?: string;
}

// ── Jobs ─────────────────────────────────────────────────────────────────────

export type PrintJobState = 'Queued' | 'Printing' | 'Completed' | 'Failed' | 'Held' | 'Cancelled';

export interface PrintJob {
  id: string;
  createdAt: string;
  createdBy: string;
  templateId: string;
  deviceId: string;
  assetIds: string[];
  copies: number;
  state: PrintJobState;
  /** Labels physically produced so far — partial progress is real progress. */
  printed: number;
  /** Tags written, for RFID/NFC media. Always 0 for print-only media. */
  encoded: number;
  /** Tag bindings this job created, so a reprint does not double-bind. */
  bound: number;
  failureReason?: string;
  completedAt?: string;
}

/** Which tag technology a medium becomes once it is bound to an asset. */
export const KIND_FOR_MEDIUM: Record<LabelMedium, SensorKind> = {
  QR: 'QR Label',
  DataMatrix: 'QR Label',
  Barcode: 'QR Label',
  RFID: 'RFID Tag',
  // NFC rides the RFID Tag kind in the tag registry — same identity role, same
  // encoder workflow. Splitting it would fork the registry for no operator gain.
  NFC: 'RFID Tag',
};

/** RFID/NFC have to be written to silicon before they leave the encoder. */
export const encodesTag = (medium: LabelMedium): boolean => medium === 'RFID' || medium === 'NFC';
