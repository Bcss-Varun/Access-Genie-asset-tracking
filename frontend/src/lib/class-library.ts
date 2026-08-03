// ─────────────────────────────────────────────────────────────────────────────
// The asset class library — one editable object per class.
//
// A class used to be split across two places: the attribute schema lived in
// `allAssetClasses`, the policy (gates, monitoring, depreciation, PM) lived in
// `CLASS_TEMPLATES`. Editing meant touching two files that nothing joined.
// Here they are one record.
//
// This is the highest-leverage config in the product: a class decides what an
// asset captures, what it must satisfy to go live, how it is tracked, monitored,
// depreciated and maintained. Change it once, and every asset of that class
// follows (docs/21 §21.2 P2).
//
// The record now lives in MongoDB and arrives with the dataset; this module is
// the live, editable view of it. `ClassLibraryProvider` mirrors it into React
// state for the editor UI, and writes through the API.
// ─────────────────────────────────────────────────────────────────────────────

import { allAssetClasses } from '@/lib/dataset';
import type {
  AttributeDef,
  Criticality,
  DocType,
  GateKey,
  SensorKind,
  AssetCategory,
} from '@access-genie/shared';
import type { ClassTemplate } from '@access-genie/shared';

export interface AssetClassDef {
  id: string;
  name: string;
  icon: string;
  /** Plain-language "what belongs in this class" — shown on the class card. */
  description: string;
  /**
   * Reporting category every asset registered in this class is filed under.
   *
   * Declared, not derived from `name`: class names are free text and
   * `Asset.category` is a closed enum, so reading one off the other only ever
   * worked while the classes happened to be named after the categories.
   */
  category: AssetCategory;
  attributes: AttributeDef[];

  // ── Policy: what this class decides for every asset in it ──────────────────
  trackingExpected: boolean;
  preferredTags: SensorKind[];
  monitoringProfileId: string | null;
  activationGates: GateKey[];
  depreciationMethod: string;
  usefulLifeYears: number;
  pmPlan: string | null;
  documentChecklist: DocType[];
  defaultCriticality: Criticality;
  /** Registrations above this value need a sign-off before activation (₹). */
  approvalThreshold: number;

  /** Classes created in this session — badged in the UI. */
  custom?: boolean;
}

/** What a brand-new class starts as — the smallest policy that is still honest. */
export const NEW_CLASS_DEFAULTS: Omit<AssetClassDef, 'id' | 'name' | 'icon'> = {
  description: '',
  category: 'Compute',
  attributes: [],
  trackingExpected: false,
  preferredTags: ['QR Label'],
  monitoringProfileId: null,
  activationGates: ['identified', 'located', 'accountable'],
  depreciationMethod: 'Straight-line (5yr)',
  usefulLifeYears: 5,
  pmPlan: null,
  documentChecklist: ['Invoice'],
  defaultCriticality: 'Medium',
  approvalThreshold: 500000,
  custom: true,
};

/** The library, projected from the dataset. */
function fromDataset(): AssetClassDef[] {
  return allAssetClasses.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    description: c.description,
    // Classes stored before the field existed read back undefined; the fallback
    // keeps every registration in them valid.
    category: c.category ?? 'Compute',
    attributes: c.attributes.map((a) => ({ ...a })),
    trackingExpected: c.trackingExpected,
    preferredTags: c.preferredTags,
    monitoringProfileId: c.monitoringProfileId || null,
    activationGates: c.activationGates,
    depreciationMethod: c.depreciationMethod,
    usefulLifeYears: c.usefulLifeYears,
    pmPlan: c.pmPlan || null,
    documentChecklist: c.documentChecklist,
    defaultCriticality: c.defaultCriticality,
    approvalThreshold: c.approvalThreshold,
  }));
}

// ── Module-level store ───────────────────────────────────────────────────────
// The pure helpers (evaluateGates, newOnboarding…) read this synchronously, so
// an edit made in Administration is live for the next registration without a
// reload. It is refilled whenever the dataset is.

let library: AssetClassDef[] = [];

/** Called by the dataset hydration; see lib/dataset.ts. */
export function hydrateClassLibrary(): void {
  library = fromDataset();
}

