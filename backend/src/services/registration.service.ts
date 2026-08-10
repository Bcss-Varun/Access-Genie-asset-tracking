import {
  ASSET_CATEGORIES,
  ASSET_FIELD_CATALOG,
  CORE_FIELD_KEYS,
  REGISTRATION_SECTIONS,
  SECTION_DEFS,
  fieldByKey,
  isAskable,
  resolveTemplateFields,
  type AddAssetSource,
  type ClonePrefill,
  type DerivedField,
  type FieldDef,
  type FieldError,
  type RegistrationDefaults,
  type RegistrationValidation,
  type SectionKey,
  type SectionStatus,
} from '@access-genie/shared';
import { Asset, AssetTemplate, ScopeNodeModel, nextId, type AssetTemplateDoc, type UserDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import type { RegistrationDraftInput } from '../validators/registration.validator.js';

/** A field the form is asking for, with the decision about whether it is required. */
export interface ResolvedField {
  field: FieldDef;
  required: boolean;
  defaultValue?: string | number | boolean;
}

type Value = string | number | boolean | null | undefined;

// ── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Write `value` at a dotted path, creating objects on the way down.
 *
 * This is what lets the catalogue describe a flat form while the asset keeps a
 * nested shape: the form posts `{ vendor: 'Dell' }` and this puts it at
 * `onboarding.commercial.vendor` without the form knowing that path exists.
 */
function setByPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let node = target;
  for (const part of parts.slice(0, -1)) {
    if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
    node = node[part] as Record<string, unknown>;
  }
  node[parts[parts.length - 1] as string] = value;
}

function getByPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    source,
  );
}

const isBlank = (v: Value): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

// ── Field resolution ─────────────────────────────────────────────────────────

/**
 * Which fields is this registration asking for, and which of them are required?
 *
 * Blank and clone offer the whole catalogue with only core fields required —
 * the system does not know what the asset is, so it cannot insist on anything
 * beyond a name, a category and a site. A template narrows the list to what its
 * author chose and applies their required flags.
 */
export async function resolveFields(source: AddAssetSource, templateId?: string): Promise<ResolvedField[]> {
  if (source === 'template') {
    const template = await loadTemplate(templateId);
    return resolveTemplateFields(template);
  }

  return ASSET_FIELD_CATALOG.filter((field) => isAskable(field, source)).map((field) => ({
    field,
    required: !!field.core,
  }));
}

async function loadTemplate(templateId?: string): Promise<AssetTemplateDoc> {
  const template = await AssetTemplate.findById(templateId).lean<AssetTemplateDoc>();
  if (!template) throw ApiError.notFound('Template');
  if (template.status === 'archived') {
    throw ApiError.conflict('That template has been archived and cannot be used for new assets');
  }
  return template;
}

/**
 * The values the asset will carry that the form never asked for.
 *
 * The review step needs these: a person who is shown eleven answers and told
 * "this is what will be saved" reasonably concludes that the asset tag they
 * cannot see is not going to exist. Naming them, and saying where each comes
 * from, is the difference between a summary and a half-truth.
 */
