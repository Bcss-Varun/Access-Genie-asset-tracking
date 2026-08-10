// ─────────────────────────────────────────────────────────────────────────────
// Adding an asset — the contract behind the rebuilt registration flow.
//
// The old flow offered eight sources and asked every question of every asset.
// This one offers four and asks only what the thing in front of you needs.
//
// Everything here exists to serve one idea: **there is a single catalogue of
// every field an asset can carry**, and each of the three manual sources is a
// different way of deciding which of those fields to show.
//
//   Blank    — the system knows nothing, so it offers the full catalogue,
//              grouped into sections, with only the core fields required.
//   Template — someone decided in advance which fields this kind of asset
//              needs and which are mandatory. The form is that subset.
//   Clone    — an existing asset supplies every value except the ones that
//              identify one physical unit; those are blanked and must be typed.
//
// Because all three read the same catalogue, a field added here appears in the
// blank form, becomes available to template authors, and is copied or cleared
// by clone, with no further wiring.
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetCategory } from './domain.js';

/** The four ways to add an asset. The other four sources were removed. */
export const ADD_ASSET_SOURCES = ['blank', 'template', 'clone', 'import'] as const;
export type AddAssetSource = (typeof ADD_ASSET_SOURCES)[number];

/**
 * The sections a registration form is divided into, in the order they are asked.
 *
 * Order matters: identity first because it is the only part that is always
 * required, then the questions whose answers most often already exist
 * (assignment, location), then the ones that need paperwork.
 */
export const REGISTRATION_SECTIONS = [
  'identity',
  'assignment',
  'location',
  'technical',
  'commercial',
  'maintenance',
  'tracking',
] as const;
export type SectionKey = (typeof REGISTRATION_SECTIONS)[number];

export interface SectionDef {
  key: SectionKey;
  label: string;
  description: string;
  /** False for sections an asset can be created without. */
  alwaysShown: boolean;
}

export const SECTION_DEFS: Record<SectionKey, SectionDef> = {
  identity: {
    key: 'identity',
    label: 'What is it?',
    description: 'The least we need to give this thing a record of its own.',
    alwaysShown: true,
  },
  assignment: {
    key: 'assignment',
    label: 'Who holds it?',
    description: 'Leave blank if nobody has it yet — you can assign it later.',
    alwaysShown: true,
  },
  location: {
    key: 'location',
    label: 'Where is it?',
    description: 'Pre-filled from your own site. Change it if this asset lives elsewhere.',
    alwaysShown: true,
  },
  technical: {
    key: 'technical',
    label: 'Technical details',
    description: 'Specifications and network identifiers.',
    alwaysShown: false,
  },
  commercial: {
    key: 'commercial',
    label: 'Purchase & warranty',
    description: 'What it cost and who sold it. Skip it if the invoice is not to hand.',
    alwaysShown: false,
  },
  maintenance: {
    key: 'maintenance',
    label: 'Maintenance contract',
    description: 'Only if this asset is under a contract — many are not.',
    alwaysShown: false,
  },
  tracking: {
    key: 'tracking',
    label: 'Tag & tracking',
    description: 'Choose a tag type and the tag ID is issued for you.',
    alwaysShown: false,
  },
};