export const getLibrary = (): AssetClassDef[] => library;
export const setLibrary = (next: AssetClassDef[]): void => { library = next; };
export const findClass = (id: string): AssetClassDef | undefined => library.find((c) => c.id === id);

/** Mint the next class id, avoiding collisions with anything already there. */
export function nextClassId(name: string): string {
  const stem = (name.replace(/[^a-zA-Z]/g, '').slice(0, 3) || 'NEW').toUpperCase();
  let candidate = `CLS-${stem}`;
  let n = 2;
  while (library.some((c) => c.id === candidate)) candidate = `CLS-${stem}${n++}`;
  return candidate;
}

/** Attribute keys are derived from the label so nobody has to invent them. */
export function attributeKey(label: string, taken: string[]): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field';
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

// ── Adapter for the onboarding engine ────────────────────────────────────────

export const FALLBACK_TEMPLATE: ClassTemplate = {
  classId: '',
  trackingExpected: false,
  preferredTags: ['QR Label'],
  monitoringProfileId: null,
  activationGates: ['identified', 'located', 'accountable'],
  depreciationMethod: 'Straight-line (5yr)',
  usefulLifeYears: 5,
  pmPlan: null,
  documentChecklist: ['Invoice'],
  defaultCriticality: 'Medium',
  approvalThreshold: 500000,
};

/** The policy slice the registration flow reads. Always live. */
export function getClassTemplate(classId: string): ClassTemplate {
  const c = findClass(classId);
  if (!c) return { ...FALLBACK_TEMPLATE, classId };
  return {
    classId: c.id,
    trackingExpected: c.trackingExpected,
    preferredTags: c.preferredTags,
    monitoringProfileId: c.monitoringProfileId,
    activationGates: c.activationGates,
    depreciationMethod: c.depreciationMethod,
    usefulLifeYears: c.usefulLifeYears,
    pmPlan: c.pmPlan,
    documentChecklist: c.documentChecklist,
    defaultCriticality: c.defaultCriticality,
    approvalThreshold: c.approvalThreshold,
  };
}

// ── Plain-language helpers for the editor UI ─────────────────────────────────

/** What each gate actually means, for people who don't speak "activation policy". */
export const GATE_EXPLAINER: Record<GateKey, { label: string; means: string }> = {
  identified: { label: 'Identity', means: 'Name, class and serial number — always required, this is what creates the asset' },
  located: { label: 'Location', means: 'Must be placed somewhere real, not left at Receiving' },
  accountable: { label: 'Owner', means: 'Must have a named custodian and a department' },
  tracked: { label: 'Tracking tag', means: 'Must carry a tag that has actually been read at least once' },
  financial: { label: 'Purchase details', means: 'Must have purchase date, cost and vendor' },
  maintainable: { label: 'Maintenance', means: 'Must have a PM plan, or be deliberately marked run-to-failure' },
  documented: { label: 'Documents', means: 'Every document on the checklist below must be attached' },
  monitored: { label: 'Monitoring', means: 'Must have a monitoring profile, or an explicit "none by policy"' },
};

export const ATTRIBUTE_TYPES: { value: AttributeDef['type']; label: string; hint: string }[] = [
  { value: 'text', label: 'Text', hint: 'Free text — model codes, notes' },
  { value: 'number', label: 'Number', hint: 'Quantities, capacities, ratings' },
  { value: 'select', label: 'Choice', hint: 'Pick one from a fixed list' },
  { value: 'date', label: 'Date', hint: 'Calibration dates, install dates' },
  { value: 'boolean', label: 'Yes / No', hint: 'A simple flag' },
];

export const ALL_DOC_TYPES: DocType[] = ['Manual', 'Warranty', 'Certificate', 'Invoice', 'Image', 'CAD', 'Report'];

export const ALL_TAG_KINDS: SensorKind[] = [
  'RFID Tag', 'BLE Beacon', 'UWB Tag', 'GPS Tracker', 'QR Label', 'LoRaWAN Sensor', 'Environmental',
];

export const DEPRECIATION_METHODS = [
  'Straight-line (3yr)', 'Straight-line (4yr)', 'Straight-line (5yr)',
  'Straight-line (8yr)', 'Straight-line (10yr)', 'Reducing balance', 'Not depreciated',
];
