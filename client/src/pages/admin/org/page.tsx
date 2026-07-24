import { flattenScope } from '@/lib/rbac';
import type { ScopeLevel } from '@/types/platform';
import { PageHeader, Badge, KpiCard } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';

const levelTone: Record<ScopeLevel, 'primary' | 'slate' | 'emerald' | 'amber'> = {
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
  const { toast } = useToast();
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
        breadcrumb={[{ label: 'Administration', href: '/admin/org' }, { label: 'Org & Facilities' }]}
        actions={
          <Button onClick={() => toast({ title: 'Add Facility', description: 'The structure editor is on the roadmap.', tone: 'info' })}>
            + Add Facility
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Facilities" value={facilities} sub="Active sites" tone="emerald" accent />
        <KpiCard label="Buildings" value={buildings} sub="Across all facilities" tone="amber" />
        <KpiCard label="Zones" value={zones} sub="Trackable areas" tone="primary" />
        <KpiCard label="Total Assets" value={totalAssets.toLocaleString()} sub="Under management" tone="slate" />
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-5 pb-3">
          <h2 className="font-heading font-semibold text-slate-900">Scope Hierarchy</h2>
          <span className="text-xs text-slate-400">{rows.length} nodes</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">Node</th>
                <th className="px-5 py-2.5">Level</th>
                <th className="px-5 py-2.5 font-mono">ID</th>
                <th className="px-5 py-2.5 text-right">Assets</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node, depth }) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
