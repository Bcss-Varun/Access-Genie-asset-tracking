import { Link, useParams } from 'react-router-dom';
import { flattenScope } from '@/lib/rbac';
import type { ScopeLevel } from '@access-genie/shared';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';

const levelTone: Record<ScopeLevel, 'primary' | 'slate' | 'emerald' | 'amber'> = {
  org: 'primary',
  region: 'slate',
  facility: 'emerald',
  building: 'amber',
  floor: 'amber',
  zone: 'slate',
};

const levelIcon: Record<string, string> = {
  building: '🏢',
  floor: '🪜',
  zone: '📍',
};

export default function FacilityDetailPage() {
  const { id = '' } = useParams();
  const flat = flattenScope();
  const entry = flat.find((r) => r.node.id === id);

  if (!entry || entry.node.level !== 'facility') {
    return (
      <div className="h-full flex flex-col space-y-6">
        <EmptyState
          icon="🏭"
          title="Facility not found"
          description={`No facility with id “${id}” exists in this session.`}
          action={<Link to="/admin/facilities"><Button variant="outline">← Back to Facilities</Button></Link>}
        />
      </div>
    );
  }

  const facility = entry.node;
  const children = facility.children ?? [];
  const buildings = children.filter((c) => c.level === 'building');
  const zones = children.filter((c) => c.level === 'zone');
  // Zones nested inside this facility's buildings, too.
  const nestedZones = children.flatMap((c) => c.children ?? []).filter((n) => n.level === 'zone');
  const totalZones = zones.length + nestedZones.length;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={facility.name}
        subtitle="Facility structure and sub-scopes."
        breadcrumb={[
          { label: 'Administration', href: '/admin/org' },
          { label: 'Facilities', href: '/admin/facilities' },
          { label: facility.name },
        ]}
        actions={<Link to="/admin/facilities"><Button variant="outline">← All Facilities</Button></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Buildings" value={buildings.length} sub="Direct sub-scopes" tone="amber" accent />
        <KpiCard label="Zones" value={totalZones} sub="Trackable areas" tone="primary" />
        <KpiCard label="Assets" value={(facility.assetCount ?? 0).toLocaleString()} sub="Tracked at this facility" tone="emerald" />
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-5 pb-3">
          <h2 className="font-heading font-semibold text-slate-900">Sub-scopes</h2>
          <span className="text-xs text-slate-400">{children.length} direct children</span>
        </div>
        {children.length === 0 ? (
          <EmptyState
            title="No sub-scopes defined"
            description="This facility has no buildings or zones recorded in the current session."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">Name</th>
                  <th className="px-5 py-2.5">Level</th>
                  <th className="px-5 py-2.5 font-mono">ID</th>
                  <th className="px-5 py-2.5 text-right">Assets</th>
                </tr>
              </thead>
              <tbody>
                {children.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2 font-medium text-slate-800">
                        <span className="text-base leading-none">{levelIcon[c.level] ?? '📍'}</span>
                        {c.name}
                      </span>
                    </td>
                    <td className="px-5 py-3"><Badge tone={levelTone[c.level]}>{c.level}</Badge></td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{c.id}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium text-slate-700">
                      {c.assetCount?.toLocaleString() ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