export async function derivedFields(source: AddAssetSource, templateId?: string): Promise<DerivedField[]> {
  const derived: DerivedField[] = ASSET_FIELD_CATALOG.filter((f) => f.generated).map((f) => ({
    key: f.key,
    label: f.label,
    section: f.section,
    origin: 'generated' as const,
    note: f.generatedNote ?? 'Issued automatically on save.',
  }));

  if (source === 'template') {
    const template = await loadTemplate(templateId);
    const category = fieldByKey('category');
    if (category) {
      derived.unshift({
        key: category.key,
        label: category.label,
        section: category.section,
        origin: 'template',
        value: template.category,
        note: `Set by the ${template.name} template.`,
      });
    }
  }

  return derived;
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a draft against the fields it is actually being asked for.
 *
 * Returns per-section completeness rather than a flat error list, because the
 * form is sectioned and needs to say *where* the problem is without the user
 * opening every panel to find it.
 */
export function validateDraft(
  values: Record<string, Value>,
  fields: ResolvedField[],
): RegistrationValidation {
  const errors: FieldError[] = [];
  const add = (key: string, section: SectionKey, message: string) => errors.push({ key, section, message });

  for (const { field, required } of fields) {
    const raw = values[field.key];

    if (isBlank(raw)) {
      if (required) add(field.key, field.section, `${field.label} is required.`);
      continue;
    }

    if (field.type === 'number' || field.type === 'money') {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isNaN(n)) {
        add(field.key, field.section, `${field.label} must be a number.`);
        continue;
      }
      if (field.min !== undefined && n < field.min) add(field.key, field.section, `${field.label} cannot be below ${field.min}.`);
      if (field.max !== undefined && n > field.max) add(field.key, field.section, `${field.label} cannot be above ${field.max}.`);
      continue;
    }

    if (field.type === 'boolean') continue;

    if (field.type === 'date') {
      if (Number.isNaN(Date.parse(String(raw)))) add(field.key, field.section, `${field.label} is not a valid date.`);
      continue;
    }

    const text = String(raw).trim();

    if (field.maxLength && text.length > field.maxLength) {
      add(field.key, field.section, `${field.label} cannot be longer than ${field.maxLength} characters.`);
    }
    if (field.pattern && !new RegExp(field.pattern).test(text)) {
      add(field.key, field.section, field.patternHint ?? `${field.label} is not in the expected format.`);
    }
    if (field.type === 'select' && field.options && !field.options.includes(text)) {
      add(field.key, field.section, `${field.label} must be one of: ${field.options.join(', ')}.`);
    }
    if (field.key === 'category' && !ASSET_CATEGORIES.includes(text as (typeof ASSET_CATEGORIES)[number])) {
      add(field.key, field.section, `Category must be one of: ${ASSET_CATEGORIES.join(', ')}.`);
    }
    if (field.key === 'serialNumber' && text.length < 2) {
      add(field.key, field.section, 'A serial number needs at least 2 characters — or leave it blank.');
    }
  }

  // ── Cross-field rules ──────────────────────────────────────────────────────
  // Assignment is optional, but a half-filled assignment is not: a custodian
  // without an employee ID is exactly the unresolvable name the old flow
  // produced, and the whole point of dropping the user picker was to stop that.
  const asking = new Set(fields.map((f) => f.field.key));
  if (asking.has('custodianName') && asking.has('custodianEmployeeId')) {
    const named = !isBlank(values.custodianName);
    const identified = !isBlank(values.custodianEmployeeId);
    if (named && !identified) {
      add('custodianEmployeeId', 'assignment', 'An employee ID is required when the asset is assigned to someone.');
    }
    if (identified && !named) {
      add('custodianName', 'assignment', 'Enter the name this employee ID belongs to.');
    }
  }

  // The maintenance section only makes sense once someone says there is a
  // contract; if they do, we need to know whose.
  if (values.hasMaintenanceContract === true && asking.has('amcProvider') && isBlank(values.amcProvider)) {
    add('amcProvider', 'maintenance', 'Name the provider, or turn the contract toggle off.');
  }

  // Tracking has no cross-field rule left to enforce: the tag ID is minted from
  // the tag type, so the mismatch that rule existed to catch — an ID with no
  // technology to read it — is no longer expressible.

  // ── Section rollup ─────────────────────────────────────────────────────────
  const sections: SectionStatus[] = REGISTRATION_SECTIONS.map((key) => {
    const inSection = fields.filter((f) => f.field.section === key);
    const required = inSection.filter((f) => f.required);
    const sectionErrors = errors.filter((e) => e.section === key);
    return {
      key,
      label: SECTION_DEFS[key].label,
      total: inSection.length,
      filled: inSection.filter((f) => !isBlank(values[f.field.key])).length,
      requiredTotal: required.length,
      requiredFilled: required.filter((f) => !isBlank(values[f.field.key])).length,
      complete: sectionErrors.length === 0 && required.every((f) => !isBlank(values[f.field.key])),
      errors: sectionErrors,
    };
  }).filter((s) => s.total > 0);

  return { valid: errors.length === 0, errors, sections };
}

// ── Minting our own numbers ──────────────────────────────────────────────────

/** Tag technology → the prefix its tag IDs carry, so a reader ID reads as one. */
const TAG_PREFIX: Record<string, string> = {
  RFID: 'RFID', BLE: 'BLE', GPS: 'GPS', QR: 'QR', UWB: 'UWB', LoRaWAN: 'LORA',
};

/**
 * Reserve an identifier nothing else holds.
 *
 * `nextId` is atomic, so two simultaneous registrations cannot be handed the
 * same number. The existence check on top of it guards a different case: a
 * seeded or imported record that already occupies a number the counter has not
 * reached yet. Without it the first real registration collides with fixture
 * data and fails a unique index for reasons no user could act on.
 */
async function mintUnique(
  sequence: string,
  prefix: string,
  taken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = await nextId(sequence, prefix);
    if (!(await taken(candidate))) return candidate;
  }
  throw ApiError.conflict(`Could not reserve a free ${prefix} number — the sequence looks exhausted`);
}

const assetTagTaken = async (tag: string) =>
  (await Asset.countDocuments({ 'onboarding.assetTag': tag }).limit(1)) > 0;

const tagIdTaken = async (id: string) => (await Asset.countDocuments({ trackingId: id }).limit(1)) > 0;

// ── Payload building ─────────────────────────────────────────────────────────

