import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allUsers, roles, findScope } from '@/lib/rbac';
import type { RoleId } from '@access-genie/shared';
import type { PublicUser } from '@access-genie/shared';
import { PageHeader, Badge, KpiCard, EmptyState, Avatar } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { InviteUserDialog } from '@/components/admin/InviteUserDialog';
import { EditUserDialog } from '@/components/admin/EditUserDialog';
import { cn } from '@/lib/utils';

const tierTone: Record<string, 'primary' | 'emerald' | 'amber' | 'slate'> = {
  Platform: 'primary',
  'Tenant Admin': 'primary',
  Management: 'emerald',
  Field: 'amber',
  Business: 'slate',
};

const ROLE_OPTIONS: (RoleId | 'all')[] = ['all', ...(Object.keys(roles) as RoleId[])];

export default function AdminUsersPage() {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleId | 'all'>('all');
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<PublicUser | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allUsers.filter((u) => {
      if (roleFilter !== 'all' && u.roleId !== roleFilter) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [query, roleFilter]);

  const tiers = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of allUsers) {
      const tier = roles[u.roleId].tier;
      counts[tier] = (counts[tier] ?? 0) + 1;
    }
    return counts;
  }, []);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Users & Roles"
        subtitle="Everyone with access to the platform, and the role that governs what they can do."
        breadcrumb={[{ label: 'Administration', href: '/admin/org' }, { label: 'Users & Roles' }]}
        actions={<Button onClick={() => setInviting(true)}>+ Invite User</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Users" value={allUsers.length} sub="With platform access" tone="primary" accent />
        <KpiCard label="Management" value={tiers['Management'] ?? 0} sub="Managers & admins" tone="emerald" />
        <KpiCard label="Field" value={tiers['Field'] ?? 0} sub="Technicians & officers" tone="amber" />
        <KpiCard label="Platform / Tenant" value={(tiers['Platform'] ?? 0) + (tiers['Tenant Admin'] ?? 0)} sub="Admin tiers" tone="slate" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        />
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {ROLE_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                roleFilter === r
                  ? 'bg-primary-50 border-primary-200 text-primary-700'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50',
              )}
            >
              {r === 'all' ? 'All roles' : roles[r].name}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            variant="no-results"
            title="No users match"
            description="Try a different search term or role filter."
            action={<Button variant="outline" onClick={() => { setQuery(''); setRoleFilter('all'); }}>Clear filters</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">User</th>
                  <th className="px-5 py-2.5">Role</th>
                  <th className="px-5 py-2.5">Tier</th>
                  <th className="px-5 py-2.5">Home Scope</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const role = roles[u.roleId];
                  const scope = findScope(u.homeScopeId);
                  return (
                    <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3">
                        <Link to={`/admin/users/${u.id}`} className="flex items-center gap-3 group">
                          <Avatar initials={u.initials} />
                          <span className="min-w-0">
                            <span className="block font-medium text-slate-800 group-hover:text-primary-600">{u.name}</span>
                            <span className="block text-xs text-slate-400">{u.email}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{role.name}</td>
                      <td className="px-5 py-3"><Badge tone={tierTone[role.tier] ?? 'slate'}>{role.tier}</Badge></td>
                      <td className="px-5 py-3 text-slate-500">{scope?.name ?? u.homeScopeId}</td>
                      <td className="px-5 py-3">
                        <Badge tone={u.status === 'active' ? 'emerald' : 'red'}>{u.status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button variant="ghost" onClick={() => setEditing(u)}>Edit</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {inviting && <InviteUserDialog onClose={() => setInviting(false)} />}
      {editing && <EditUserDialog user={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
