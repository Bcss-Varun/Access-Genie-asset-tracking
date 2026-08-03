import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { mockGroups, getAssetById } from '@/lib/mock-data';
import type { Asset, AssetGroup } from '@/types/asset';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, formatMoney } from '@/lib/utils';

const categoryEmoji = (c: Asset['category']): string =>
  c === 'Endpoints' ? '📱' : c === 'Compute' ? '💻' : c === 'Network' ? '🌐' : c === 'Sensors' ? '📡' : c === 'Infrastructure' ? '⚡' : '⚙️';

const typeTone = (t: AssetGroup['type']): 'primary' | 'emerald' | 'amber' =>
  t === 'Fleet' ? 'primary' : t === 'Kit' ? 'amber' : 'emerald';

const statusTone = (s: Asset['status']): 'emerald' | 'amber' | 'red' | 'slate' =>
  s === 'Active' ? 'emerald' : s === 'Maintenance' ? 'amber' : s === 'Missing' ? 'red' : 'slate';

const healthColor = (h: number): string =>
  h > 80 ? 'bg-health-good' : h > 50 ? 'bg-health-warning' : 'bg-health-critical';

export default function GroupDetailPage() {
  const { id = '' } = useParams();
  const { toast } = useToast();
  const group = mockGroups.find((g) => g.id === id);

  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const members = useMemo(() => {
    if (!group) return [];
    return group.memberIds
      .filter((mid) => !removed.has(mid))
      .map(getAssetById)
      .filter((a): a is Asset => Boolean(a));
  }, [group, removed]);

  if (!group) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <EmptyState
          icon="🗂️"
          title="Group not found"
          description={`No collection with id “${id}” exists in this session.`}
          action={<Link to="/groups"><Button variant="outline">← Back to Groups</Button></Link>}
        />
      </div>
    );
  }

  const bookValue = members.reduce((sum, m) => sum + (m.bookValue ?? 0), 0);
  const avgHealth = members.length
    ? Math.round(members.reduce((sum, m) => sum + m.healthScore, 0) / members.length)
    : 0;

  const removeMember = (a: Asset) => {
    setRemoved((prev) => new Set(prev).add(a.id));
    toast({ title: 'Member removed', description: `${a.name} removed from ${group.name}`, tone: 'success' });
  };

  const td = 'px-4 py-3.5';
  const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={group.name}
        subtitle={group.description}
        breadcrumb={[
          { label: 'Assets', href: '/assets' },
          { label: 'Groups', href: '/groups' },
          { label: group.name },
        ]}
        actions={
          <>
            <Badge tone={typeTone(group.type)} className="text-sm px-3 py-1">{group.type}</Badge>
            <Button onClick={() => toast({ title: 'Add member', description: 'Member picker is on the roadmap.', tone: 'info' })}>
              + Add Member
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Members" value={members.length} sub={`${group.type} collection`} tone="primary" accent />
        <KpiCard label="Combined Book Value" value={formatMoney(bookValue)} sub="Depreciated across members" tone="emerald" />
        <KpiCard
          label="Avg Health"
          value={`${avgHealth}`}
          sub={avgHealth > 80 ? 'Fleet healthy' : avgHealth > 50 ? 'Watch closely' : 'Attention needed'}
          tone={avgHealth > 80 ? 'emerald' : avgHealth > 50 ? 'amber' : 'red'}
        />
      </div>

      <div className="glass-panel rounded-xl flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-heading font-semibold text-slate-800">Membership</h2>
          <span className="text-xs text-slate-400">{members.length} assets</span>
        </div>

        {members.length === 0 ? (
          <EmptyState
            title="No members in this group"
            description="Every member has been removed. Add assets to rebuild the collection."
            action={<Button onClick={() => toast({ title: 'Add member', description: 'Member picker is on the roadmap.', tone: 'info' })}>+ Add Member</Button>}
          />
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  <th className={th}>Asset</th>
                  <th className={th}>Status</th>
                  <th className={th}>Health</th>
                  <th className={cn(th, 'text-right')}>Book Value</th>
                  <th className={cn(th, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className={td}>
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-base mr-3 shrink-0">{categoryEmoji(m.category)}</div>
                        <div className="min-w-0">
                          <Link to={`/assets/${m.id}`} className="font-medium text-slate-900 hover:text-primary-600">{m.name}</Link>
                          <div className="text-xs text-slate-400">{m.id} · {m.category}</div>
                        </div>
                      </div>
                    </td>
                    <td className={td}><Badge tone={statusTone(m.status)}>{m.status.replace('_', ' ')}</Badge></td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div className={cn('h-full rounded-full', healthColor(m.healthScore))} style={{ width: `${m.healthScore}%` }} />
                        </div>
                        <span className="text-xs font-medium tabular-nums">{m.healthScore}</span>
                      </div>
                    </td>
                    <td className={cn(td, 'text-right tabular-nums text-slate-700')}>{m.bookValue != null ? formatMoney(m.bookValue) : '—'}</td>
                    <td className={cn(td, 'text-right')}>
                      <button onClick={() => removeMember(m)} className="text-xs font-medium text-slate-400 hover:text-health-critical">Remove</button>
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
