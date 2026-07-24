import { model, Schema } from 'mongoose';
import type { ScopeLevel, ScopeNode } from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * The location hierarchy: Org ▸ Region ▸ Facility ▸ Building ▸ Floor ▸ Zone.
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
    level: {
      type: String,
      required: true,
      enum: ['org', 'region', 'facility', 'building', 'floor', 'zone'],
      index: true,
    },
    parentId: { type: String, ref: 'ScopeNode', index: true },
    assetCount: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false },
);

scopeSchema.plugin(baseSchemaPlugin);

export const ScopeNodeModel = model<ScopeNodeDoc>('ScopeNode', scopeSchema);

/** Assemble the flat rows into a tree rooted at the org node. */
export function buildScopeTree(rows: ScopeNodeDoc[]): ScopeNode | null {
  const byId = new Map<string, ScopeNode>(
    rows.map((r) => [r._id, { id: r._id, name: r.name, level: r.level, parentId: r.parentId, assetCount: r.assetCount }]),
  );

  let root: ScopeNode | null = null;
  for (const row of rows) {
    const node = byId.get(row._id);
    if (!node) continue;
    if (!row.parentId) {
      root = node;
      continue;
    }
    const parent = byId.get(row.parentId);
    // A node whose parent is missing would silently vanish from the tree; keep
    // it visible at the root instead of dropping it.
    if (!parent) {
      root ??= node;
      continue;
    }
    (parent.children ??= []).push(node);
  }

  return root;
}
