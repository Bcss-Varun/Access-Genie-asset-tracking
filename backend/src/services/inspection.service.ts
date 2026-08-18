import type { PipelineStage } from 'mongoose';
import {
  ASSET_CATEGORIES,
  INSPECTION_STATUSES,
  INSPECTION_TRANSITIONS,
  INSPECTION_TYPES,
  OPEN_INSPECTION_STATUSES,
  type ApiMeta,
  type AssetCategory,
  type InspectionFacets,
  type InspectionFailure,
  type InspectionPlacement,
  type InspectionQuestionType,
  type InspectionResult,
  type InspectionStats,
  type InspectionStatus,
  type InspectionType,
} from '@access-genie/shared';
import {
  Activity,
  Asset,
  Inspection,
  InspectionTemplate,
  ScopeNodeModel,
  Technician,
  User,
  WorkOrder,
  nextId,
  type InspectionDoc,
  type InspectionResponseSub,
  type InspectionTemplateDoc,
  type ScopeNodeDoc,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import { markEstateChanged } from './derivation.scheduler.js';
import { descendantIds } from './scopeFilter.service.js';
import { buildMeta } from '../utils/response.js';
import { escapeRegex, parsePagination } from '../utils/query.js';
import type {
  CreateInspectionInput,
  CreateInspectionTemplateInput,
  InspectionListQuery,
  RespondInput,
  UpdateInspectionTemplateInput,
} from '../validators/inspection.validator.js';

/**
 * Inspections & Checklists — one module.
 *
 * A template is the reusable body of checks; an inspection is one execution of
 * it against one asset. Three rules carry most of the behaviour:
 *
 * **The server grades, the client answers.** A response arrives as a raw value
 * — "Pass", "No", `24.5` — and `grade()` turns it into Pass/Fail/N/A/Pending
 * against the checkpoint's own type and rule. Letting a client send `result`
 * directly would make the compliance record whatever the browser said it was.
 *
 * **A checkpoint's definition is copied into the inspection, never referenced.**
 * Editing a template must not rewrite an inspection somebody already signed off.
 *
 * **Outcome is derived, not chosen.** An inspection with a failed checkpoint is
 * Failed; there is no way to complete one as Passed while a failure stands.
 */

const SORTABLE = ['scheduledFor', 'status', 'title', 'createdAt', 'updatedAt', 'completedAt'];
const UNASSIGNED = 'Unassigned';
const ASSET_COLLECTION = Asset.collection.name;

// ─────────────────────────────────────────────────────────────────────────────
// Grading
// ─────────────────────────────────────────────────────────────────────────────

/** A checkpoint's definition, as carried on either a template or a response. */
interface Checkpoint {
  type: InspectionQuestionType;
  min?: number;
  max?: number;
  failWhen?: 'Fail' | 'No' | 'Yes';
}

/**
 * Turn a raw answer into an outcome.
 *
 * The rules per type, and why each is what it is:
 *
 * - **Pass/Fail, Yes/No** — `failWhen` names the bad answer, defaulting to the
 *   obvious one. It exists because "Is the guard damaged?" is a question where
 *   *yes* is the failure, and a checklist that cannot say so forces every
 *   question to be written backwards. `N/A` is always allowed and never fails.
 *
 * - **Number** — fails outside `[min, max]`. With no band configured a number is
 *   a reading, not a test, so it passes once answered: inventing a threshold
 *   would fail readings nobody said were wrong.
 *
 * - **Text, Note** — informational. They cannot fail on their own; a defect is
 *   recorded by failing the checkpoint that tests for it. Grading free text
 *   would mean guessing at sentiment.
 */
function grade(checkpoint: Checkpoint, value: unknown): InspectionResult {
  if (value === null || value === undefined || value === '') return 'Pending';

  switch (checkpoint.type) {
    case 'Pass/Fail': {
      const answer = String(value);
      if (answer === 'N/A') return 'N/A';
      if (answer !== 'Pass' && answer !== 'Fail') return 'Pending';
      return answer === (checkpoint.failWhen ?? 'Fail') ? 'Fail' : 'Pass';
    }

    case 'Yes/No': {
      // Booleans and strings both arrive here — a checkbox sends one, a select
      // the other — so they are normalised before the rule is applied.
      const answer = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
      if (answer === 'N/A') return 'N/A';
      if (answer !== 'Yes' && answer !== 'No') return 'Pending';
      return answer === (checkpoint.failWhen ?? 'No') ? 'Fail' : 'Pass';
    }

    case 'Number': {
      const answer = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(answer)) return 'Pending';
      if (checkpoint.min !== undefined && answer < checkpoint.min) return 'Fail';
      if (checkpoint.max !== undefined && answer > checkpoint.max) return 'Fail';
      return 'Pass';
    }

    case 'Text':
    case 'Note':
      return String(value).trim().length > 0 ? 'Pass' : 'Pending';

    default:
      return 'Pending';
  }
}

