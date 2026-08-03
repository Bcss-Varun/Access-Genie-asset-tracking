import { allTeams } from '@/lib/dataset';
import { allUsers, roles } from '@/lib/rbac';
import type { PublicUser } from '@access-genie/shared';
import { PageHeader, Badge, KpiCard, Avatar, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';

const deptTone: Record<string, 'primary' | 'emerald' | 'amber' | 'slate'> = {
  Operations: 'emerald',
  IT: 'primary',
  Technology: 'amber',
  'Risk & Compliance': 'slate',
};

export default function AdminTeamsPage() {
  const { toast } = useToast();

  // Read inside the component, not at module scope: `allTeams` is a hydrated
  // binding, and a copy taken at import time never sees a re-hydration.
  const TEAMS = allTeams;

  // Distribute the roster across the teams (round-robin). Guarded on there being
  // a team to distribute *into*: `i % 0` is NaN, and `TEAMS[NaN]` is undefined.
  const membersByTeam: Record<string, PublicUser[]> = Object.fromEntries(TEAMS.map((t) => [t.id, []]));
  if (TEAMS.length > 0) {
    allUsers.forEach((u, i) => {
      membersByTeam[TEAMS[i % TEAMS.length].id].push(u);
    });
  }

  const rows = TEAMS.map((t) => {
    const mapped = membersByTeam[t.id];
    // A team with no members assigned has no lead to show — rendered as such
    // below rather than borrowed from the top of the user list.
    const lead = mapped[0] ?? allUsers[0];
    return { ...t, mapped, lead, count: mapped.length + t.extra };
  });

  const totalMembers = rows.reduce((s, t) => s + t.count, 0);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Teams & Departments"
        subtitle="Cross-functional teams responsible for the asset lifecycle."
        breadcrumb={[{ label: 'Administration', href: '/admin/org' }, { label: 'Teams' }]}
        actions={
          <Button onClick={() => toast({ title: 'New Team', description: 'Team creation is on the roadmap.', tone: 'info' })}>
            + New Team
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Teams" value={rows.length} sub="Active teams" tone="primary" accent />
        <KpiCard label="Departments" value={new Set(TEAMS.map((t) => t.department)).size} sub="Functional areas" tone="emerald" />
        <KpiCard label="Members" value={totalMembers} sub="Across all teams" tone="slate" />
      </div>

      {rows.length === 0 && (
        <div className="glass-panel rounded-xl">
          <EmptyState
            icon="👥"
            title="No teams yet"
            description="Teams group the people responsible for an area of the estate — who maintains it, who audits it, who signs off. Create one to start assigning ownership."
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((t) => (
          <div key={t.id} className="glass-panel rounded-xl p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-2xl">{t.emoji}</span>
                <h3 className="font-heading font-semibold text-slate-900 truncate">{t.name}</h3>
              </div>
              <Badge tone={deptTone[t.department] ?? 'slate'}>{t.department}</Badge>
            </div>

            <p className="text-sm text-slate-500 line-clamp-2 flex-1">{t.description}</p>

            <div className="flex items-center gap-2.5 pt-3 border-t border-slate-100">
              <Avatar initials={t.lead?.initials ?? '—'} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800 truncate">{t.lead?.name ?? 'No lead assigned'}</div>
                <div className="text-xs text-slate-400">
                  {t.lead ? `Team lead · ${roles[t.lead.roleId].name}` : 'Assign someone to this team'}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold font-heading text-slate-900 tabular-nums">{t.count}</div>
                <div className="text-[11px] text-slate-400">members</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
