import { roles, resolveModules } from '@/lib/rbac';
import type { ModuleKey, RoleId } from '@/types/platform';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';

const tierTone: Record<string, 'primary' | 'emerald' | 'amber' | 'slate'> = {
  Platform: 'primary',
  'Tenant Admin': 'primary',
  Management: 'emerald',
  Field: 'amber',
  Business: 'slate',
};

const MODULES: { key: ModuleKey; label: string }[] = [
  { key: 'workspace', label: 'Workspace' },
  { key: 'assets', label: 'Assets' },
  { key: 'tracking', label: 'Tracking' },
  { key: 'ai', label: 'AI' },
  { key: 'maintenance', label: 'Maint.' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'operations', label: 'Ops' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'admin', label: 'Admin' },
  { key: 'system', label: 'System' },
];

export default function AdminRolesPage() {
  const { toast } = useToast();
  const roleList = Object.values(roles);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Roles & Permissions"
        subtitle="Which modules each role can access. Roles drive the role-adaptive navigation."
        breadcrumb={[{ label: 'Administration', href: '/admin/org' }, { label: 'Roles' }]}
        actions={
          <Button onClick={() => toast({ title: 'New Role', description: 'Custom role creation is on the roadmap.', tone: 'info' })}>
            + New Role
          </Button>
        }
      />

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-5 pb-3">
          <h2 className="font-heading font-semibold text-slate-900">Permission Matrix</h2>
          <span className="text-xs text-slate-400">{roleList.length} roles × {MODULES.length} modules</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5 text-left sticky left-0 bg-slate-50/70 z-10">Role</th>
                <th className="px-3 py-2.5 text-left">Tier</th>
                {MODULES.map((m) => (
                  <th key={m.key} className="px-3 py-2.5 text-center whitespace-nowrap">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roleList.map((role) => {
                const granted = new Set(resolveModules(role.id as RoleId));
                return (
                  <tr key={role.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-800 whitespace-nowrap sticky left-0 bg-white z-10">{role.name}</td>
                    <td className="px-3 py-3"><Badge tone={tierTone[role.tier] ?? 'slate'}>{role.tier}</Badge></td>
                    {MODULES.map((m) => {
                      const has = granted.has(m.key);
                      return (
                        <td key={m.key} className="px-3 py-3 text-center">
                          <span className={has ? 'text-emerald-600 font-semibold' : 'text-slate-300'}>
                            {has ? '✓' : '–'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