/** Recount `summary` from `responses`. Called on every write that touches them. */
function recount(responses: InspectionResponseSub[]): InspectionDoc['summary'] {
  return {
    total: responses.length,
    passed: responses.filter((r) => r.result === 'Pass').length,
    failed: responses.filter((r) => r.result === 'Fail').length,
    na: responses.filter((r) => r.result === 'N/A').length,
    pending: responses.filter((r) => r.result === 'Pending').length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Placement
// ─────────────────────────────────────────────────────────────────────────────

interface Hierarchy {
  byId: Map<string, ScopeNodeDoc>;
  rows: ScopeNodeDoc[];
}

async function loadHierarchy(): Promise<Hierarchy> {
  const rows = await ScopeNodeModel.find().lean<ScopeNodeDoc[]>();
  return { rows, byId: new Map(rows.map((r) => [r._id, r])) };
}

function nearestAncestor(byId: Map<string, ScopeNodeDoc>, start: string, level: string): ScopeNodeDoc | null {
  const seen = new Set<string>();
  let node = byId.get(start);
  while (node && !seen.has(node._id)) {
    seen.add(node._id); // a cycle in the adjacency list would otherwise spin forever
    if (node.level === level) return node;
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return null;
}

/**
 * Facility and organisation, resolved from the asset.
 *
 * Not stored on the inspection, for the same reason work orders do not store
 * it: an asset that moves would leave every historic record naming the wrong
 * warehouse, with nothing to detect the drift.
 */
function placementFor(hierarchy: Hierarchy, location: { id?: string; name?: string } | undefined): InspectionPlacement {
  const locationId = location?.id ?? null;
  const facility = locationId ? nearestAncestor(hierarchy.byId, locationId, 'facility') : null;
  const organization = locationId ? nearestAncestor(hierarchy.byId, locationId, 'org') : null;

  return {
    facilityId: facility?._id ?? null,
    facilityName: facility?.name ?? 'Unassigned',
    organizationId: organization?._id ?? null,
    organizationName: organization?.name ?? 'Unassigned',
    locationId,
    locationName: location?.name ?? 'Unassigned',
  };
}

type JoinedInspection = InspectionDoc & { __asset?: { location?: { id?: string; name?: string }; category?: string } };

function present(rows: JoinedInspection[], hierarchy: Hierarchy): InspectionDoc[] {
  return rows.map((row) => {
    const { __asset, ...rest } = row;
    return { ...rest, placement: placementFor(hierarchy, __asset?.location) } as InspectionDoc;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────────────────────

function csvEnum<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] | undefined {
  if (!raw) return undefined;
  const wanted = new Set(raw.split(',').map((part) => part.trim()));
  const matched = allowed.filter((value) => wanted.has(value));
  return matched.length > 0 ? matched : undefined;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

async function facilitySubtree(facilityId: string): Promise<string[] | null> {
  const rows = await ScopeNodeModel.find().lean<ScopeNodeDoc[]>();
  const node = rows.find((r) => r._id === facilityId);
  if (!node) throw ApiError.notFound('Facility');
  // A parentless node covers everything, so it resolves to no filter rather
  // than a set that would wrongly exclude assets with no location.
  if (!node.parentId) return null;
  return [...descendantIds(rows, facilityId)];
}

/** The stages every inspection read shares. Mirrors the work-order builder. */
async function matchStages(query: Partial<InspectionListQuery>): Promise<PipelineStage[]> {
  const stages: PipelineStage[] = [];
  const match: Record<string, unknown> = {};

  const status = csvEnum(query.status, INSPECTION_STATUSES);
  if (status) match.status = { $in: status };

  const type = csvEnum(query.type, INSPECTION_TYPES);
  if (type) match.type = { $in: type };

  if (query.templateId) match.templateId = query.templateId;
  if (query.assetId) match.assetId = query.assetId;

  if (query.unassigned === 'true') match.assignedTo = UNASSIGNED;
  else if (query.assignedTo) match.assignedTo = query.assignedTo;

  // Overdue is "not carried out yet and past its date" — a completed
  // inspection that happened late is history, not a backlog item, so including
  // it would mean the number never comes down.
  if (query.overdue === 'true') {
    match.scheduledFor = { $lt: new Date() };
    match.status = { $in: status ? status.filter((s) => OPEN_INSPECTION_STATUSES.includes(s)) : OPEN_INSPECTION_STATUSES };
  } else {
    const from = parseDate(query.from);
    const to = parseDate(query.to);
    if (from || to) match.scheduledFor = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  }

  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    match.$or = [{ title: rx }, { assetName: rx }, { templateName: rx }, { _id: rx }, { assignedTo: rx }];
  }

  if (Object.keys(match).length > 0) stages.push({ $match: match });

  stages.push(
    { $lookup: { from: ASSET_COLLECTION, localField: 'assetId', foreignField: '_id', as: '__asset' } },
    { $unwind: { path: '$__asset', preserveNullAndEmptyArrays: true } },
  );

  const assetMatch: Record<string, unknown> = {};
  if (query.facility) {
    const ids = await facilitySubtree(query.facility);
    if (ids) assetMatch['__asset.location.id'] = { $in: ids };
  }
  const categories = csvEnum(query.category, ASSET_CATEGORIES);
  if (categories) assetMatch['__asset.category'] = { $in: categories };
  if (Object.keys(assetMatch).length > 0) stages.push({ $match: assetMatch });

  // Status sorts by workflow order, not alphabetically — "In Progress" before
  // "Passed" is the sequence, and no alphabet agrees with it.
  stages.push({
    $addFields: {
      __statusRank: {
        $switch: {
          branches: INSPECTION_STATUSES.map((status, index) => ({ case: { $eq: ['$status', status] }, then: index })),
          default: -1,
        },
      },
    },
  });

  return stages;
}

function sortStage(sort: Record<string, unknown>): Record<string, 1 | -1> {
  const out: Record<string, 1 | -1> = {};
  for (const [field, direction] of Object.entries(sort)) {
    out[field === 'status' ? '__statusRank' : field] = direction === -1 || direction === 'desc' ? -1 : 1;
  }
  out._id = 1; // stable paging: ties must not reshuffle between pages
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────

/** Slug a label into a checkpoint key, uniquely within the template. */
function keyFor(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'check';

  let key = base;
  let n = 2;
  while (taken.has(key)) key = `${base}-${n++}`;
  taken.add(key);
  return key;
}

/**
 * Normalise incoming checkpoints, preserving keys where the caller supplied one.
 *
 * An edit that keeps a checkpoint's key keeps its identity — which is what lets
 * a template be reworded without detaching it from responses already recorded.
 */
function normalizeCheckpoints(input: CreateInspectionTemplateInput['checkpoints']): InspectionTemplateDoc['checkpoints'] {
  const taken = new Set<string>();
  return input.map((checkpoint) => {
    const key = checkpoint.key && !taken.has(checkpoint.key) ? (taken.add(checkpoint.key), checkpoint.key) : keyFor(checkpoint.label, taken);

    // A band on anything but a Number is meaningless, and a failure rule on a
    // free-text field is unenforceable — both are dropped rather than stored as
    // configuration that silently does nothing.
    const numeric = checkpoint.type === 'Number';
    const binary = checkpoint.type === 'Pass/Fail' || checkpoint.type === 'Yes/No';

    return {
      key,
      label: checkpoint.label.trim(),
      type: checkpoint.type,
      required: checkpoint.required,
      helpText: checkpoint.helpText?.trim() || undefined,
      min: numeric ? checkpoint.min : undefined,
      max: numeric ? checkpoint.max : undefined,
      unit: numeric ? checkpoint.unit?.trim() || undefined : undefined,
      failWhen: binary ? (checkpoint.failWhen ?? (checkpoint.type === 'Yes/No' ? 'No' : 'Fail')) : undefined,
    };
  });
}

function assertBands(checkpoints: InspectionTemplateDoc['checkpoints']): void {
  for (const checkpoint of checkpoints) {
    if (checkpoint.min !== undefined && checkpoint.max !== undefined && checkpoint.min > checkpoint.max) {
      throw ApiError.badRequest(`"${checkpoint.label}": the minimum cannot be greater than the maximum.`);
    }
  }
}

export async function listTemplates(query: {
  q?: string;
  type?: string;
  active?: string;
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
}): Promise<{ items: InspectionTemplateDoc[]; meta: ApiMeta }> {
  const pagination = parsePagination(query, ['name', 'createdAt', 'updatedAt', 'version'], 'name');

  const filter: Record<string, unknown> = {};
  const type = csvEnum(query.type, INSPECTION_TYPES);
  if (type) filter.type = { $in: type };
  if (query.active === 'true') filter.active = true;
  if (query.active === 'false') filter.active = false;
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: rx }, { description: rx }, { category: rx }];
  }

  const [items, total, usage] = await Promise.all([
    InspectionTemplate.find(filter).sort(pagination.sort).skip(pagination.skip).limit(pagination.limit).lean<InspectionTemplateDoc[]>(),
    InspectionTemplate.countDocuments(filter),
    // Joined on read rather than stored: deleting an inspection has to lower
    // the count, and a stored counter would need every delete path to remember.
    Inspection.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$templateId', count: { $sum: 1 } } }]),
  ]);

  const counts = new Map(usage.map((row) => [row._id, row.count]));
  return {
    items: items.map((template) => ({ ...template, usageCount: counts.get(template._id) ?? 0 })),
    meta: buildMeta(pagination.page, pagination.limit, total),
  };
}

export async function getTemplate(id: string): Promise<InspectionTemplateDoc> {
  const [template, usageCount] = await Promise.all([
    InspectionTemplate.findById(id).lean<InspectionTemplateDoc>(),
    Inspection.countDocuments({ templateId: id }),
  ]);
  if (!template) throw ApiError.notFound('Inspection template');
  return { ...template, usageCount };
}

export async function createTemplate(input: CreateInspectionTemplateInput, actor: string): Promise<InspectionTemplateDoc> {
  const checkpoints = normalizeCheckpoints(input.checkpoints);
  assertBands(checkpoints);

  // A template with no checks is a name with nothing behind it — and scheduling
  // one produces an inspection that can be "completed" without inspecting.
  if (checkpoints.length === 0) throw ApiError.badRequest('A template needs at least one checkpoint.');

  await assertScopeExists(input.scope);

  const id = await nextId('inspectionTemplate', 'INT');
  await InspectionTemplate.create({ ...input, _id: id, checkpoints, version: 1, createdBy: actor });

  return getTemplate(id);
}

export async function updateTemplate(
  id: string,
  input: UpdateInspectionTemplateInput,
  actor: string,
): Promise<InspectionTemplateDoc> {
  const template = await InspectionTemplate.findById(id);
  if (!template) throw ApiError.notFound('Inspection template');

  if (input.scope) await assertScopeExists(input.scope);

  const { checkpoints, ...rest } = input;
  Object.assign(template, rest);

  if (checkpoints) {
    const next = normalizeCheckpoints(checkpoints);
    assertBands(next);
    if (next.length === 0) throw ApiError.badRequest('A template needs at least one checkpoint.');

    // The version marks *what the checks were*, so it moves only when they
    // change. Renaming a template or editing its description leaves inspections
    // already raised from it pointing at the version they were built from.
    const changed = JSON.stringify(next) !== JSON.stringify(template.checkpoints.map((c) => ({ ...c })));
    template.checkpoints = next;
    if (changed) template.version += 1;
  }

  await template.save();
  logger.info('Inspection template updated', { template: id, actor, version: template.version });
  return getTemplate(id);
}

/**
 * A template's scope must name things that exist.
 *
 * A scope pointing at a deleted asset or a renamed facility silently matches
 * nothing, and the template then looks applicable to an estate it can never be
 * scheduled against.
 */
async function assertScopeExists(scope: { assetIds: string[]; facilityIds: string[]; assetCategories: AssetCategory[] }): Promise<void> {
  if (scope.assetIds.length > 0) {
    const found = await Asset.countDocuments({ _id: { $in: scope.assetIds } });
    if (found !== scope.assetIds.length) throw ApiError.badRequest('The scope names an asset that does not exist.');
  }
  if (scope.facilityIds.length > 0) {
    const found = await ScopeNodeModel.countDocuments({ _id: { $in: scope.facilityIds } });
    if (found !== scope.facilityIds.length) throw ApiError.badRequest('The scope names a facility that does not exist.');
  }
}

/**
 * Retire a template, or delete one that was never used.
 *
 * A template with inspections behind it is deactivated instead of removed:
 * deleting it would strand records that name it, and a compliance history with
 * a dangling template reference is worse than a retired row in a library.
 */
export async function deleteTemplate(id: string): Promise<{ deleted: boolean; deactivated: boolean }> {
  const used = await Inspection.countDocuments({ templateId: id });

  if (used > 0) {
    const updated = await InspectionTemplate.findByIdAndUpdate(id, { $set: { active: false } }, { new: true }).lean();
    if (!updated) throw ApiError.notFound('Inspection template');
    return { deleted: false, deactivated: true };
  }

  const removed = await InspectionTemplate.findByIdAndDelete(id).lean();
  if (!removed) throw ApiError.notFound('Inspection template');
  return { deleted: true, deactivated: false };
}

/**
 * Which assets a template applies to.
 *
 * Empty scope means the whole estate. Otherwise an asset matches if it is named
 * directly, or its category is listed, or it sits under one of the facilities —
 * a union, not an intersection, because the three are alternative ways of
 * saying "this kind of thing", not filters that stack.
 */
export async function templateAssets(id: string): Promise<{ id: string; name: string; category: string; location: string }[]> {
  const template = await InspectionTemplate.findById(id).lean<InspectionTemplateDoc>();
  if (!template) throw ApiError.notFound('Inspection template');

  const { assetIds, assetCategories, facilityIds } = template.scope;
  const filter: Record<string, unknown> = {};

  if (assetIds.length > 0 || assetCategories.length > 0 || facilityIds.length > 0) {
    const clauses: Record<string, unknown>[] = [];
    if (assetIds.length > 0) clauses.push({ _id: { $in: assetIds } });
    if (assetCategories.length > 0) clauses.push({ category: { $in: assetCategories } });
    if (facilityIds.length > 0) {
      const rows = await ScopeNodeModel.find().lean<ScopeNodeDoc[]>();
      const ids = new Set<string>();
      for (const facilityId of facilityIds) for (const nodeId of descendantIds(rows, facilityId)) ids.add(nodeId);
      clauses.push({ 'location.id': { $in: [...ids] } });
    }
    filter.$or = clauses;
  }

  const assets = await Asset.find(filter)
    .select('name category location.name')
    .sort({ name: 1 })
    .limit(500)
    .lean<{ _id: string; name: string; category: string; location?: { name?: string } }[]>();

  return assets.map((a) => ({ id: a._id, name: a.name, category: a.category, location: a.location?.name ?? '—' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Inspections — reads
// ─────────────────────────────────────────────────────────────────────────────

export async function listInspections(query: InspectionListQuery): Promise<{ items: InspectionDoc[]; meta: ApiMeta }> {
  const pagination = parsePagination(query, SORTABLE, 'scheduledFor');
  const stages = await matchStages(query);

  const [rows, hierarchy] = await Promise.all([
    Inspection.aggregate<{ items: JoinedInspection[]; total: { count: number }[] }>([
      ...stages,
      {
        $facet: {
          items: [{ $sort: sortStage(pagination.sort) }, { $skip: pagination.skip }, { $limit: pagination.limit }],
          total: [{ $count: 'count' }],
        },
      },
    ]).exec(),
    loadHierarchy(),
  ]);

  const facet = rows[0];
  return {
    items: present(facet?.items ?? [], hierarchy),
    meta: buildMeta(pagination.page, pagination.limit, facet?.total[0]?.count ?? 0),
  };
}

export async function getInspection(id: string): Promise<InspectionDoc> {
  const [inspection, hierarchy] = await Promise.all([Inspection.findById(id).lean<InspectionDoc>(), loadHierarchy()]);
  if (!inspection) throw ApiError.notFound('Inspection');

  const asset = await Asset.findById(inspection.assetId).select('location').lean<{ location?: { id?: string; name?: string } }>();
  return { ...inspection, placement: placementFor(hierarchy, asset?.location) } as InspectionDoc;
}

/** The five summary cards. Takes the same filters as the list. */
export async function getInspectionStats(query: Partial<InspectionListQuery> = {}): Promise<InspectionStats> {
  const now = new Date();
  const stages = await matchStages(query);

  const [rows] = await Inspection.aggregate<{
    byStatus: { _id: InspectionStatus; count: number }[];
    overdue: { count: number }[];
    total: { count: number }[];
  }>([
    ...stages,
    {
      $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        overdue: [
          { $match: { scheduledFor: { $lt: now }, status: { $in: OPEN_INSPECTION_STATUSES } } },
          { $count: 'count' },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]).exec();

  const counts = new Map((rows?.byStatus ?? []).map((row) => [row._id, row.count]));
  return {
    scheduled: counts.get('Scheduled') ?? 0,
    inProgress: counts.get('In Progress') ?? 0,
    passed: counts.get('Passed') ?? 0,
    failed: counts.get('Failed') ?? 0,
    overdue: rows?.overdue[0]?.count ?? 0,
    total: rows?.total[0]?.count ?? 0,
  };
}

/** Filter-bar options, counted from the records that exist. */
export async function getInspectionFacets(): Promise<InspectionFacets> {
  const [rows, hierarchy, roster, users, templates] = await Promise.all([
    Inspection.aggregate<{
      byFacility: { _id: string | null; count: number }[];
      byAssignee: { _id: string; count: number }[];
      byTemplate: { _id: string | null; count: number }[];
      byType: { _id: InspectionType; count: number }[];
      byStatus: { _id: InspectionStatus; count: number }[];
    }>([
      { $lookup: { from: ASSET_COLLECTION, localField: 'assetId', foreignField: '_id', as: '__asset' } },
      { $unwind: { path: '$__asset', preserveNullAndEmptyArrays: true } },
      {
        $facet: {
          byFacility: [{ $group: { _id: '$__asset.location.id', count: { $sum: 1 } } }],
          byAssignee: [{ $match: { assignedTo: { $ne: UNASSIGNED } } }, { $group: { _id: '$assignedTo', count: { $sum: 1 } } }],
          byTemplate: [{ $group: { _id: '$templateId', count: { $sum: 1 } } }],
          byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        },
      },
    ]).exec(),
    loadHierarchy(),
    Technician.find({ active: true }).select('name').sort({ name: 1 }).lean<{ name: string }[]>(),
    User.find({ status: 'active' }).select('name').sort({ name: 1 }).lean<{ name: string }[]>(),
    InspectionTemplate.find().select('name').sort({ name: 1 }).lean<{ _id: string; name: string }[]>(),
  ]);

  const facet = rows[0];

  // Location ids roll up: an inspection on a rack counts against the warehouse.
  const facilityCounts = new Map<string, { name: string; count: number }>();
  for (const row of facet?.byFacility ?? []) {
    const facility = row._id ? nearestAncestor(hierarchy.byId, row._id, 'facility') : null;
    if (!facility) continue;
    const existing = facilityCounts.get(facility._id);
    if (existing) existing.count += row.count;
    else facilityCounts.set(facility._id, { name: facility.name, count: row.count });
  }

  // Same rule as work orders: the roster and the user list are both assignable,
  // because an estate with no Mobile Workforce roster must still be able to
  // book an inspection to somebody.
  const assigneeCounts = new Map((facet?.byAssignee ?? []).map((row) => [row._id, row.count]));
  const seen = new Set<string>();
  const assignees: InspectionFacets['assignees'] = [];
  const push = (name: string, kind: 'technician' | 'user' | 'historic') => {
    if (!name || name === UNASSIGNED || seen.has(name)) return;
    seen.add(name);
    assignees.push({ name, count: assigneeCounts.get(name) ?? 0, kind });
  };
  for (const tech of roster) push(tech.name, 'technician');
  for (const user of users) push(user.name, 'user');
  for (const name of assigneeCounts.keys()) push(name, 'historic');
  assignees.sort((a, b) => a.name.localeCompare(b.name));

  const templateCounts = new Map((facet?.byTemplate ?? []).map((r) => [r._id, r.count]));
  const typeCounts = new Map((facet?.byType ?? []).map((r) => [r._id, r.count]));
  const statusCounts = new Map((facet?.byStatus ?? []).map((r) => [r._id, r.count]));

  return {
    facilities: [...facilityCounts.entries()]
      .map(([id, value]) => ({ id, name: value.name, count: value.count }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    assignees,
    templates: templates.map((t) => ({ id: t._id, name: t.name, count: templateCounts.get(t._id) ?? 0 })),
    types: INSPECTION_TYPES.map((type) => ({ type, count: typeCounts.get(type) ?? 0 })),
    statuses: INSPECTION_STATUSES.map((status) => ({ status, count: statusCounts.get(status) ?? 0 })),
  };
}

/**
 * The failed checkpoints, with any corrective order already raised for each.
 *
 * Answered here rather than reconstructed by the client, so "which failures
 * still need work raising" has one definition — and so the button that raises
 * one can be disabled on the failures that already have one.
 */
export async function getInspectionFailures(id: string): Promise<InspectionFailure[]> {
  const inspection = await Inspection.findById(id).lean<InspectionDoc>();
  if (!inspection) throw ApiError.notFound('Inspection');

  const orders = await WorkOrder.find({ _id: { $in: inspection.workOrderIds } })
    .select('description')
    .lean<{ _id: string; description: string }[]>();

  return inspection.responses
    .filter((response) => response.result === 'Fail')
    .map((response) => ({
      key: response.key,
      label: response.label,
      finding: response.finding ?? '',
      value: response.value,
      note: response.note,
      // The checkpoint key is written into the order's description when it is
      // raised; matching on it is what links the two without a join table.
      workOrderId: orders.find((order) => order.description.includes(`[checkpoint:${response.key}]`))?._id,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Inspections — writes
// ─────────────────────────────────────────────────────────────────────────────

function normalizeAssignee(value: string | undefined | null): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'unassigned') return UNASSIGNED;
  return trimmed;
}

/**
 * Schedule an inspection from a template.
 *
 * The template's checkpoints are copied in as unanswered responses, which is
 * what "automatically load its checklist items" means in storage terms: the
 * record is answerable the moment it exists, with no second step that could be
 * skipped and no read-through to a template that might later change.
 */
export async function createInspection(input: CreateInspectionInput, actor: string): Promise<InspectionDoc> {
  const [asset, template] = await Promise.all([
    Asset.findById(input.assetId).lean(),
    InspectionTemplate.findById(input.templateId).lean<InspectionTemplateDoc>(),
  ]);

  if (!asset) throw ApiError.badRequest(`Asset ${input.assetId} does not exist`);
  if (!template) throw ApiError.badRequest(`Inspection template ${input.templateId} does not exist`);
  if (!template.active) {
    throw ApiError.badRequest(`"${template.name}" is retired and cannot be scheduled. Reactivate it first.`);
  }

  const now = new Date();
  const id = await nextId('inspection', 'INS');

  const responses: InspectionResponseSub[] = template.checkpoints.map((checkpoint) => ({
    ...checkpoint,
    result: 'Pending',
    value: null,
  }));

  await Inspection.create({
    _id: id,
    title: input.title?.trim() || `${template.name} — ${asset.name}`,
    templateId: template._id,
    templateName: template.name,
    templateVersion: template.version,
    type: input.type ?? template.type,
    assetId: input.assetId,
    assetName: asset.name,
    status: 'Scheduled',
    scheduledFor: new Date(input.scheduledFor),
    assignedTo: normalizeAssignee(input.assignedTo),
    responses,
    notes: input.notes ?? '',
    summary: recount(responses),
    workOrderIds: [],
    history: [{ from: null, to: 'Scheduled', at: now, actor, note: `Scheduled from ${template.name} v${template.version}` }],
    createdBy: actor,
  });

  await Activity.create({
    assetId: input.assetId,
    type: 'Maintenance',
    description: `Inspection ${id} scheduled: ${template.name}`,
    actor,
    timestamp: now,
  });

  markEstateChanged('inspection-created');
  return getInspection(id);
}

/**
 * Schedule the same template against many assets at once.
 *
 * One inspection per asset rather than one spanning several: an inspection
 * records the condition of *a thing*, and a single record covering twelve
 * assets cannot say which of them failed.
 */
export async function createInspectionsBulk(
  input: { templateId: string; assetIds: string[]; scheduledFor: string; assignedTo?: string; type?: InspectionType },
  actor: string,
): Promise<{ created: InspectionDoc[]; failed: { assetId: string; reason: string }[] }> {
  const created: InspectionDoc[] = [];
  const failed: { assetId: string; reason: string }[] = [];

  for (const assetId of input.assetIds) {
    try {
      created.push(
        await createInspection(
          {
            templateId: input.templateId,
            assetId,
            scheduledFor: input.scheduledFor,
            assignedTo: input.assignedTo,
            type: input.type,
          } as CreateInspectionInput,
          actor,
        ),
      );
    } catch (error) {
      // One bad asset must not abandon the rest of the batch — the caller is
      // told which ones did not take.
      failed.push({ assetId, reason: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  return { created, failed };
}

export async function updateInspection(
  id: string,
  input: { title?: string; scheduledFor?: string; assignedTo?: string; notes?: string; type?: InspectionType },
  actor: string,
): Promise<InspectionDoc> {
  const inspection = await Inspection.findById(id);
  if (!inspection) throw ApiError.notFound('Inspection');

  // A completed inspection is a record of what was found. Re-dating or
  // reassigning one after the fact rewrites history; re-inspecting is a new
  // inspection, which is the only version that leaves an audit trail.
  if (inspection.status === 'Passed' || inspection.status === 'Failed') {
    throw ApiError.badRequest('A completed inspection cannot be edited. Schedule a new one instead.');
  }

  if (input.title !== undefined) inspection.title = input.title.trim();
  if (input.scheduledFor !== undefined) inspection.scheduledFor = new Date(input.scheduledFor);
  if (input.assignedTo !== undefined) inspection.assignedTo = normalizeAssignee(input.assignedTo);
  if (input.notes !== undefined) inspection.notes = input.notes;
  if (input.type !== undefined) inspection.type = input.type;

  await inspection.save();
  logger.info('Inspection updated', { inspection: id, actor });
  return getInspection(id);
}

export async function assignInspection(id: string, assignedTo: string, actor: string): Promise<InspectionDoc> {
  const inspection = await Inspection.findById(id);
  if (!inspection) throw ApiError.notFound('Inspection');

  const next = normalizeAssignee(assignedTo);

  if (next !== UNASSIGNED) {
    // Either list will do; what is refused is free text, which is how a queue
    // ends up holding three spellings of one person that no filter reconciles.
    const [technician, user] = await Promise.all([
      Technician.findOne({ name: next, active: true }).select('_id').lean(),
      User.findOne({ name: next, status: 'active' }).select('_id').lean(),
    ]);
    if (!technician && !user) {
      throw ApiError.badRequest(`"${next}" is not an active technician or user.`);
    }
  }

  inspection.assignedTo = next;
  await inspection.save();

  await Activity.create({
    assetId: inspection.assetId,
    type: 'Maintenance',
    description: next === UNASSIGNED ? `Inspection ${id} returned to the queue` : `Inspection ${id} assigned to ${next}`,
    actor,
    timestamp: new Date(),
  });

  return getInspection(id);
}

/** Scheduled → In Progress. Stamps who picked it up and when. */
export async function startInspection(id: string, actor: string): Promise<InspectionDoc> {
  const inspection = await Inspection.findById(id);
  if (!inspection) throw ApiError.notFound('Inspection');

  if (inspection.status !== 'Scheduled') {
    throw ApiError.badRequest(`Only a Scheduled inspection can be started — this one is ${inspection.status}.`);
  }

  const now = new Date();
  inspection.status = 'In Progress';
  inspection.startedAt = now;
  // Picking the work up implies taking it; an "In Progress" inspection still
  // reading Unassigned leaves the queue lying about who has it.
  if (inspection.assignedTo === UNASSIGNED) inspection.assignedTo = actor;
  inspection.history.push({ from: 'Scheduled', to: 'In Progress', at: now, actor });

  await inspection.save();

  await Activity.create({
    assetId: inspection.assetId,
    type: 'Maintenance',
    description: `Inspection ${id} started by ${actor}`,
    actor,
    timestamp: now,
  });

  return getInspection(id);
}

/**
 * Record answers.
 *
 * Accepts a partial set, so a long checklist can be saved as it is worked
 * through rather than only at the end. Each answer is graded server-side —
 * `result` is never taken from the caller.
 */
export async function respond(id: string, input: RespondInput, actor: string): Promise<InspectionDoc> {
  const inspection = await Inspection.findById(id);
  if (!inspection) throw ApiError.notFound('Inspection');

  if (inspection.status === 'Passed' || inspection.status === 'Failed') {
    throw ApiError.badRequest('This inspection is complete. Its answers can no longer be changed.');
  }

  // Answering is starting: a technician who fills in a checkpoint has begun the
  // inspection whether or not they pressed a button first.
  const now = new Date();
  if (inspection.status === 'Scheduled') {
    inspection.status = 'In Progress';
    inspection.startedAt = now;
    if (inspection.assignedTo === UNASSIGNED) inspection.assignedTo = actor;
    inspection.history.push({ from: 'Scheduled', to: 'In Progress', at: now, actor, note: 'First answer recorded' });
  }

  for (const answer of input.responses) {
    const response = inspection.responses.find((r) => r.key === answer.key);
    if (!response) throw ApiError.badRequest(`This inspection has no checkpoint "${answer.key}".`);

    response.value = answer.value ?? null;
    response.result = grade(response, answer.value);
    if (answer.note !== undefined) response.note = answer.note;
    if (answer.finding !== undefined) response.finding = answer.finding;

    // A finding describes a defect. Clearing the failure clears the finding
    // with it, or the record keeps asserting a problem it no longer has.
    if (response.result !== 'Fail') response.finding = undefined;
  }

  inspection.summary = recount(inspection.responses);
  await inspection.save();

  return getInspection(id);
}

/**
 * Close the inspection.
 *
 * The outcome is derived, not supplied: any failed checkpoint makes the whole
 * inspection Failed. Two things are refused rather than allowed through,
 * because both would produce a record that cannot be acted on — an unanswered
 * required checkpoint, and a failure with no finding written against it.
 */
export async function completeInspection(
  id: string,
  input: { notes?: string; performedBy?: string },
  actor: string,
): Promise<InspectionDoc> {
  const inspection = await Inspection.findById(id);
  if (!inspection) throw ApiError.notFound('Inspection');

  const allowed = INSPECTION_TRANSITIONS[inspection.status];
  if (allowed.length === 0) throw ApiError.badRequest(`This inspection is already ${inspection.status}.`);
  if (inspection.status !== 'In Progress') {
    throw ApiError.badRequest('Start the inspection before completing it.');
  }

  const unanswered = inspection.responses.filter((r) => r.required && r.result === 'Pending');
  if (unanswered.length > 0) {
    throw ApiError.badRequest(
      `${unanswered.length} required checkpoint${unanswered.length === 1 ? '' : 's'} still unanswered: ` +
        unanswered.slice(0, 3).map((r) => `"${r.label}"`).join(', ') +
        (unanswered.length > 3 ? '…' : ''),
    );
  }

  const withoutFinding = inspection.responses.filter((r) => r.result === 'Fail' && !r.finding?.trim());
  if (withoutFinding.length > 0) {
    throw ApiError.badRequest(
      `Every failed checkpoint needs a finding describing the issue. Missing on: ` +
        withoutFinding.slice(0, 3).map((r) => `"${r.label}"`).join(', ') +
        (withoutFinding.length > 3 ? '…' : ''),
    );
  }

  const now = new Date();
  const failed = inspection.responses.some((r) => r.result === 'Fail');
  const outcome: InspectionStatus = failed ? 'Failed' : 'Passed';

  inspection.status = outcome;
  inspection.completedAt = now;
  inspection.performedBy = (input.performedBy?.trim() || actor).trim();
  if (input.notes !== undefined) inspection.notes = input.notes;
  inspection.summary = recount(inspection.responses);
  inspection.history.push({
    from: 'In Progress',
    to: outcome,
    at: now,
    actor,
    note: failed ? `${inspection.summary.failed} checkpoint(s) failed` : 'All checkpoints passed',
  });

  await inspection.save();

  await Activity.create({
    assetId: inspection.assetId,
    type: 'Maintenance',
    description: `Inspection ${id} completed — ${outcome} (${inspection.summary.passed}/${inspection.summary.total} passed)`,
    actor,
    timestamp: now,
  });

  // A failed inspection is evidence about the asset's condition.
  markEstateChanged('inspection-completed');
  return getInspection(id);
}

/**
 * Raise a corrective work order for one failed checkpoint.
 *
 * One order per defect, not one per inspection: "the extinguisher is out of
 * date" and "the exit sign is unlit" are two jobs, and merging them into one
 * ticket means one of them gets closed without being done.
 *
 * The link runs both ways — the order's id is pushed onto the inspection, and
 * the order's description carries `[checkpoint:key]` so the failure it answers
 * can be identified without a join table.
 */
export async function raiseCorrectiveWorkOrder(
  id: string,
  checkpointKey: string,
  input: { priority?: 'Low' | 'Medium' | 'High' | 'Critical'; dueInDays?: number; assignedTo?: string },
  actor: string,
): Promise<{ inspection: InspectionDoc; workOrderId: string }> {
  const inspection = await Inspection.findById(id);
  if (!inspection) throw ApiError.notFound('Inspection');

  const response = inspection.responses.find((r) => r.key === checkpointKey);
  if (!response) throw ApiError.notFound(`Checkpoint ${checkpointKey}`);
  if (response.result !== 'Fail') {
    throw ApiError.badRequest(`"${response.label}" did not fail — corrective work is only raised against a failure.`);
  }

  // Idempotent: pressing the button twice must not produce two tickets for one
  // defect. The existing order is returned instead.
  const existing = await WorkOrder.findOne({
    _id: { $in: inspection.workOrderIds },
    description: new RegExp(`\\[checkpoint:${escapeRegex(checkpointKey)}\\]`),
  })
    .select('_id')
    .lean<{ _id: string }>();

  if (existing) return { inspection: await getInspection(id), workOrderId: existing._id };

  const asset = await Asset.findById(inspection.assetId).lean();
  if (!asset) throw ApiError.badRequest(`Asset ${inspection.assetId} no longer exists.`);

  const now = new Date();
  const workOrderId = await nextId('workOrder', 'WO');
  const dueInDays = input.dueInDays ?? 3;

  await WorkOrder.create({
    _id: workOrderId,
    title: `${response.label} — ${asset.name}`,
    assetId: inspection.assetId,
    assetName: asset.name,
    status: 'New',
    priority: input.priority ?? (asset.criticality === 'Critical' ? 'Critical' : 'High'),
    type: 'Corrective',
    assignedTo: normalizeAssignee(input.assignedTo),
    dueDate: new Date(now.getTime() + dueInDays * 86_400_000),
    description:
      `Raised from inspection ${inspection._id} ("${inspection.title}"). ` +
      `Failed checkpoint: "${response.label}". Finding: ${response.finding ?? '—'}` +
      (response.note ? ` Note: ${response.note}` : '') +
      ` [checkpoint:${response.key}]`,
    estimatedHours: 2,
    source: 'Inspection Failure',
    aiGenerated: false,
    checklist: [],
    parts: [],
    laborLog: [],
    comments: [],
    history: [{ from: null, to: 'New', at: now, actor, note: `Raised from inspection ${inspection._id}` }],
    createdAt: now,
  });

  inspection.workOrderIds.push(workOrderId);
  await inspection.save();

  await Activity.create({
    assetId: inspection.assetId,
    type: 'Maintenance',
    description: `Work order ${workOrderId} raised from inspection ${inspection._id}: ${response.label}`,
    actor,
    timestamp: now,
  });

  logger.info('Corrective work raised from inspection', { inspection: id, checkpoint: checkpointKey, workOrder: workOrderId });
  markEstateChanged('inspection-corrective');

  return { inspection: await getInspection(id), workOrderId };
}

/** Raise corrective work for every failure that does not have one yet. */
export async function raiseAllCorrectiveWorkOrders(
  id: string,
  input: { priority?: 'Low' | 'Medium' | 'High' | 'Critical'; dueInDays?: number; assignedTo?: string },
  actor: string,
): Promise<{ inspection: InspectionDoc; workOrderIds: string[] }> {
  const failures = await getInspectionFailures(id);
  const pending = failures.filter((failure) => !failure.workOrderId);

  const raised: string[] = [];
  for (const failure of pending) {
    const result = await raiseCorrectiveWorkOrder(id, failure.key, input, actor);
    raised.push(result.workOrderId);
  }

  return { inspection: await getInspection(id), workOrderIds: raised };
}

export async function deleteInspection(id: string): Promise<void> {
  const inspection = await Inspection.findById(id).lean<InspectionDoc>();
  if (!inspection) throw ApiError.notFound('Inspection');

  // A completed inspection is the evidence that a check was carried out.
  // Deleting one erases a compliance record; that is a database operation, not
  // a button.
  if (inspection.status === 'Passed' || inspection.status === 'Failed') {
    throw ApiError.badRequest('A completed inspection is a compliance record and cannot be deleted.');
  }

  await Inspection.findByIdAndDelete(id);
  markEstateChanged('inspection-deleted');
}
