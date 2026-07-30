// ─────────────────────────────────────────────────────────────────────────────
// The asset class library — one editable object per class.
//
// A class used to be split across two places: the attribute schema lived in
// `mockTaxonomy`, the policy (gates, monitoring, depreciation, PM) lived in
// `CLASS_TEMPLATES`. Editing meant touching two files that nothing joined.
// Here they are one record.
//
// This is the highest-leverage config in the product: a class decides what an
// asset captures, what it must satisfy to go live, how it is tracked, monitored,
// depreciated and maintained. Change it once, and every asset of that class
// follows (docs/21 §21.2 P2).
//
// Held in a module-level array so the pure helpers in lib/ read live values;
// `ClassLibraryProvider` mirrors it into React state for the editor UI.
// ─────────────────────────────────────────────────────────────────────────────

import { mockTaxonomy } from '@/lib/mock-data';
import type { AttributeDef, Criticality, DocType, SensorKind } from '@/types/asset';
import type { ClassTemplate, GateKey } from '@/types/onboarding';

export interface AssetClassDef {
  id: string;
  name: string;
  icon: string;
  /** Plain-language "what belongs in this class" — shown on the class card. */
  description: string;
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

/** Policy half of the seed, keyed to the taxonomy classes in mock-data. */
const SEED_POLICY: Record<string, Omit<AssetClassDef, 'id' | 'name' | 'icon' | 'attributes'>> = {
  'CLS-COMP': {
    description: 'Servers, workstations and anything that runs workloads.',
    trackingExpected: true,
    preferredTags: ['RFID Tag', 'BLE Beacon'],
    monitoringProfileId: 'MP-DC-CRIT',
    activationGates: ['identified', 'located', 'accountable', 'financial', 'maintainable', 'monitored'],
    depreciationMethod: 'Straight-line (5yr)',
    usefulLifeYears: 5,
    pmPlan: 'Server PM — quarterly thermal & firmware',
    documentChecklist: ['Invoice', 'Warranty', 'Manual'],
    defaultCriticality: 'High',
    approvalThreshold: 500000,
  },
  'CLS-NET': {
    description: 'Switches, routers, firewalls and wireless access points.',
    trackingExpected: true,
    preferredTags: ['RFID Tag', 'UWB Tag'],
    monitoringProfileId: 'MP-NET-CORE',
    activationGates: ['identified', 'located', 'accountable', 'tracked', 'financial', 'maintainable', 'monitored'],
    depreciationMethod: 'Straight-line (5yr)',
    usefulLifeYears: 5,
    pmPlan: 'Network PM — semi-annual config & firmware audit',
    documentChecklist: ['Invoice', 'Warranty', 'Certificate'],
    defaultCriticality: 'Critical',
    approvalThreshold: 500000,
  },
  'CLS-END': {
    description: 'Laptops, tablets, phones, monitors and printers issued to people.',
    trackingExpected: false,
    preferredTags: ['QR Label', 'BLE Beacon'],
    monitoringProfileId: 'MP-IT-STD',
    activationGates: ['identified', 'located', 'accountable', 'monitored'],
    depreciationMethod: 'Straight-line (3yr)',
    usefulLifeYears: 3,
    pmPlan: null,
    documentChecklist: ['Invoice', 'Warranty'],
    defaultCriticality: 'Medium',
    approvalThreshold: 500000,
  },
  'CLS-INF': {
    description: 'Power, cooling and facility plant that everything else depends on.',
    trackingExpected: true,
    preferredTags: ['BLE Beacon', 'RFID Tag'],
    monitoringProfileId: 'MP-INFRA',
    activationGates: ['identified', 'located', 'accountable', 'financial', 'maintainable', 'documented', 'monitored'],
    depreciationMethod: 'Straight-line (8yr)',
    usefulLifeYears: 8,
    pmPlan: 'UPS PM — battery load test, semi-annual',
    documentChecklist: ['Invoice', 'Warranty', 'Certificate', 'Manual'],
    defaultCriticality: 'Critical',
    approvalThreshold: 500000,
  },
  'CLS-SEN': {
    description: 'Tags, readers, gateways and environmental probes.',
    trackingExpected: true,
    preferredTags: ['BLE Beacon', 'UWB Tag', 'LoRaWAN Sensor'],
    monitoringProfileId: 'MP-SENSOR',
    activationGates: ['identified', 'located', 'accountable', 'tracked', 'monitored'],
    depreciationMethod: 'Straight-line (4yr)',
    usefulLifeYears: 4,
    pmPlan: 'Sensor PM — annual calibration',
    documentChecklist: ['Certificate'],
    defaultCriticality: 'Medium',
    approvalThreshold: 500000,
  },
};

/** What a brand-new class starts as — the smallest policy that is still honest. */
export const NEW_CLASS_DEFAULTS: Omit<AssetClassDef, 'id' | 'name' | 'icon'> = {
  description: '',
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

function seed(): AssetClassDef[] {
  return mockTaxonomy.map((t) => ({
    id: t.id,
    name: t.name,
    icon: t.icon,
    attributes: t.attributes.map((a) => ({ ...a })),
    ...(SEED_POLICY[t.id] ?? { ...NEW_CLASS_DEFAULTS, custom: false }),
  }));
}

// ── Module-level store ───────────────────────────────────────────────────────
// Pure helpers (evaluateGates, newOnboarding…) read this synchronously, so an
// edit in Administration is live for the next registration without a reload.

let library: AssetClassDef[] = seed();

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
