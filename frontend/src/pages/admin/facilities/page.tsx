import { Link } from 'react-router-dom';
import { scopeTree } from '@/lib/rbac';
import type { ScopeNode } from '@/types/platform';
import { PageHeader, Badge, KpiCard } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';

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

export default function AdminFacilitiesPage() {
  const { toast } = useToast();
  const facilities = deriveFacilities();
  const totalAssets = facilities.reduce((s, f) => s + (f.node.assetCount ?? 0), 0);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Facilities"
        subtitle="Every physical site under management, grouped by region."
        breadcrumb={[{ label: 'Administration', href: '/admin/org' }, { label: 'Facilities' }]}
        actions={
          <Button onClick={() => toast({ title: 'Add Facility', description: 'The facility onboarding wizard is on the roadmap.', tone: 'info' })}>
            + Add Facility
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Facilities" value={facilities.length} sub="Active sites" tone="emerald" accent />
        <KpiCard label="Regions" value={new Set(facilities.map((f) => f.region)).size} sub="Geographic clusters" tone="primary" />
        <KpiCard label="Assets" value={totalAssets.toLocaleString()} sub="Across all facilities" tone="slate" />
      </div>

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
    </div>
  );
}
