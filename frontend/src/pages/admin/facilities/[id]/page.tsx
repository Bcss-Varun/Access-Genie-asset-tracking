// ─────────────────────────────────────────────────────────────────────────────
// Administration ▸ Facilities ▸ one facility
//
// Shows and edits the facility's *whole* structure, not just what hangs
// directly off it. The first version listed direct children only, which meant a
// building's floors and their zones were invisible here and could not be added
// from this screen — you had to go to Org & Structure to add a floor, then come
// back and find it missing from the very page that claims to show the facility's
// structure.
//
// Every row can therefore take a child of its own, following the same rules the
// API enforces: buildings and zones in a facility, floors and zones in a
// building, zones on a floor.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { flattenScope } from '@/lib/rbac';
import type { ScopeLevel, ScopeNode } from '@access-genie/shared';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AddScopeForm } from '@/components/admin/AddScopeForm';
import { useAuth } from '@/api/auth';
import { useMutate } from '@/api/mutate';
import { scopeApi, ALLOWED_CHILDREN, LEVEL_ICON, LEVEL_LABEL } from '@/api/scope';

const levelTone: Record<ScopeLevel, 'primary' | 'slate' | 'emerald' | 'amber'> = {
  group: 'primary',
  org: 'primary',
  region: 'slate',
  facility: 'emerald',
  building: 'amber',
  floor: 'amber',
  zone: 'slate',
};

export default function FacilityDetailPage() {
  const { id = '' } = useParams();
  const canEdit = useAuth().can('admin');
  const { run, isPending } = useMutate();
  const [addingTo, setAddingTo] = useState<ScopeNode | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ScopeNode | null>(null);

  const entry = flattenScope().find((r) => r.node.id === id);

  if (!entry || entry.node.level !== 'facility') {
    return (
      <div className="h-full flex flex-col space-y-6">
        <EmptyState
          icon="🏭"
          title="Facility not found"
          description={`No facility with id “${id}” exists.`}
          action={<Link to="/admin/facilities"><Button variant="outline">← Back to Facilities</Button></Link>}
        />
      </div>
    );
  }

  const facility = entry.node;

  // The facility's whole subtree, depth-relative to the facility itself. The
  // first row is the facility, so it can take children like any other row.
  const rows = flattenScope(facility);
  const descendants = rows.slice(1);

  const countOf = (level: ScopeLevel) => descendants.filter((r) => r.node.level === level).length;
  const buildings = countOf('building');
  const floors = countOf('floor');
  const zones = countOf('zone');

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={facility.name}
        subtitle="Everything inside this facility — each row is somewhere an asset can be put."
        breadcrumb={[
          { label: 'Administration', href: '/admin/org' },
          { label: 'Facilities', href: '/admin/facilities' },
          { label: facility.name },
        ]}
        actions={<Link to="/admin/facilities"><Button variant="outline">← All Facilities</Button></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Buildings" value={buildings} sub="Inside this facility" tone="amber" accent />
        <KpiCard label="Floors" value={floors} sub="Across its buildings" tone="amber" />
        <KpiCard label="Zones" value={zones} sub="Trackable areas" tone="primary" />
        <KpiCard
          label="Assets"
          value={(facility.assetCount ?? 0).toLocaleString()}
          sub="Tracked at this facility"
          tone="emerald"
        />
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-5 pb-3">
          <div>
            <h2 className="font-heading font-semibold text-slate-900">Structure</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Facility ▸ Building ▸ Floor ▸ Zone. Add a level inside any row; the registration flow offers every one of
              them as a place.
            </p>
          </div>
          <span className="shrink-0 text-xs text-slate-400">
            {descendants.length} {descendants.length === 1 ? 'sub-scope' : 'sub-scopes'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">Node</th>
                <th className="px-5 py-2.5">Level</th>
                <th className="px-5 py-2.5 font-mono">ID</th>
                <th className="px-5 py-2.5 text-right">Assets</th>
                {canEdit && <th className="px-5 py-2.5 text-right">Structure</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node, depth }) => [
                <tr key={node.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3">
                    <span
                      className="flex items-center gap-2 font-medium text-slate-800"
                      style={{ paddingLeft: `${depth * 1.5}rem` }}
                    >
                      <span className="text-base leading-none">{LEVEL_ICON[node.level]}</span>
                      {node.name}
                    </span>
                  </td>
                  <td className="px-5 py-3"><Badge tone={levelTone[node.level]}>{node.level}</Badge></td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{node.id}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium text-slate-700">
                    {node.assetCount?.toLocaleString() ?? '—'}
                  </td>
                  {canEdit && (
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {ALLOWED_CHILDREN[node.level].length > 0 && (
                          <button
                            type="button"
                            onClick={() => setAddingTo((cur) => (cur?.id === node.id ? null : node))}
                            className="rounded px-2 py-1 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50"
                          >
                            {addingTo?.id === node.id ? 'Cancel' : '+ Add inside'}
                          </button>
                        )}
                        {/* The facility itself is removed from the list page, not
                            from inside its own detail view. */}
                        {node.id !== facility.id && (
                          <button
                            type="button"
                            onClick={() => setPendingDelete(node)}
                            aria-label={`Remove ${node.name}`}
                            title="Remove this scope"
                            className="rounded p-1 text-slate-400 transition-colors hover:bg-red-100 hover:text-health-critical"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>,
                addingTo?.id === node.id && (
                  <tr key={`${node.id}-add`} className="border-b border-slate-100 bg-slate-50/60">
                    <td colSpan={5} className="px-5 py-4">
                      <div style={{ paddingLeft: `${depth * 1.5}rem` }}>
                        <p className="mb-2 text-xs text-slate-500">
                          Adding inside <span className="font-medium text-slate-700">{node.name}</span> —{' '}
                          {ALLOWED_CHILDREN[node.level].map((l) => LEVEL_LABEL[l].toLowerCase()).join(' or ')} only.
                        </p>
                        <AddScopeForm
                          parent={node}
                          onAdded={() => setAddingTo(null)}
                          onCancel={() => setAddingTo(null)}
                        />
                      </div>
                    </td>
                  </tr>
                ),
              ]).flat().filter(Boolean)}
            </tbody>
          </table>
        </div>

        {descendants.length === 0 && (
          <EmptyState
            icon="🏢"
            title="Nothing inside this facility yet"
            description="Assets can already be located at the facility itself. Add buildings, floors and zones when you need to say where inside it something is."
            action={canEdit ? <Button onClick={() => setAddingTo(facility)}>+ Add inside {facility.name}</Button> : undefined}
          />
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={`Remove ${pendingDelete.name}?`}
          description={
            <>
              This {pendingDelete.level} is removed from the location hierarchy. The API refuses it while anything is
              still inside it or any asset is located there, so nothing is left pointing at a place that no longer
              exists.
            </>
          }
          confirmLabel="Remove"
          busy={isPending}
          onConfirm={() => {
            const target = pendingDelete;
            void run(scopeApi.remove(target.id), {
              success: `${target.name} removed`,
              describe: `remove ${target.name}`,
            }).then(() => setPendingDelete(null));
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
