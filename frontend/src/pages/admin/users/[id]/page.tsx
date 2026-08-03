import { Link, useParams } from 'react-router-dom';
import { allUsers, roles, resolveModules, findScope } from '@/lib/rbac';
import type { ModuleKey } from '@access-genie/shared';
import { PageHeader, Badge, EmptyState, Avatar } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';

const tierTone: Record<string, 'primary' | 'emerald' | 'amber' | 'slate'> = {
  Platform: 'primary',
  'Tenant Admin': 'primary',
  Management: 'emerald',
  Field: 'amber',
  Business: 'slate',
};

const moduleLabel: Record<ModuleKey, string> = {
  workspace: 'Workspace',
  assets: 'Assets',
  tracking: 'Tracking',
  ai: 'AI Intelligence',
  maintenance: 'Maintenance',
  inventory: 'Inventory',
  operations: 'Operations',
  analytics: 'Analytics',
  alerts: 'Alerts',
  compliance: 'Compliance',
  admin: 'Administration',
  system: 'System',
};

export default function UserDetailPage() {
  const { id = '' } = useParams();
  const { toast } = useToast();
  const user = allUsers.find((u) => u.id === id);

  if (!user) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <EmptyState
          icon="👤"
          title="User not found"
          description={`No user with id “${id}” exists in this session.`}
          action={<Link to="/admin/users"><Button variant="outline">← Back to Users</Button></Link>}
        />
      </div>
    );
  }

  const role = roles[user.roleId];
  const modules = resolveModules(user.roleId);
  const scope = findScope(user.homeScopeId);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={user.name}
        subtitle={user.title}
        breadcrumb={[
          { label: 'Administration', href: '/admin/org' },
          { label: 'Users', href: '/admin/users' },
          { label: user.name },
        ]}
        actions={<Link to="/admin/users"><Button variant="outline">← All Users</Button></Link>}
      />

      <div className="glass-panel rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <Avatar initials={user.initials} className="w-16 h-16 text-xl" />
        <div className="min-w-0 flex-1">
          <div className="text-lg font-heading font-semibold text-slate-900">{user.name}</div>
          <div className="text-sm text-slate-500">{user.email}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="primary">{role.name}</Badge>
            <Badge tone={tierTone[role.tier] ?? 'slate'}>{role.tier}</Badge>
            <Badge tone="slate">🏠 {scope?.name ?? user.homeScopeId}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => toast({ title: 'Edit role', description: `Role editing for ${user.name} is on the roadmap.`, tone: 'info' })}>
            Edit role
          </Button>
          <Button variant="danger" onClick={() => toast({ title: 'Deactivate', description: `${user.name} would be deactivated.`, tone: 'error' })}>
            Deactivate
          </Button>
        </div>
      </div>

      <div className="glass-panel rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-semibold text-slate-900">Module Permissions</h2>
          <span className="text-xs text-slate-400">{modules.length} of {Object.keys(moduleLabel).length} modules</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(moduleLabel) as ModuleKey[]).map((m) => {
            const granted = modules.includes(m);
            return (
              <span
                key={m}
                className={
                  granted
                    ? 'inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700'
                    : 'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-400'
                }
              >
                <span>{granted ? '✓' : '–'}</span>
                {moduleLabel[m]}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
