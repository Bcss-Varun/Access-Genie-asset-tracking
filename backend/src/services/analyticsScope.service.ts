import type { AnalyticsScopeOption, RoleId, ScopeLevel } from '@access-genie/shared';
import { ScopeNodeModel, type ScopeNodeDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Who may see which slice of the estate, resolved once per request.
 *
 * Analytics is the one module where the scope tree is a **permission boundary**
 * rather than a convenience filter. Everywhere else in this platform the
 * switcher is a courtesy — `shared/platform.ts` says so explicitly — because
 * those screens show records a user could reach by other means anyway. A
 * report is different: it aggregates, it exports, and an aggregate over
 * somebody else's facility leaks that facility whether or not the individual
 * rows are shown. So this module refuses the widening rather than performing
 * it, and does so on the server, where a hand-crafted query cannot get past it.
 *
 * The rule, stated plainly:
 *
 *   • Org-wide roles (Super Admin, Organization Admin, Executive) resolve to
 *     the root of the tree — the whole organisation, every facility.
 *   • Everyone else resolves to their own `homeScopeId` and everything beneath
 *     it. A facility manager's root *is* their facility.
 *
 * A requested facility outside the permitted root is a 403, not a silent
 * fallback to the permitted one: quietly answering a different question than
 * the one asked is the wrong direction to fail in.
 */

/** Roles whose remit is the organisation, not a site within it. */
const ORG_WIDE_ROLES: RoleId[] = ['super_admin', 'org_admin', 'executive'];

export interface ScopeIdentity {
  roleId: RoleId;
  homeScopeId: string;
}

export interface AnalyticsScope {
  /** The widest slice this caller may see. */
  rootId: string;
  rootName: string;
  /** The slice actually selected — the root, or a node beneath it. */
  id: string;
  name: string;
  level: ScopeLevel;
  /** True when the selection is the caller's whole permitted estate. */
  isRoot: boolean;
  /** Every scope-node id in the selection, including the selected node. */
  ids: Set<string>;
  /**
   * True when the selection covers every node in the tree, so a location
   * filter would be work with no effect — and would wrongly drop records whose
   * location is missing or points outside the tree.
   */
  coversAll: boolean;
  rows: ScopeNodeDoc[];
  byId: Map<string, ScopeNodeDoc>;
  /** Any node → the facility it belongs to (or itself, at or above that level). */
  facilityOf: Map<string, { id: string; name: string; level: ScopeLevel }>;
  /** What the facility picker may offer — the permitted subtree, in tree order. */
  options: AnalyticsScopeOption[];
}

/** Children of every node, built once. */
function childIndex(rows: ScopeNodeDoc[]): Map<string, ScopeNodeDoc[]> {
  const children = new Map<string, ScopeNodeDoc[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const siblings = children.get(row.parentId) ?? [];
    siblings.push(row);
    children.set(row.parentId, siblings);
  }
  for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return children;
}

function subtreeIds(children: Map<string, ScopeNodeDoc[]>, start: string): Set<string> {
  const out = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const id = queue.pop() as string;
    if (out.has(id)) continue; // a cycle in the adjacency list would otherwise spin forever
    out.add(id);
    for (const child of children.get(id) ?? []) queue.push(child._id);
  }
  return out;
}

/** The nearest ancestor at `level`, or null when there is none above `start`. */
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

/**
 * The tree's root: the parentless node, preferring a `group` when several are
 * parentless — the same rule `buildScopeTree` applies, kept in step with it.
 */
function treeRoot(rows: ScopeNodeDoc[]): ScopeNodeDoc | null {
  const parentless = rows.filter((r) => !r.parentId);
  return parentless.find((r) => r.level === 'group') ?? parentless[0] ?? null;
}

/**
 * Resolve the caller's permitted root and their requested selection within it.
 *
 * `assetCounts` is the direct count per location id — supplied by the caller
 * because it already has the assets loaded, so the picker can show a real
 * number per node without this function issuing a second query. Omit it and
 * the options come back with zero counts rather than invented ones.
 */
export async function resolveAnalyticsScope(
  identity: ScopeIdentity,
  requested?: string,
  assetCounts?: Map<string, number>,
): Promise<AnalyticsScope> {
  const rows = await ScopeNodeModel.find().lean<ScopeNodeDoc[]>();
  if (rows.length === 0) throw ApiError.badRequest('No locations are configured yet — add a facility before running analytics.');

  const byId = new Map(rows.map((r) => [r._id, r]));
  const children = childIndex(rows);

  const orgWide = ORG_WIDE_ROLES.includes(identity.roleId);
  const root = orgWide
    ? treeRoot(rows)
    : (byId.get(identity.homeScopeId) ?? treeRoot(rows));

  if (!root) throw ApiError.badRequest('The location hierarchy has no root — analytics cannot resolve a scope.');

  const permitted = subtreeIds(children, root._id);

  // The selection. Refused rather than widened when it is outside the caller's
  // remit, and refused rather than ignored when it does not exist at all.
  let selected = root;
  if (requested && requested !== root._id) {
    const node = byId.get(requested);
    if (!node) throw ApiError.notFound('Facility');
    if (!permitted.has(requested)) {
      throw ApiError.forbidden(`Your access does not extend to ${node.name}`);
    }
    selected = node;
  }

  const ids = selected._id === root._id ? permitted : subtreeIds(children, selected._id);

  const facilityOf = new Map<string, { id: string; name: string; level: ScopeLevel }>();
  for (const row of rows) {
    // A rack on a floor in a building belongs to the facility above it. Above
    // that level there is no facility ancestor and the node stands for itself,
    // so a region holding assets directly reports as the region rather than
    // being folded into a facility it does not have.
    const facility = nearestAncestor(byId, row._id, 'facility');
    facilityOf.set(row._id, facility
      ? { id: facility._id, name: facility.name, level: facility.level }
      : { id: row._id, name: row.name, level: row.level });
  }

  // The picker offers the permitted subtree in tree order, with each node's
  // rolled-up asset count so "Hyderabad warehouse (2)" is a real number.
  const options: AnalyticsScopeOption[] = [];
  const rolled = new Map<string, number>();
  const rollUp = (id: string): number => {
    const own = assetCounts?.get(id) ?? 0;
    const below = (children.get(id) ?? []).reduce((sum, child) => sum + rollUp(child._id), 0);
    const total = own + below;
    rolled.set(id, total);
    return total;
  };
  rollUp(root._id);

  const walk = (node: ScopeNodeDoc, depth: number) => {
    options.push({ id: node._id, name: node.name, level: node.level, depth, assetCount: rolled.get(node._id) ?? 0 });
    // Below a floor the picker becomes a list of racks, which is not a
    // facility filter any more. Stop there; the report builder's `location`
    // dimension is where that detail belongs.
    if (depth >= 3) return;
    for (const child of children.get(node._id) ?? []) walk(child, depth + 1);
  };
  walk(root, 0);

  return {
    rootId: root._id,
    rootName: root.name,
    id: selected._id,
    name: selected.name,
    level: selected.level,
    isRoot: selected._id === root._id,
    ids,
    coversAll: ids.size === rows.length,
    rows,
    byId,
    facilityOf,
    options,
  };
}

/**
 * The Mongo clause that narrows a collection to this scope, keyed by the field
 * holding a scope-node id. Empty when the scope covers the whole tree — see
 * `coversAll` for why that is not the same as matching every id.
 */
export function scopeClause(scope: AnalyticsScope, field: string): Record<string, unknown> {
  if (scope.coversAll) return {};
  return { [field]: { $in: [...scope.ids] } };
}
