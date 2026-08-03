import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { mockGroups, getAssetById } from '@/lib/mock-data';
import type { Asset } from '@/types/asset';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { formatMoney } from '@/lib/utils';

const categoryEmoji = (c: Asset['category']): string =>
  c === 'Endpoints' ? '📱' : c === 'Compute' ? '💻' : c === 'Network' ? '🌐' : c === 'Sensors' ? '📡' : c === 'Infrastructure' ? '⚡' : '⚙️';

export default function KitsPage() {
  const { toast } = useToast();

  const kits = useMemo(() => mockGroups.filter((g) => g.type === 'Kit'), []);

  const totalKits = kits.length;
  const totalComponents = kits.reduce((sum, k) => sum + k.memberIds.length, 0);
  const bundledValue = kits.reduce(
    (sum, k) => sum + k.memberIds.reduce((s, id) => s + (getAssetById(id)?.bookValue ?? 0), 0),
    0,
  );

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Kits"
        subtitle="Bundled assets provisioned and tracked together as a bill of materials (BOM)."
        breadcrumb={[{ label: 'Assets', href: '/assets' }, { label: 'Kits' }]}
        actions={
          <Button onClick={() => toast({ title: 'New Kit', description: 'Kit builder is on the roadmap.', tone: 'info' })}>
            + New Kit
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Kits" value={totalKits} sub="Bundled BOM assets" tone="amber" accent />
        <KpiCard label="Components" value={totalComponents} sub="Across all kits" tone="primary" />
        <KpiCard label="Bundled Value" value={formatMoney(bundledValue)} sub="Combined book value" tone="emerald" />
      </div>

      {kits.length === 0 ? (
        <EmptyState
          icon="📦"
          title="No kits defined"
          description="Bundle assets into a kit to provision and track them as one unit."
          action={<Button onClick={() => toast({ title: 'New Kit', description: 'Kit builder is on the roadmap.', tone: 'info' })}>+ New Kit</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {kits.map((k) => {
            const components = k.memberIds.map(getAssetById).filter((a): a is Asset => Boolean(a));
            const kitValue = components.reduce((s, c) => s + (c.bookValue ?? 0), 0);
            return (
              <Link
                key={k.id}
                to={`/groups/${k.id}`}
                className="glass-panel rounded-xl p-5 flex flex-col gap-4 hover:shadow-md hover:border-amber-200 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-2xl">📦</span>
                    <div className="min-w-0">
                      <h3 className="font-heading font-semibold text-slate-900 truncate">{k.name}</h3>
                      <p className="text-xs text-slate-500 truncate">{k.description}</p>
                    </div>
                  </div>
                  <Badge tone="amber">Kit</Badge>
                </div>

                <div className="rounded-lg border border-slate-100 divide-y divide-slate-100">
                  <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-50/60">
                    Components ({components.length})
                  </div>
                  {components.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="text-base">{categoryEmoji(c.category)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-800 truncate">{c.name}</div>
                        <div className="text-xs text-slate-400">{c.id} · {c.category}</div>
                      </div>
                      <span className="text-xs tabular-nums text-slate-500">{c.bookValue != null ? formatMoney(c.bookValue) : '—'}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                  <span className="font-medium text-slate-400">{components.length} components</span>
                  <span className="font-semibold text-slate-600">{formatMoney(kitValue)} bundled</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
