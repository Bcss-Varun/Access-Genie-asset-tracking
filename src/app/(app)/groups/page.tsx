'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { mockGroups, getAssetById, mockAssets } from '@/lib/mock-data';
import type { Asset, AssetGroup } from '@/types/asset';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

const categoryEmoji = (c: Asset['category']): string =>
  c === 'Endpoints' ? '📱' : c === 'Compute' ? '💻' : c === 'Network' ? '🌐' : c === 'Sensors' ? '📡' : c === 'Infrastructure' ? '⚡' : '⚙️';

const typeTone = (t: AssetGroup['type']): 'primary' | 'emerald' | 'amber' =>
  t === 'Fleet' ? 'primary' : t === 'Kit' ? 'amber' : 'emerald';

const typeEmoji = (t: AssetGroup['type']): string =>
  t === 'Fleet' ? '💻' : t === 'Kit' ? '📦' : '🗂️';

const FILTERS = ['All', 'Group', 'Fleet'] as const;

export default function GroupsPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');

  const filtered = useMemo(
    () => mockGroups.filter((g) => filter === 'All' || g.type === filter),
    [filter],
  );

  const totalGroups = mockGroups.filter((g) => g.type === 'Group').length;
  const totalFleets = mockGroups.filter((g) => g.type === 'Fleet').length;
  const totalKits = mockGroups.filter((g) => g.type === 'Kit').length;
  const groupedAssets = new Set(mockGroups.flatMap((g) => g.memberIds)).size;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Groups & Fleets"
        subtitle="Organize assets into logical collections, fleets, and provisioning kits."
        breadcrumb={[{ label: 'Assets', href: '/assets' }, { label: 'Groups' }]}
        actions={
          <Button onClick={() => toast({ title: 'New Group', description: 'Group builder is on the roadmap.', tone: 'info' })}>
            + New Group
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Groups" value={totalGroups} sub={`${mockGroups.length} collections total`} tone="emerald" />
        <KpiCard label="Fleets" value={totalFleets} sub="Device & hardware fleets" tone="primary" accent />
        <KpiCard label="Kits" value={totalKits} sub="Bundled / BOM assets" tone="amber" />
        <KpiCard label="Assets Grouped" value={groupedAssets} sub={`of ${mockAssets.length} total assets`} />
      </div>

      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              filter === f
                ? 'bg-primary-50 border-primary-200 text-primary-700'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50',
            )}
          >
            {f === 'All' ? 'All' : `${f}s`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          variant="no-results"
          title="No collections match this filter"
          description="Try a different type, or create a new group."
          action={<Button variant="outline" onClick={() => setFilter('All')}>Clear filter</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((g) => {
            const members = g.memberIds.map(getAssetById).filter((a): a is Asset => Boolean(a));
            return (
              <Link
                key={g.id}
                href={`/groups/${g.id}`}
                className="glass-panel rounded-xl p-5 flex flex-col gap-3 hover:shadow-md hover:border-primary-200 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-2xl">{typeEmoji(g.type)}</span>
                    <h3 className="font-heading font-semibold text-slate-900 truncate">{g.name}</h3>
                  </div>
                  <Badge tone={typeTone(g.type)}>{g.type}</Badge>
                </div>

                <p className="text-sm text-slate-500 line-clamp-2 flex-1">{g.description}</p>

                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <div className="flex -space-x-2">
                    {members.slice(0, 4).map((m) => (
                      <span
                        key={m.id}
                        title={m.name}
                        className="w-8 h-8 rounded-full bg-slate-100 ring-2 ring-white flex items-center justify-center text-sm"
                      >
                        {categoryEmoji(m.category)}
                      </span>
                    ))}
                    {members.length > 4 && (
                      <span className="w-8 h-8 rounded-full bg-slate-200 ring-2 ring-white flex items-center justify-center text-[11px] font-semibold text-slate-600">
                        +{members.length - 4}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-medium text-slate-400">
                    {g.memberIds.length} {g.memberIds.length === 1 ? 'member' : 'members'}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
