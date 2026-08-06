import { useState } from 'react';
import { Link } from 'react-router-dom';
import { flattenScope } from '@/lib/rbac';
import type { ScopeLevel, ScopeNode } from '@access-genie/shared';
import { PageHeader, Badge, KpiCard } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AddScopeForm } from '@/components/admin/AddScopeForm';
import { useAuth } from '@/api/auth';
import { useMutate } from '@/api/mutate';
import { scopeApi, ALLOWED_CHILDREN } from '@/api/scope';

const levelTone: Record<ScopeLevel, 'primary' | 'slate' | 'emerald' | 'amber'> = {
  group: 'primary',
  org: 'primary',
  region: 'slate',
  facility: 'emerald',
  building: 'amber',
  floor: 'amber',
  zone: 'slate',
};

const levelIcon: Record<ScopeLevel, string> = {
  org: '🏛️',
  region: '🌎',
  facility: '🏭',
  building: '🏢',
  floor: '🪜',
  zone: '📍',
} as Record<ScopeLevel, string>;

export default function AdminOrgPage() {
  // The hierarchy is what every role's access is scoped against, so editing it
  // is `admin` on the API — offered here only to roles that hold the grant.
  const canEdit = useAuth().can('admin');
  const { run, isPending } = useMutate();
  const [addingTo, setAddingTo] = useState<ScopeNode | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ScopeNode | null>(null);

  const rows = flattenScope();

  const facilities = rows.filter((r) => r.node.level === 'facility').length;
  const buildings = rows.filter((r) => r.node.level === 'building').length;
  const zones = rows.filter((r) => r.node.level === 'zone').length;
  const totalAssets = rows.find((r) => r.node.level === 'org')?.node.assetCount ?? 0;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Organization & Structure"
        subtitle="The scope hierarchy — Org ▸ Region ▸ Facility ▸ Building ▸ Zone — that governs data access."
        breadcrumb={[{ label: 'Administration', href: '/admin/org' }, { label: 'Org & Structure' }]}
        actions={
          canEdit ? (
            <Link to="/admin/facilities"><Button>+ Add Facility</Button></Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Facilities" value={facilities} sub="Active sites" tone="emerald" accent />
        <KpiCard label="Buildings" value={buildings} sub="Across all facilities" tone="amber" />
        <KpiCard label="Zones" value={zones} sub="Trackable areas" tone="primary" />
        <KpiCard label="Total Assets" value={totalAssets.toLocaleString()} sub="Under management" tone="slate" />
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-5 pb-3">
          <div>
            <h2 className="font-heading font-semibold text-slate-900">Scope Hierarchy</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Org ▸ Region ▸ Facility ▸ Building ▸ Floor ▸ Zone. Every facility, building and zone here is somewhere an
              asset can be put — this is the list the registration flow picks from.
            </p>
          </div>
          <span className="shrink-0 text-xs text-slate-400">{rows.length} nodes</span>
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
                    <span className="flex items-center gap-2 font-medium text-slate-800" style={{ paddingLeft: `${depth * 1.5}rem` }}>
                      <span className="text-base leading-none">{levelIcon[node.level] ?? '📍'}</span>
                      {node.name}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={levelTone[node.level]}>{node.level}</Badge>
                  </td>
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
                        {node.level !== 'org' && (
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
                        <AddScopeForm parent={node} onAdded={() => setAddingTo(null)} onCancel={() => setAddingTo(null)} />
                      </div>
                    </td>
                  </tr>
                ),
              ]).flat().filter(Boolean)}
            </tbody>
          </table>
        </div>
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
