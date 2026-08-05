import { Asset, ScopeNodeModel, buildScopeTree, type ScopeNodeDoc } from '../models/index.js';
import type { ScopeNode } from '@access-genie/shared';
import { ApiError } from '../utils/ApiError.js';

/**
 * Resolving "everything under here".
 *
 * The scope switcher picks one node; the estate the user then sees is that node
 * and everything beneath it. An asset records the single node it sits in — a
 * rack, usually — so filtering by a facility means matching against the whole
 * set of ids in that facility's subtree, not against the facility's own id.
 *
 * The tree is small (an org has tens of nodes, not thousands) and read on every
 * dataset load, so it is walked in memory from one query rather than being
 * resolved with a recursive lookup per request.
 */

/** Every id in the subtree rooted at `scopeId`, including `scopeId` itself. */
export function descendantIds(rows: ScopeNodeDoc[], scopeId: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const siblings = childrenOf.get(row.parentId) ?? [];
    siblings.push(row._id);
    childrenOf.set(row.parentId, siblings);
  }

  const out = new Set<string>();
  const queue = [scopeId];
  while (queue.length > 0) {
    const id = queue.pop() as string;
    if (out.has(id)) continue; // a cycle would otherwise spin forever
    out.add(id);
    queue.push(...(childrenOf.get(id) ?? []));
  }
  return out;
}

/**
 * The scope tree with a real asset count on every node.
 *
 * `assetCount` is a stored field that nothing has ever maintained — it read 0
 * on every node of an estate that had assets in it, which made the switcher
 * look broken and made "Assets in Scope" on the dashboard meaningless. It is
 * computed here instead of being written back, because it is derived data: an
 * asset moving would otherwise have to remember to decrement one node and
 * increment another, and any path that forgot would leave the number wrong
 * with nothing to detect it.
 *
 * Counts roll **up**: a facility reports every asset beneath it, so the number
 * next to a node matches what selecting that node will show you.
 */
export async function scopeTreeWithCounts(): Promise<ScopeNode | null> {
  const [rows, assets] = await Promise.all([
    ScopeNodeModel.find().lean<ScopeNodeDoc[]>(),
    Asset.find().select('location.id').lean<{ location?: { id?: string } }[]>(),
  ]);

  const direct = new Map<string, number>();
  for (const asset of assets) {
    const id = asset.location?.id;
    if (!id) continue;
    direct.set(id, (direct.get(id) ?? 0) + 1);
  }

  const tree = buildScopeTree(rows);
  if (!tree) return null;

  const roll = (node: ScopeNode): number => {
    const own = direct.get(node.id) ?? 0;
    const below = (node.children ?? []).reduce((sum, child) => sum + roll(child), 0);
    node.assetCount = own + below;
    return node.assetCount;
  };
  roll(tree);

  return tree;
}

export interface ScopeFilter {
  /** The node the user selected. */
  scopeId: string;
  /** That node and everything under it. */
  ids: Set<string>;
  /** True when the selection is the whole organisation — nothing to filter. */
  isRoot: boolean;
}

/**
 * Turn a requested scope id into a filter, or `null` for "everything".
 *
 * An unknown id is refused rather than quietly ignored: silently widening a
 * request for one facility into the whole estate is the wrong direction to
 * fail in when the point of the parameter is to narrow what someone sees.
 */
export async function resolveScope(scopeId?: string): Promise<ScopeFilter | null> {
  if (!scopeId) return null;

  const rows = await ScopeNodeModel.find().lean<ScopeNodeDoc[]>();
  const node = rows.find((r) => r._id === scopeId);
  if (!node) throw ApiError.notFound('Scope');

  // The org root covers everything, so filtering against it would be work with
  // no effect — and would wrongly drop assets whose location is missing.
  if (!node.parentId) return { scopeId, ids: new Set(rows.map((r) => r._id)), isRoot: true };

  return { scopeId, ids: descendantIds(rows, scopeId), isRoot: false };
}