/**
 * Turn a validated draft into the payload `assetService.createAsset` takes.
 *
 * Goes through that service rather than writing the document here so a
 * registration gets the same treatment as any other create: the activity entry,
 * the map position, the custody record and the device-estate projection.
 */
export async function buildCreateInput(
  draft: RegistrationDraftInput,
  fields: ResolvedField[],
  actor: string,
): Promise<Record<string, unknown>> {
  const values: Record<string, Value> = { ...draft.values };

  // Template defaults fill anything the user left untouched.
  for (const { field, defaultValue } of fields) {
    if (defaultValue !== undefined && isBlank(values[field.key])) values[field.key] = defaultValue;
  }

  const payload: Record<string, unknown> = {};
  const asking = new Map(fields.map((f) => [f.field.key, f.field]));

  for (const [key, field] of asking) {
    const raw = values[key];
    if (isBlank(raw) && field.type !== 'boolean') continue;

    let value: unknown = raw;
    if (field.type === 'number' || field.type === 'money') value = Number(raw);
    else if (field.type === 'boolean') value = raw === true || raw === 'true';
    else if (field.type === 'date') value = new Date(String(raw)).toISOString();
    else value = String(raw).trim();

    setByPath(payload, field.path, value);
  }

  // A template answers the category itself — the form did not ask, so take it
  // from the template rather than leaving the asset uncategorised.
  if (draft.templateId) {
    const template = await loadTemplate(draft.templateId);
    payload.category = template.category;
  }

  // Our own numbers, minted rather than typed. The asset tag is unconditional —
  // every asset gets one, that is what makes it findable on a shelf. The tag ID
  // exists only if there is a tag technology to read it.
  setByPath(payload, 'onboarding.assetTag', await mintUnique('assetTag', 'AG', assetTagTaken));

  const tech = isBlank(values.trackingTech) ? null : String(values.trackingTech).trim();
  if (tech) {
    payload.trackingId = await mintUnique('trackingTag', TAG_PREFIX[tech] ?? 'TAG', tagIdTaken);
  }

  // Location needs a name as well as an id; the form only picks the id.
  const facilityId = values.facilityId;
  if (!isBlank(facilityId)) {
    const node = await ScopeNodeModel.findById(String(facilityId)).lean();
    if (!node) throw ApiError.validation('Unknown site', [{ path: 'facilityId', message: 'That site does not exist' }]);
    setByPath(payload, 'location.id', node._id);
    setByPath(payload, 'location.name', node.name);
  }

  // The registration record itself. Built here rather than asked for, because
  // none of it is the registrant's decision.
  const onboarding = (payload.onboarding ?? {}) as Record<string, unknown>;
  onboarding.state = 'Active';
  onboarding.source = draft.source;
  onboarding.classId = (onboarding.classId as string | undefined) ?? '';
  onboarding.registeredAt = new Date().toISOString();
  onboarding.registeredBy = actor;
  onboarding.activatedAt = new Date().toISOString();
  onboarding.locationConfirmed = !isBlank(facilityId);
  onboarding.trackingIntent = tech ? 'bound' : 'not-tracked';
  if (draft.templateId) onboarding.templateId = draft.templateId;
  if (draft.cloneOfId) onboarding.clonedFromId = draft.cloneOfId;

  const commercial = (onboarding.commercial ?? {}) as Record<string, unknown>;
  commercial.ownership = (commercial.ownership as string | undefined) ?? 'Owned';
  onboarding.commercial = commercial;

  payload.onboarding = onboarding;

  // `custodian` is required on the stored document; an unassigned asset is
  // explicitly Unassigned rather than blank, so nothing downstream has to cope.
  if (isBlank(payload.custodian as Value)) payload.custodian = 'Unassigned';

  return payload;
}

/** Bump the usage counter after a template produced an asset. */
export async function noteTemplateUse(templateId: string): Promise<void> {
  await AssetTemplate.updateOne({ _id: templateId }, { $inc: { usageCount: 1 } });
}

// ── Defaults derived from who is asking ──────────────────────────────────────

/**
 * Where this user's assets go by default.
 *
 * A facility manager at the Hyderabad warehouse should not have to tell the
 * system where they are on every registration — their scope already says. The
 * default is the nearest facility at or beneath their home scope; the full list
 * is every facility they can see, so an asset that lives elsewhere is still one
 * click away rather than blocked.
 */
