import { model, Schema } from 'mongoose';
import { SCOPE_LEVELS, type ScopeLevel, type ScopeNode } from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * The hierarchy: Group ▸ Organization ▸ Region ▸ Facility ▸ Building ▸ Floor ▸ Zone.
 *
 * Stored flat with a `parentId` (adjacency list) and assembled into a tree on
 * read. The tree is small and read constantly, so the cost of assembling it is
 * nil next to the cost of keeping nested documents consistent on every move.
 */
export interface ScopeNodeDoc {
  _id: string; // FAC-WH1
  name: string;
  level: ScopeLevel;
  parentId?: string;
  assetCount: number;
}

const scopeSchema = new Schema<ScopeNodeDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    level: { type: String, required: true, enum: SCOPE_LEVELS, index: true },
    parentId: { type: String, ref: 'ScopeNode', index: true },
    assetCount: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false },
);

scopeSchema.plugin(baseSchemaPlugin);

export const ScopeNodeModel = model<ScopeNodeDoc>('ScopeNode', scopeSchema);

/**
 * Assemble the flat rows into one tree.
 *
 * There can be more than one parentless row — a group holding several sister
 * companies is exactly that shape. The previous version kept whichever root it
 * met first and **silently dropped the rest**, taking their entire subtrees with
 * them, so a second organisation was invisible rather than merely unselectable.
 *
 * The rule now: the `group` node is the root if there is one, and any other
 * parentless node hangs beneath it. That is what lets a group be added above an
 * organisation that was already parentless — the existing org simply becomes
 * its child — without a migration.
 *
 * With no group node, a single organisation is still its own root and nothing
 * changes. Several parentless nodes and no group is the one shape this still
 * cannot represent: the first wins and the rest are dropped, because the return
 * type is one tree. It is unreachable through the API — `ALLOWED_PARENTS` in
 * scope.service.ts requires an org to sit under a group — so the fix for it is
 * to add the group, not to invent a parent here.
 */
export function buildScopeTree(rows: ScopeNodeDoc[]): ScopeNode | null {
  const byId = new Map<string, ScopeNode>(
    rows.map((r) => [r._id, { id: r._id, name: r.name, level: r.level, parentId: r.parentId, assetCount: r.assetCount }]),
  );

  const roots: ScopeNode[] = [];
  for (const row of rows) {
    const node = byId.get(row._id);
    if (!node) continue;

    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    // A node whose parent is missing would otherwise vanish; treat it as a root
    // so it stays visible and selectable.
    if (!parent) {
      roots.push(node);
      continue;
    }
    (parent.children ??= []).push(node);
  }

  if (roots.length === 0) return null;

  const group = roots.find((r) => r.level === 'group');
  if (!group) return roots[0] ?? null;

  for (const orphan of roots) {
    if (orphan !== group) (group.children ??= []).push(orphan);
  }
  return group;
}
