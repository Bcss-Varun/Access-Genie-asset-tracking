// ─────────────────────────────────────────────────────────────────────────────
// Label & tag printing — the collections and the pure helpers over them.
//
// Stock sizes, field definitions and media are *specifications*, not data: they
// describe what a label printer can physically produce, so they stay here as
// constants. The templates, devices and jobs are records, and arrive from
// `GET /api/v1/labels/*` through `hydrateLabels()`.
// ─────────────────────────────────────────────────────────────────────────────

import type { RegisteredAsset, TagBinding } from '@access-genie/shared';
import type {
  LabelFieldKey, LabelMedium, LabelSizeKey, LabelSizeSpec, LabelTemplate,
  PrintDevice, PrintJob,
} from '@access-genie/shared';

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

// ── Collections ──────────────────────────────────────────────────────────────
// Filled by hydrateLabels(); see api/labels.ts. Same arrangement as the dataset
// and tracking modules.

export let labelTemplates: LabelTemplate[] = [];
export let printDevices: PrintDevice[] = [];
export let printJobs: PrintJob[] = [];

export interface LabelWorkspace {
  templates: LabelTemplate[];
  devices: PrintDevice[];
  jobs: PrintJob[];
}

export function hydrateLabels(next: LabelWorkspace): void {
  labelTemplates = next.templates ?? [];
  printDevices = next.devices ?? [];
  printJobs = next.jobs ?? [];
}

// ── Templates ────────────────────────────────────────────────────────────────

/** The template every screen falls back to when none is chosen. */
export const DEFAULT_TEMPLATE_ID = 'TPL-STD-QR';

export const templateById = (id: string, list: LabelTemplate[] = labelTemplates): LabelTemplate | undefined =>
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

export const deviceById = (id: string): PrintDevice | undefined =>
  printDevices.find((d) => d.id === id);

export const DEVICE_READY: PrintDevice['state'][] = ['Online', 'Busy', 'Low media'];

/** A device can take work if it is reachable and speaks the medium. */
export const deviceCanRun = (d: PrintDevice, medium: LabelMedium): boolean =>
  DEVICE_READY.includes(d.state) && d.supports.includes(medium);

// ── Job history ──────────────────────────────────────────────────────────────

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

