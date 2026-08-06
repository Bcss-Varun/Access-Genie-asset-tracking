import type { ScopeLevel, ScopeNode } from '@access-genie/shared';
import { Asset, ScopeNodeModel, buildScopeTree, nextId, type ScopeNodeDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import type { CreateScopeInput, UpdateScopeInput } from '../validators/scope.validator.js';

/**
 * The location hierarchy — Org ▸ Region ▸ Facility ▸ Building ▸ Floor ▸ Zone.
 *
 * This is the structure everything physical hangs off: an asset's location is a
 * node here, the facility scope picker walks it, and the registration flow
 * flattens it into the list of places an asset can be put. Until it has a
 * facility in it there is nowhere to put anything, which is why creating one is
 * a first-run task rather than an advanced administrative one.
 *
 * Stored flat with a `parentId`; the tree is assembled on read (see
 * models/ScopeNode.ts for why).
 */

/**
 * Which levels may sit directly under which.
 *
 * The group is the root when one exists — the holding company above the
 * operating ones. An organisation may still be parentless, so a deployment with
 * a single company needs no group node at all.
 */
const ALLOWED_PARENTS: Record<ScopeLevel, ScopeLevel[]> = {
  group: [],
  org: ['group'],
  region: ['org'],
  // A facility can hang straight off the org — not every organisation groups
  // its sites into regions, and forcing an invented one is worse than allowing
  // a flatter tree.
  facility: ['org', 'region'],
  building: ['facility'],
  floor: ['building'],
  zone: ['facility', 'building', 'floor'],
};

/** ID prefix per level, so an ID says what it is: `FAC-3`, `BLD-7`, `ZN-12`. */
const ID_PREFIX: Record<ScopeLevel, string> = {
  group: 'GRP',
  org: 'ORG',
  region: 'REG',
  facility: 'FAC',
  building: 'BLD',
  floor: 'FLR',
  zone: 'ZN',
};

function toWire(doc: ScopeNodeDoc): ScopeNode {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id };
}

export async function listScopeNodes(): Promise<ScopeNode[]> {
  const rows = await ScopeNodeModel.find().sort({ level: 1, name: 1 }).lean<ScopeNodeDoc[]>();
  return rows.map(toWire);
}

export async function getScopeTree(): Promise<ScopeNode | null> {
  const rows = await ScopeNodeModel.find().lean<ScopeNodeDoc[]>();
  return buildScopeTree(rows);
}

/**
 * Add a node to the hierarchy.
 *
 * The parent rules are enforced here rather than left to the caller: a zone
 * filed under a region, or a second org root, produces a tree that every reader
 * downstream has to defend against. Rejecting it once at the write is cheaper
 * than making `buildScopeTree`, the scope picker and the location flattener all
 * cope with a shape that should not exist.
 */
export async function createScopeNode(input: CreateScopeInput): Promise<ScopeNode> {
  const allowed = ALLOWED_PARENTS[input.level];

  if (input.level === 'org') {
    const existingOrg = await ScopeNodeModel.findOne({ level: 'org' }).lean();
    if (existingOrg) throw ApiError.conflict('The organization root already exists — add a region or facility under it');
  }

  if (allowed.length > 0) {
    if (!input.parentId) {
      throw ApiError.badRequest(`A ${input.level} needs a parent (${allowed.join(' or ')})`);
    }

    const parent = await ScopeNodeModel.findById(input.parentId).lean<ScopeNodeDoc>();
    if (!parent) throw ApiError.notFound('Parent scope');

    if (!allowed.includes(parent.level)) {
      throw ApiError.badRequest(
        `A ${input.level} cannot sit under a ${parent.level} — it belongs under ${allowed.join(' or ')}`,
      );
    }
  }

  // Names are how people pick a location in the registration flow, so two
  // siblings sharing one is a genuine ambiguity rather than a cosmetic clash.
  const duplicate = await ScopeNodeModel.findOne({
    name: input.name,
    parentId: input.parentId ?? { $exists: false },
  }).lean();
  if (duplicate) throw ApiError.conflict(`A ${input.level} called "${input.name}" already exists here`);

  const id = await nextId(`scope:${input.level}`, ID_PREFIX[input.level]);

  const created = await ScopeNodeModel.create({
    _id: id,
    name: input.name,
    level: input.level,
    parentId: input.parentId,
    assetCount: 0,
  });

  return toWire(created.toObject());
}

export async function updateScopeNode(id: string, input: UpdateScopeInput): Promise<ScopeNode> {
  const node = await ScopeNodeModel.findById(id);
  if (!node) throw ApiError.notFound('Scope');

  if (input.name && input.name !== node.name) {
    const duplicate = await ScopeNodeModel.findOne({
      _id: { $ne: id },
      name: input.name,
      parentId: node.parentId ?? { $exists: false },
    }).lean();
    if (duplicate) throw ApiError.conflict(`A ${node.level} called "${input.name}" already exists here`);
    node.name = input.name;
  }

  await node.save();
  return toWire(node.toObject());
}

/**
 * Remove a node.
 *
 * Refused while anything still depends on it. Deleting a facility that assets
 * are filed under would leave those assets pointing at a location that no
 * longer exists — they would render as blanks on every screen that shows where
 * something is, which is the opposite of what an asset tracker is for.
 */
export async function deleteScopeNode(id: string): Promise<void> {
  const node = await ScopeNodeModel.findById(id).lean<ScopeNodeDoc>();
  if (!node) throw ApiError.notFound('Scope');

  if (node.level === 'org') {
    throw ApiError.conflict('The organization root cannot be deleted');
  }

  const children = await ScopeNodeModel.countDocuments({ parentId: id });
  if (children > 0) {
    throw ApiError.conflict(`Remove the ${children} scope(s) inside this one first`);
  }

  const assets = await Asset.countDocuments({ 'location.id': id });
  if (assets > 0) {
    throw ApiError.conflict(`${assets} asset(s) are located here — move them before deleting this scope`);
  }

  await ScopeNodeModel.deleteOne({ _id: id });
}
