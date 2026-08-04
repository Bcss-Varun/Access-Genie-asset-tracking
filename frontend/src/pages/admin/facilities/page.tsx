import { useState } from 'react';
import { Link } from 'react-router-dom';
import { scopeTree } from '@/lib/rbac';
import type { ScopeNode } from '@access-genie/shared';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { AddScopeForm } from '@/components/admin/AddScopeForm';
import { useAuth } from '@/api/auth';

interface FacilityRow {
  node: ScopeNode;
  region: string;
  children: number;
}

/** Walk the scope tree, tagging every facility with its enclosing region. */
function deriveFacilities(node: ScopeNode = scopeTree, region = '—'): FacilityRow[] {
  const out: FacilityRow[] = [];
  const nextRegion = node.level === 'region' ? node.name : region;
  if (node.level === 'facility') {
    out.push({ node, region, children: node.children?.length ?? 0 });
  }
  for (const child of node.children ?? []) out.push(...deriveFacilities(child, nextRegion));
  return out;
}

/** Where a new facility can be filed: the org root, or any region under it. */
function parentOptions(node: ScopeNode = scopeTree): ScopeNode[] {
  const out: ScopeNode[] = [];
  if (node.level === 'org' || node.level === 'region') out.push(node);
  for (const child of node.children ?? []) out.push(...parentOptions(child));
  return out;
}

export default function AdminFacilitiesPage() {
  // Writing to the hierarchy is `admin` on the API, so the action is hidden for
  // roles without the grant rather than offered and then refused.
  const canEdit = useAuth().can('admin');

  const facilities = deriveFacilities();
  const parents = parentOptions();
  const totalAssets = facilities.reduce((s, f) => s + (f.node.assetCount ?? 0), 0);

  const [adding, setAdding] = useState(false);
  const [parentId, setParentId] = useState(scopeTree.id);
  const parent = parents.find((p) => p.id === parentId) ?? scopeTree;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Facilities"
        subtitle="Every physical site under management, grouped by region."
        breadcrumb={[{ label: 'Administration', href: '/admin/org' }, { label: 'Facilities' }]}
        actions={
          canEdit ? (
            <Button onClick={() => setAdding((a) => !a)}>{adding ? 'Cancel' : '+ Add Facility'}</Button>
          ) : undefined
        }
      />

      {adding && (
        <div className="glass-panel rounded-xl p-6">
          <h2 className="font-heading text-base font-bold text-slate-900">New facility</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            A facility is somewhere an asset can be — a warehouse, an office, a plant. Buildings and zones go inside it
            afterwards; until then assets can be located at the facility itself.
          </p>

          <div className="mt-5 flex flex-wrap items-end gap-3">
            {parents.length > 1 && (
              <div className="w-56">
                <label
                  htmlFor="fac-parent"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Inside
                </label>
                <select
                  id="fac-parent"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                >
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.level === 'org' ? '🏛️' : '🌎'} {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="min-w-[18rem] flex-1">
              <AddScopeForm parent={parent} only="facility" onAdded={() => setAdding(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Facilities" value={facilities.length} sub="Active sites" tone="emerald" accent />
        <KpiCard label="Regions" value={new Set(facilities.map((f) => f.region)).size} sub="Geographic clusters" tone="primary" />
        <KpiCard label="Assets" value={totalAssets.toLocaleString()} sub="Across all facilities" tone="slate" />
      </div>

      {facilities.length === 0 ? (
        <EmptyState
          icon="🏭"
          title="No facilities yet"
          description="A facility is a place an asset can be. Until one exists, registration has nowhere to put anything — so this is the first thing to set up."
          action={canEdit ? <Button onClick={() => setAdding(true)}>+ Add Facility</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {facilities.map((f) => (
            <Link
              key={f.node.id}
              to={`/admin/facilities/${f.node.id}`}
              className="glass-panel rounded-xl p-5 flex flex-col gap-3 hover:shadow-md hover:border-primary-200 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-2xl">🏭</span>
                  <h3 className="font-heading font-semibold text-slate-900 truncate">{f.node.name}</h3>
                </div>
                <Badge tone="primary">{f.region}</Badge>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                <span className="font-mono text-slate-400">{f.node.id}</span>
                <span className="font-medium text-slate-500">
                  {f.children} {f.children === 1 ? 'sub-scope' : 'sub-scopes'}
                </span>
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-heading text-slate-900 tabular-nums">
                  {(f.node.assetCount ?? 0).toLocaleString()}
                </span>
                <span className="text-xs text-slate-400">assets tracked</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