export async function registrationDefaults(user: Pick<UserDoc, 'name' | 'homeScopeId'>): Promise<RegistrationDefaults> {
  const rows = await ScopeNodeModel.find().lean();
  const byParent = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.parentId ?? '__root__';
    byParent.set(key, [...(byParent.get(key) ?? []), r]);
  }

  /** The user's own node, plus everything beneath it. */
  const subtree: typeof rows = [];
  const walk = (id: string) => {
    const node = rows.find((r) => r._id === id);
    if (node) subtree.push(node);
    for (const child of byParent.get(id) ?? []) walk(child._id);
  };
  if (user.homeScopeId) walk(user.homeScopeId);

  const facilities = (subtree.length ? subtree : rows).filter((r) => r.level === 'facility');

  // Nearest first: the home scope itself if it is a facility, else the first
  // facility found walking down from it.
  const home = rows.find((r) => r._id === user.homeScopeId);
  const nearest = home?.level === 'facility' ? home : facilities[0];

  return {
    location: nearest ? { id: nearest._id, name: nearest.name } : null,
    facilities: facilities.map((f) => ({ id: f._id, name: f.name })),
    department: null,
    registeredBy: user.name,
  };
}

// ── Clone ────────────────────────────────────────────────────────────────────

/**
 * Everything about an existing asset except what makes it that one unit.
 *
 * Identity fields — serial, asset tag, tag ID, MAC, IMEI — are returned in
 * `clearedFields` rather than silently omitted, so the form can say *these are
 * the five things you have to type* instead of leaving the user to notice.
 */
export async function clonePrefill(assetId: string): Promise<ClonePrefill> {
  const asset = await Asset.findById(assetId).lean();
  if (!asset) throw ApiError.notFound('Asset');

  const values: Record<string, string | number | boolean | null> = {};
  const clearedFields: { key: string; label: string }[] = [];

  for (const field of ASSET_FIELD_CATALOG) {
    // A minted field is neither copied nor asked for — the clone gets its own
    // number on save, so listing it as "you must supply this" would be a lie.
    if (field.generated) continue;

    if (field.identity) {
      clearedFields.push({ key: field.key, label: field.label });
      values[field.key] = '';
      continue;
    }

    const raw = getByPath(asset, field.path);
    if (raw === undefined || raw === null) continue;

    if (raw instanceof Date) values[field.key] = raw.toISOString().slice(0, 10);
    else if (typeof raw === 'object') continue; // never copy a sub-document wholesale
    else values[field.key] = raw as string | number | boolean;
  }

  // A clone is a new unit, not a copy of a record: it starts unassigned so the
  // original custodian does not silently acquire a second machine.
  values.custodianName = '';
  values.custodianEmployeeId = '';

  return {
    sourceId: asset._id,
    sourceName: asset.name,
    values,
    clearedFields,
  };
}

// ── Templates ────────────────────────────────────────────────────────────────

export async function listTemplates(query: { category?: string; status?: string; q?: string }) {
  const filter: Record<string, unknown> = {};
  if (query.status && query.status !== 'all') filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.q) filter.name = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  return AssetTemplate.find(filter).sort({ usageCount: -1, name: 1 }).lean();
}

export async function getTemplate(id: string) {
  const tpl = await AssetTemplate.findById(id).lean();
  if (!tpl) throw ApiError.notFound('Template');
  return tpl;
}

export async function createTemplate(input: Record<string, unknown>, actor: string) {
  const id = (input.id as string | undefined) ?? (await nextId('assetTemplate', 'TPL'));
  const existing = await AssetTemplate.findById(id).lean();
  if (existing) throw ApiError.conflict(`Template ${id} already exists`);

  const tpl = await AssetTemplate.create({ ...input, _id: id, createdBy: actor });
  return tpl.toObject();
}

export async function updateTemplate(id: string, input: Record<string, unknown>) {
  const tpl = await AssetTemplate.findById(id);
  if (!tpl) throw ApiError.notFound('Template');

  const defined = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  Object.assign(tpl, defined);
  await tpl.save();
  return tpl.toObject();
}

/**
 * Archive rather than delete.
 *
 * Assets keep `onboarding.templateId`, and a deleted template turns that into a
 * dangling reference — the record could no longer explain why it asks for the
 * fields it does.
 */
export async function archiveTemplate(id: string) {
  const tpl = await AssetTemplate.findById(id);
  if (!tpl) throw ApiError.notFound('Template');
  tpl.status = 'archived';
  await tpl.save();
  return tpl.toObject();
}

/**
 * The catalogue, grouped the way a template editor renders it.
 *
 * Scoped to what a template can actually decide. A minted field is not the
 * author's to include, and the category is the one they answered in the
 * template's own header — offering either back as a tick-box would be offering
 * a choice that has no effect.
 */
export function fieldCatalog() {
  const pickable = ASSET_FIELD_CATALOG.filter((f) => isAskable(f, 'template'));
  return {
    sections: REGISTRATION_SECTIONS.map((key) => ({
      ...SECTION_DEFS[key],
      fields: pickable.filter((f) => f.section === key),
    })),
    coreFields: CORE_FIELD_KEYS.filter((key) => pickable.some((f) => f.key === key)),
    identityFields: pickable.filter((f) => f.identity).map((f) => f.key),
  };
}

export { fieldByKey };
