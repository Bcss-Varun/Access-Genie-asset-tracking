import type { RoleId, ScopeLevel } from '@access-genie/shared';
import { Asset, ScopeNodeModel, type ScopeNodeDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Tenant isolation.
 *
 * The scope tree (Group ▸ Organization ▸ Region ▸ Facility ▸ …) was previously
 * a *convenience filter*: the switcher narrowed what you were shown, but no
 * endpoint checked whether you were entitled to what you asked for. Any
 * authenticated session could read every asset, work order and custody record
 * in the database, and could name another organisation's node in `?scope=` and
 * be served it. `shared/platform.ts` said as much in a comment, and left the
 * hook for where real isolation would attach. This is that.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *
 * Every session resolves to a **visible estate**: one node of the tree plus
 * everything beneath it.
 *
 *   • `super_admin` is the platform operator and resolves to the tree root.
 *   • Every other role resolves to its own `homeScopeId` and that node's
 *     subtree. An organisation admin homed at ORG-A therefore cannot read
 *     ORG-B, and a facility manager cannot read the facility next door.
 *
 * Asking for something outside that estate is refused, never quietly widened:
 * answering a narrower question than the one asked would be confusing, and
 * answering a *wider* one is the leak this exists to close.
 *
 * ── Where it is enforced ────────────────────────────────────────────────────
 *
 * In the data-access layer, never in the UI. `attachScope` puts the resolved
 * estate on the request; services build their Mongo filters from it. A record
 * that carries a location filters on that location directly; a record that
 * merely references an asset (a work order, a custody entry, a document)
 * filters on the set of asset ids in the estate, resolved once per request by
 * `visibleAssetIds`.
 */

/** Roles whose remit is the whole platform rather than one organisation. */
const PLATFORM_ROLES: RoleId[] = ['super_admin'];

export interface ScopeIdentity {
  roleId: RoleId;
  homeScopeId: string;
}

export interface VisibleScope {
  /** The widest node this session may see. */
  rootId: string;
  rootName: string;
  /** The node currently selected — the root, or something beneath it. */
  id: string;
  name: string;
  level: ScopeLevel;
  /** Every scope-node id in the selection. */
  ids: Set<string>;
  /** Every scope-node id the session may see, whatever it has selected. */
  permitted: Set<string>;
  /**
   * True when the selection covers the entire tree, so a location filter would
   * be work with no effect — and would wrongly exclude records whose location
   * is missing or points outside the tree.
   */
  coversAll: boolean;
  rows: ScopeNodeDoc[];
  byId: Map<string, ScopeNodeDoc>;
  /** Any node → the facility it belongs to (or itself, at or above that level). */
  facilityOf: Map<string, { id: string; name: string; level: ScopeLevel }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree helpers
// ─────────────────────────────────────────────────────────────────────────────

function childIndex(rows: ScopeNodeDoc[]): Map<string, ScopeNodeDoc[]> {
  const children = new Map<string, ScopeNodeDoc[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const siblings = children.get(row.parentId) ?? [];
    siblings.push(row);
    children.set(row.parentId, siblings);
  }
  return children;
}

function subtreeIds(children: Map<string, ScopeNodeDoc[]>, start: string): Set<string> {
  const out = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const id = queue.pop() as string;
    if (out.has(id)) continue; // a cycle would otherwise spin forever
    out.add(id);
    for (const child of children.get(id) ?? []) queue.push(child._id);
  }
  return out;
}

function nearestAncestor(byId: Map<string, ScopeNodeDoc>, start: string, level: ScopeLevel): ScopeNodeDoc | null {
  const seen = new Set<string>();
  let node = byId.get(start);
  while (node && !seen.has(node._id)) {
    seen.add(node._id);
    if (node.level === level) return node;
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return null;
}

/** The tree's root — preferring a `group` when several nodes are parentless. */
function treeRoot(rows: ScopeNodeDoc[]): ScopeNodeDoc | null {
  const parentless = rows.filter((r) => !r.parentId);
  return parentless.find((r) => r.level === 'group') ?? parentless[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the estate this session may see, and the slice it asked for.
 *
 * One `ScopeNode` read per request. The tree is tens of rows, not thousands, so
 * it is walked in memory rather than resolved with a recursive lookup.
 */
export async function resolveVisibleScope(identity: ScopeIdentity, requested?: string): Promise<VisibleScope> {
  const rows = await ScopeNodeModel.find().lean<ScopeNodeDoc[]>();
  if (rows.length === 0) {
    throw ApiError.badRequest('No locations are configured yet — add an organisation before using this API.');
  }

  const byId = new Map(rows.map((r) => [r._id, r]));
  const children = childIndex(rows);

  const platform = PLATFORM_ROLES.includes(identity.roleId);
  const root = platform ? treeRoot(rows) : (byId.get(identity.homeScopeId) ?? null);

  if (!root) {
    // A home scope that no longer resolves is a broken account, not licence to
    // see everything. Deleting the facility somebody was homed at must not
    // promote them to the whole estate.
    throw ApiError.forbidden(
      'Your account is not attached to a valid location. Ask an administrator to set your home scope.',
    );
  }

  const permitted = subtreeIds(children, root._id);

  let selected = root;
  if (requested && requested !== root._id) {
    const node = byId.get(requested);
    if (!node) throw ApiError.notFound('Scope');
    if (!permitted.has(requested)) throw ApiError.forbidden(`Your access does not extend to ${node.name}`);
    selected = node;
  }

  const ids = selected._id === root._id ? permitted : subtreeIds(children, selected._id);

  const facilityOf = new Map<string, { id: string; name: string; level: ScopeLevel }>();
  for (const row of rows) {
    const facility = nearestAncestor(byId, row._id, 'facility');
    facilityOf.set(
      row._id,
      facility
        ? { id: facility._id, name: facility.name, level: facility.level }
        : { id: row._id, name: row.name, level: row.level },
    );
  }

  return {
    rootId: root._id,
    rootName: root.name,
    id: selected._id,
    name: selected.name,
    level: selected.level,
    ids,
    permitted,
    coversAll: ids.size === rows.length,
    rows,
    byId,
    facilityOf,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The clause that narrows a collection carrying a scope-node id.
 *
 * Empty when the estate covers the whole tree — see `coversAll` for why that is
 * not the same as matching every id one by one.
 */
export function locationClause(scope: VisibleScope, field = 'location.id'): Record<string, unknown> {
  if (scope.coversAll) return {};
  return { [field]: { $in: [...scope.ids] } };
}

/**
 * The asset ids inside the estate.
 *
 * Collections that reference an asset but carry no location of their own — work
 * orders, custody entries, documents, alerts, inspections — filter on this.
 * Memoised on the scope object so a request that touches five such collections
 * still issues one lookup rather than five.
 */
const assetIdCache = new WeakMap<VisibleScope, Promise<string[]>>();

export function visibleAssetIds(scope: VisibleScope): Promise<string[]> {
  const cached = assetIdCache.get(scope);
  if (cached) return cached;

  const promise = Asset.find(locationClause(scope))
    .select('_id')
    .lean<{ _id: string }[]>()
    .then((rows) => rows.map((r) => r._id));

  assetIdCache.set(scope, promise);
  return promise;
}

/**
 * `{ assetId: { $in: [...] } }`, or `{}` when the estate is the whole tree.
 *
 * `field` covers the collections keyed *by* the asset id rather than carrying it
 * as a property — movement trails, for one.
 */
export async function assetClause(scope: VisibleScope, field = 'assetId'): Promise<Record<string, unknown>> {
  if (scope.coversAll) return {};
  return { [field]: { $in: await visibleAssetIds(scope) } };
}

/**
 * Refuse a record that sits outside the estate.
 *
 * Used on detail reads and writes, where a filter is not enough: fetching by id
 * and then checking is the only way to answer "may I see AST-2".
 *
 * Reported as a 404 rather than a 403 on purpose. A 403 confirms the record
 * exists, which is itself a disclosure across a tenant boundary — "there is an
 * asset with this id, you just cannot have it" is information the caller has
 * not earned.
 */
export function assertLocationVisible(scope: VisibleScope, locationId: string | undefined, label = 'Resource'): void {
  if (scope.coversAll) return;
  if (!locationId || !scope.ids.has(locationId)) throw ApiError.notFound(label);
}

/**
 * The same check for a record that references an asset.
 *
 * An absent `assetId` is refused rather than allowed: a record that claims no
 * asset cannot be shown to belong to this estate, and defaulting to "visible"
 * is the wrong direction to fail in.
 */
export async function assertAssetVisible(
  scope: VisibleScope,
  assetId: string | undefined,
  label = 'Resource',
): Promise<void> {
  if (scope.coversAll) return;
  if (!assetId) throw ApiError.notFound(label);
  const ids = await visibleAssetIds(scope);
  if (!ids.includes(assetId)) throw ApiError.notFound(label);
}