export const FIELD_TYPES = ['text', 'textarea', 'number', 'money', 'select', 'date', 'boolean'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/**
 * One field in the catalogue.
 *
 * `path` is where the value lands on the stored asset. It is dotted, and the
 * server walks it — so a field can sit on the asset root or deep inside the
 * embedded registration record without the form knowing the difference.
 */
export interface FieldDef {
  key: string;
  label: string;
  section: SectionKey;
  type: FieldType;
  path: string;
  /** Required no matter which source or template is in play. */
  core?: boolean;
  /**
   * Identifies one physical unit. Never copied by Clone — copying a serial
   * number is how two assets end up claiming to be the same object.
   */
  identity?: boolean;
  /**
   * The server mints this value; the form never asks for it.
   *
   * These are our own numbers, not the manufacturer's — an asset tag and a tag
   * ID mean nothing except "no other record holds this". Asking a person to
   * invent one is asking them to do a database's job badly: they guess at the
   * next number, two people guess the same one, and the uniqueness the number
   * exists for is gone. Minted from a counter, they are unique by construction.
   */
  generated?: boolean;
  /** Shown on the review step in place of an input. */
  generatedNote?: string;
  options?: readonly string[];
  unit?: string;
  placeholder?: string;
  help?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  /** Regex the value must match, as a string so it crosses the wire. */
  pattern?: string;
  patternHint?: string;
}

const OWNERSHIP_OPTIONS = ['Owned', 'Leased', 'Rented', 'Loaned'] as const;
const TRACKING_TECH_OPTIONS = ['RFID', 'BLE', 'GPS', 'QR', 'UWB', 'LoRaWAN'] as const;

/**
 * Every field the registration flow knows how to ask for.
 *
 * Two things are deliberately absent. **Criticality** was asked of every asset
 * and answered meaningfully for almost none — it is a judgement made later,
 * from usage, not something the person unboxing a laptop can supply. **Asset
 * class** went with the class library itself: templates now decide which fields
 * a kind of asset is asked for, which is what people were reaching for a class
 * to do.
 */
export const ASSET_FIELD_CATALOG: readonly FieldDef[] = [
  // ── Identity ──────────────────────────────────────────────────────────────
  {
    key: 'name', label: 'Asset name', section: 'identity', type: 'text', path: 'name',
    core: true, maxLength: 120, placeholder: 'e.g. Dell Latitude 5440 — Finance',
    help: 'How people will recognise it in a list.',
  },
  {
    key: 'category', label: 'Category', section: 'identity', type: 'select', path: 'category',
    core: true, help: 'The one axis every report groups by.',
  },
  {
    key: 'manufacturer', label: 'Manufacturer', section: 'identity', type: 'text', path: 'manufacturer',
    maxLength: 80, placeholder: 'e.g. Dell',
  },
  {
    key: 'model', label: 'Model', section: 'identity', type: 'text', path: 'model',
    maxLength: 80, placeholder: 'e.g. Latitude 5440',
  },
  {
    key: 'serialNumber', label: 'Serial number', section: 'identity', type: 'text', path: 'serialNumber',
    identity: true, maxLength: 64, placeholder: 'e.g. 7XKD9M3',
    help: 'Leave blank if the unit has none — nothing is invented for you.',
  },
  {
    key: 'assetTag', label: 'Asset tag', section: 'identity', type: 'text', path: 'onboarding.assetTag',
    identity: true, generated: true, maxLength: 64,
    generatedNote: 'Issued on save — the next free number in your inventory sequence.',
  },

  // ── Assignment ────────────────────────────────────────────────────────────
  {
    key: 'custodianName', label: 'Assigned to', section: 'assignment', type: 'text', path: 'custodian',
    maxLength: 120, placeholder: 'Type any name',
    help: 'Anyone — they do not need a login. Leave blank if unassigned.',
  },
  {
    key: 'custodianEmployeeId', label: 'Employee ID', section: 'assignment', type: 'text',
    path: 'onboarding.custodianEmployeeId', maxLength: 40, placeholder: 'e.g. BCSS-2291',
    help: 'Required whenever the asset is assigned to someone.',
  },
  {
    key: 'department', label: 'Department', section: 'assignment', type: 'text', path: 'onboarding.department',
    maxLength: 120, placeholder: 'e.g. Finance',
  },

  // ── Location ──────────────────────────────────────────────────────────────
  {
    key: 'facilityId', label: 'Site', section: 'location', type: 'select', path: 'location.id',
    core: true, help: 'Defaults to your own site.',
  },
  {
    key: 'building', label: 'Building', section: 'location', type: 'text', path: 'location.building',
    maxLength: 80,
  },
  {
    key: 'floor', label: 'Floor', section: 'location', type: 'text', path: 'location.floor', maxLength: 40 },
  {
    key: 'zone', label: 'Room / zone', section: 'location', type: 'text', path: 'location.zone',
    maxLength: 80, placeholder: 'e.g. Desk 14, Server Room A',
  },

  // ── Technical ─────────────────────────────────────────────────────────────
  {
    key: 'macAddress', label: 'MAC address', section: 'technical', type: 'text',
    path: 'onboarding.attributes.macAddress', identity: true, maxLength: 32,
    placeholder: '00:1B:44:11:3A:B7',
    pattern: '^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$',
    patternHint: 'Six pairs of hex digits, e.g. 00:1B:44:11:3A:B7',
  },
  {
    key: 'ipAddress', label: 'IP address', section: 'technical', type: 'text',
    path: 'onboarding.attributes.ipAddress', maxLength: 45, placeholder: '10.0.4.12',
  },
  {
    key: 'imei', label: 'IMEI', section: 'technical', type: 'text',
    path: 'onboarding.attributes.imei', identity: true, maxLength: 20,
    pattern: '^[0-9]{14,16}$', patternHint: '14–16 digits',
  },
  {
    key: 'processor', label: 'Processor', section: 'technical', type: 'text',
    path: 'onboarding.attributes.processor', maxLength: 80, placeholder: 'e.g. Intel i7-1355U',
  },
  {
    key: 'ramGb', label: 'RAM', section: 'technical', type: 'number',
    path: 'onboarding.attributes.ramGb', unit: 'GB', min: 0, max: 4096,
  },
  {
    key: 'storageGb', label: 'Storage', section: 'technical', type: 'number',
    path: 'onboarding.attributes.storageGb', unit: 'GB', min: 0, max: 1048576,
  },
  {
    key: 'operatingSystem', label: 'Operating system', section: 'technical', type: 'text',
    path: 'onboarding.attributes.operatingSystem', maxLength: 80, placeholder: 'e.g. Windows 11 Pro',
  },
  {
    key: 'notes', label: 'Notes', section: 'technical', type: 'textarea',
    path: 'onboarding.attributes.notes', maxLength: 500,
  },

  // ── Commercial ────────────────────────────────────────────────────────────
  {
    key: 'ownership', label: 'Ownership', section: 'commercial', type: 'select',
    path: 'onboarding.commercial.ownership', options: OWNERSHIP_OPTIONS,
  },
  {
    key: 'purchaseDate', label: 'Purchase date', section: 'commercial', type: 'date', path: 'purchaseDate',
  },
  {
    key: 'purchasePrice', label: 'Purchase price', section: 'commercial', type: 'money',
    path: 'purchasePrice', min: 0,
  },
  {
    key: 'vendor', label: 'Vendor', section: 'commercial', type: 'text',
    path: 'onboarding.commercial.vendor', maxLength: 120,
  },
  {
    key: 'poRef', label: 'PO reference', section: 'commercial', type: 'text',
    path: 'onboarding.commercial.poRef', maxLength: 60,
  },
  {
    key: 'warrantyEnd', label: 'Warranty expires', section: 'commercial', type: 'date',
    path: 'warrantyExpiry',
  },

  // ── Maintenance ───────────────────────────────────────────────────────────
  {
    key: 'hasMaintenanceContract', label: 'Under a maintenance contract', section: 'maintenance',
    type: 'boolean', path: 'onboarding.maintenance.hasContract',
    help: 'Most assets are not. Leave off and the rest of this section stays hidden.',
  },
  {
    key: 'amcProvider', label: 'Contract provider', section: 'maintenance', type: 'text',
    path: 'onboarding.maintenance.provider', maxLength: 120,
  },
  {
    key: 'amcRef', label: 'Contract reference', section: 'maintenance', type: 'text',
    path: 'onboarding.maintenance.reference', maxLength: 80,
  },
  {
    key: 'amcEnd', label: 'Contract expires', section: 'maintenance', type: 'date',
    path: 'onboarding.commercial.amcEnd',
  },

  // ── Tracking ──────────────────────────────────────────────────────────────
  {
    key: 'trackingTech', label: 'Tag type', section: 'tracking', type: 'select', path: 'trackingTech',
    options: TRACKING_TECH_OPTIONS,
  },
  {
    key: 'trackingId', label: 'Tag ID', section: 'tracking', type: 'text', path: 'trackingId',
    identity: true, generated: true, maxLength: 64,
    generatedNote: 'Issued on save, once a tag type is chosen — readers match on this.',
  },
];

// ── Lookups ──────────────────────────────────────────────────────────────────

const BY_KEY = new Map(ASSET_FIELD_CATALOG.map((f) => [f.key, f]));

export const fieldByKey = (key: string): FieldDef | undefined => BY_KEY.get(key);

export const fieldsInSection = (section: SectionKey): FieldDef[] =>
  ASSET_FIELD_CATALOG.filter((f) => f.section === section);

/** Always required, whatever the source. */
export const CORE_FIELD_KEYS: readonly string[] = ASSET_FIELD_CATALOG.filter((f) => f.core).map((f) => f.key);

/** Cleared by Clone — these identify one physical unit. */
export const IDENTITY_FIELD_KEYS: readonly string[] = ASSET_FIELD_CATALOG.filter((f) => f.identity).map((f) => f.key);

/** Minted by the server. Never rendered as an input, never picked in a template. */
export const GENERATED_FIELD_KEYS: readonly string[] = ASSET_FIELD_CATALOG.filter((f) => f.generated).map((f) => f.key);

/**
 * Fields a template answers on the form's behalf.
 *
 * A template *is* a decision about a kind of asset, and its category is that
 * decision written down. Asking again on the form it produces invites the one
 * answer that cannot be right — a Computer template filed under Furniture — so
 * the question is not asked and the template's own category is used.
 */
export const TEMPLATE_FIXED_FIELD_KEYS: readonly string[] = ['category'];

/** Everything a form can actually render: not minted, not fixed by a template. */
export const isAskable = (field: FieldDef, source: AddAssetSource): boolean =>
  !field.generated && !(source === 'template' && TEMPLATE_FIXED_FIELD_KEYS.includes(field.key));

/**
 * A value the asset will carry that the form did not ask for.
 *
 * Both kinds are shown on the review step, because "we never asked" and "it
 * will be blank" look identical otherwise, and only one of them is a problem.
 */
export interface DerivedField {
  key: string;
  label: string;
  section: SectionKey;
  /** `generated` — minted on save. `template` — decided by the template. */
  origin: 'generated' | 'template';
  /** Present for template-fixed fields; generated ones have no value yet. */
  value?: string;
  note: string;
}

// ── Templates ────────────────────────────────────────────────────────────────

/**
 * A field a template has chosen to ask for.
 *
 * `required` is the template author's decision and is the whole point of the
 * feature: a Computer template can insist on a MAC address while a Furniture
 * template never mentions one.
 */
export interface TemplateField {
  /** Catalogue key, or the key of a custom field defined on this template. */
  key: string;
  required: boolean;
  /** Prefilled when the form opens. Strings cross the wire unparsed. */
  defaultValue?: string | number | boolean;
  order: number;
}

/** A field this template invents, for anything the catalogue does not cover. */
export interface TemplateCustomField {
  key: string;
  label: string;
  section: SectionKey;
  type: FieldType;
  options?: string[];
  unit?: string;
  help?: string;
  required: boolean;
  identity?: boolean;
  order: number;
}

export interface AssetTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AssetCategory;
  fields: TemplateField[];
  customFields: TemplateCustomField[];
  status: 'active' | 'archived';
  usageCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Resolve a template into the field list a form should render.
 *
 * Core fields are always included even when a template forgets them, because an
 * asset without a name and a site is not a record. Everything else is the
 * template author's choice, in their order.
 *
 * Two classes of field are then removed regardless of what the author picked:
 * the ones the server mints, and the ones the template itself already answers.
 * Both are still saved — they are just not questions.
 */
export function resolveTemplateFields(
  template: Pick<AssetTemplate, 'fields' | 'customFields'>,
): { field: FieldDef; required: boolean; defaultValue?: string | number | boolean }[] {
  const chosen = new Map<string, TemplateField>(template.fields.map((f) => [f.key, f]));

  // Core first, so a template can never produce an unsavable form.
  for (const key of CORE_FIELD_KEYS) {
    if (!chosen.has(key)) chosen.set(key, { key, required: true, order: -1 });
  }

  const custom = new Map(template.customFields.map((c) => [c.key, c]));

  return [...chosen.values()]
    .map((sel) => {
      const cf = custom.get(sel.key);
      const field: FieldDef | undefined = cf
        ? {
            key: cf.key, label: cf.label, section: cf.section, type: cf.type,
            path: `onboarding.attributes.${cf.key}`,
            options: cf.options, unit: cf.unit, help: cf.help, identity: cf.identity,
          }
        : BY_KEY.get(sel.key);
      return field ? { field, required: sel.required || !!field.core, defaultValue: sel.defaultValue, order: sel.order } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .filter(({ field }) => isAskable(field, 'template'))
    .sort((a, b) => a.order - b.order)
    .map(({ field, required, defaultValue }) => ({ field, required, defaultValue }));
}

// ── Registration payloads ────────────────────────────────────────────────────

/** What the form submits: flat catalogue keys, whatever the section. */
export interface RegistrationDraft {
  source: AddAssetSource;
  templateId?: string;
  cloneOfId?: string;
  values: Record<string, string | number | boolean | null>;
}

export interface FieldError {
  key: string;
  section: SectionKey;
  message: string;
}

export interface SectionStatus {
  key: SectionKey;
  label: string;
  /** Fields in this section the current form is asking for. */
  total: number;
  filled: number;
  requiredTotal: number;
  requiredFilled: number;
  complete: boolean;
  errors: FieldError[];
}

export interface RegistrationValidation {
  valid: boolean;
  errors: FieldError[];
  sections: SectionStatus[];
}

/** What the flow needs before it can render: defaults derived from who you are. */
export interface RegistrationDefaults {
  location: { id: string; name: string; building?: string; floor?: string; zone?: string } | null;
  /** Sites this user may file an asset against, nearest first. */
  facilities: { id: string; name: string }[];
  department: string | null;
  registeredBy: string;
}

/** Clone prefill: the values to copy, and the ones the user must supply. */
export interface ClonePrefill {
  sourceId: string;
  sourceName: string;
  values: Record<string, string | number | boolean | null>;
  /** Catalogue keys deliberately left empty — identity fields. */
  clearedFields: { key: string; label: string }[];
}
