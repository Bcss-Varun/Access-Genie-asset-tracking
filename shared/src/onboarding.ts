// ─────────────────────────────────────────────────────────────────────────────
// Asset onboarding — the registration model from docs/21-asset-onboarding-ux.md
//
// The governing idea: an asset COMMITS after six fields (Stage B) and is then
// *enriched* in place. Everything that used to be a mandatory wizard step is
// modelled here as a named readiness GATE that the asset class decides on —
// mandatory-ness is a property of the class, not of the form.
// ─────────────────────────────────────────────────────────────────────────────

import type { Asset, SensorKind } from './domain.js';
import type { DocType, GateKey } from './registry.js';

/** Registration state machine. `Draft` assets are real, usable and visible. */
export const REGISTRATION_STATES = ['Draft', 'Pending Approval', 'Active'] as const;
export type RegistrationState = (typeof REGISTRATION_STATES)[number];

/** Where the registration came from (Stage A). Drives what gets pre-filled. */
export const SOURCE_KEYS = ['po', 'template', 'clone', 'scan', 'blank', 'import', 'erp', 'adopt'] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

/**
 * Readiness gates. A gate is satisfied by data OR by an explicit decision —
 * "run to failure" and "not tracked by policy" are complete answers.
 * Deliberate absence counts; silent absence does not.
 */
export interface GateResult {
  key: GateKey;
  label: string;
  /** True when this gate is in the class's activation policy. */
  required: boolean;
  state: 'met' | 'pending' | 'open';
  /** One line of evidence ("Plant 2 ▸ B-Block") or of what's missing. */
  detail: string;
}

// ── Tag bindings ─────────────────────────────────────────────────────────────
// A binding is a ROW, not a field: one asset can carry a QR identity label, a
// BLE beacon for location and a probe for telemetry, all at once.

export const TAG_ROLES = ['identity', 'location', 'telemetry'] as const;
export type TagRole = (typeof TAG_ROLES)[number];

/**
 * Three states, not two. "Bound but never read" is the most common real-world
 * tracking failure and it must be visible rather than counted as success.
 */
export const BINDING_STATES = ['Bound', 'Verified'] as const;
export type BindingState = (typeof BINDING_STATES)[number];

export interface TagBinding {
  id: string;
  tagId: string;
  kind: SensorKind;
  role: TagRole;
  state: BindingState;
  boundAt: string;
  verifiedAt?: string;
  /** Set when this binding replaced a damaged tag — keeps the trail unbroken. */
  replacedTagId?: string;
  /** Retired bindings are kept, never deleted (tag swaps, S7). */
  retiredAt?: string;
}

/** What the registrant decided about tracking — an intent, not an absence. */
export const TRACKING_INTENTS = ['undecided', 'pending', 'not-tracked', 'bound'] as const;
export type TrackingIntent = (typeof TRACKING_INTENTS)[number];

// ── Monitoring ───────────────────────────────────────────────────────────────

export type MonitoringRuleKey =
  | 'movement' | 'battery' | 'temperature' | 'humidity' | 'tamper' | 'geofence' | 'idle';

export interface MonitoringRule {
  key: MonitoringRuleKey;
  label: string;
  threshold: string;
  /** Resolved by role + scope, never by named individual. */
  recipients: string;
  escalation: string;
  priority: 'P1' | 'P2' | 'P3';
  /** Which telemetry channel arms this rule; absent = always armable. */
  needs?: 'temperature' | 'humidity' | 'battery' | 'position';
}

export interface MonitoringProfile {
  id: string;
  name: string;
  summary: string;
  rules: MonitoringRule[];
}

// ── Commercial ───────────────────────────────────────────────────────────────

export const OWNERSHIPS = ['Owned', 'Leased', 'Third-party'] as const;
export type Ownership = (typeof OWNERSHIPS)[number];

export interface CommercialData {
  ownership: Ownership;
  purchaseDate?: string;
  commissionDate?: string;
  purchasePrice?: number;
  vendor?: string;
  poRef?: string;
  warrantyStart?: string;
  warrantyEnd?: string;
  amcEnd?: string;
  /** Leased assets: who owns it and when it goes back. */
  lessor?: string;
  returnDate?: string;
  depreciationMethod?: string;
  usefulLifeYears?: number;
}

/** Derived warranty/age figures. Computed on read — never stored, never typed. */
export interface DerivedCommercial {
  ageDays: number | null;
  warrantyRemainingDays: number | null;
  warrantyStatus: 'Active' | 'Expiring' | 'Expired' | 'Unknown' | 'None';
  amcRemainingDays: number | null;
  bookValue: number | null;
  depreciatedToDate: number | null;
}

// ── Documents ────────────────────────────────────────────────────────────────

export interface OnboardingDoc {
  id: string;
  name: string;
  type: DocType;
  sizeKb: number;
  addedAt: string;
}

// ── The onboarding record hung off an asset ──────────────────────────────────

export interface AssetOnboarding {
  state: RegistrationState;
  source: SourceKey;
  classId: string;
  registeredAt: string;
  registeredBy: string;
  activatedAt?: string;

  /** Class-specific attribute values captured at Stage B. */
  attributes: Record<string, string | boolean>;

  // Place
  department?: string;
  locationConfirmed: boolean;

  // Track
  trackingIntent: TrackingIntent;
  bindings: TagBinding[];

  // Protect — `null` profile + decided:true means "None, by policy".
  monitoringProfileId: string | null;
  monitoringDecided: boolean;
  /** True when someone overrode the class profile for this asset alone. */
  monitoringOverridden: boolean;

  // Maintain
  maintenancePlan: 'class-default' | 'run-to-failure' | null;

  // Commercial + documents
  commercial: CommercialData;
  documents: OnboardingDoc[];

  /** Recorded when the registrant declared a fuzzy match "not a duplicate". */
  duplicateAck?: string;
  /** Voided registrations keep their stream but drop out of the registry. */
  voidedAt?: string;
}

/** An asset plus its onboarding record — what the in-session registry holds. */
export type RegisteredAsset = Asset & { onboarding: AssetOnboarding };

// ── Stage A → Stage B hand-off ───────────────────────────────────────────────

/**
 * What a source hands to the Identify step. The whole value of the source
 * picker is how much of this arrives already filled in.
 */
export interface RegistrationSeed {
  source: SourceKey;
  classId: string;
  name: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  criticality: NonNullable<Asset['criticality']>;
  category: Asset['category'];
  /** One line explaining where this came from, shown at the top of Identify. */
  provenance: string;

  vendor?: string;
  poRef?: string;
  purchasePrice?: number;
  purchaseDate?: string;
  warrantyStart?: string;
  warrantyEnd?: string;

  /** Scope-tree node id, resolved to a full location path in the Place card. */
  locationId?: string;
  custodian?: string;
  department?: string;

  /** Adopt-a-ghost-tag path: the binding exists before the asset does. */
  preboundTag?: { tagId: string; kind: SensorKind };
  /** PO lines with quantity > 1 register in a batch. */
  quantity?: number;
}

// ── Class template (P2 — inherit, don't enter) ────────────────────────────────

export interface ClassTemplate {
  classId: string;
  /** Does this class expect a tracking device at all? */
  trackingExpected: boolean;
  preferredTags: SensorKind[];
  monitoringProfileId: string | null;
  /** The activation policy: which gates this class demands. */
  activationGates: GateKey[];
  depreciationMethod: string;
  usefulLifeYears: number;
  pmPlan: string | null;
  documentChecklist: DocType[];
  defaultCriticality: Asset['criticality'];
  /** Approval is required above this purchase price (₹). */
  approvalThreshold: number;
}
