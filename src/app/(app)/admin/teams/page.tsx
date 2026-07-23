'use client';

import { mockUsers, roles } from '@/lib/rbac';
import type { User } from '@/types/platform';
import { PageHeader, Badge, KpiCard, Avatar } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';

interface TeamDef {
  id: string;
  name: string;
  emoji: string;
  department: string;
  description: string;
  /** deterministic headcount padding on top of the mapped demo users */
  extra: number;
}

const TEAMS: TeamDef[] = [
  { id: 'fleet', name: 'Fleet Maintenance', emoji: '🚚', department: 'Operations', description: 'Keeps vehicles and heavy machinery serviced and road-ready.', extra: 11 },
  { id: 'biomed', name: 'Biomed', emoji: '⚕️', department: 'Clinical Engineering', description: 'Maintains and calibrates medical devices across hospital wings.', extra: 8 },
  { id: 'itops', name: 'IT Ops', emoji: '💻', department: 'Technology', description: 'Runs data-center infrastructure, gateways, and connectivity.', extra: 6 },
  { id: 'facilities', name: 'Facilities', emoji: '🏭', department: 'Operations', description: 'Manages buildings, zones, and site-level asset logistics.', extra: 9 },
  { id: 'security', name: 'Security', emoji: '🛡️', department: 'Risk & Compliance', description: 'Monitors geofences, theft alerts, and physical access.', extra: 4 },
];

const deptTone: Record<string, 'primary' | 'emerald' | 'amber' | 'slate'> = {
  Operations: 'emerald',
  'Clinical Engineering': 'primary',
  Technology: 'amber',
  'Risk & Compliance': 'slate',
};

export default function AdminTeamsPage() {
  const { toast } = useToast();

  // Deterministically map demo users onto teams (round-robin over the roster).
  const membersByTeam: Record<string, User[]> = Object.fromEntries(TEAMS.map((t) => [t.id, []]));
  mockUsers.forEach((u, i) => {
    membersByTeam[TEAMS[i % TEAMS.length].id].push(u);
  });

  const rows = TEAMS.map((t) => {
    const mapped = membersByTeam[t.id];
    const lead = mapped[0] ?? mockUsers[0];
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
              <Avatar initials={t.lead.initials} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800 truncate">{t.lead.name}</div>
                <div className="text-xs text-slate-400">Team lead · {roles[t.lead.roleId].name}</div>
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
