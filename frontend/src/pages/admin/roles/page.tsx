import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ModuleKey } from '@access-genie/shared';
import { PageHeader, Badge, TableSkeleton, ErrorState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { FormDialog, CheckField } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { adminApi, type RoleView } from '@/api/users';
import { useSession } from '@/components/providers/SessionProvider';
import { cn } from '@/lib/utils';

/**
 * Roles & permissions.
 *
 * The button here used to promise custom role creation. It is not offered,
 * because roles are the axis every `requireModule(...)` in the API and every
 * entry in the navigation is written against — inventing new ones at runtime
 * would leave all of that referring to a set that no longer describes the
 * system.
 *
 * What an administrator actually asks for is narrower and entirely safe: "our
 * facility managers also need Analytics". So the matrix is editable.
 *
 * On when a change takes effect — this screen used to say holders were "signed
 * out", which was not what happened and undersold what does. `requireAuth`
 * re-reads the user and re-resolves the role's grants on every single request,
 * so a change lands on the holder's very next action, in both directions, with
 * no sign-out and nothing to wait for. Their refresh token is revoked as well,
 * so the client re-authenticates and picks up its new navigation shortly after.
 */

const tierTone: Record<string, 'primary' | 'emerald' | 'amber' | 'slate'> = {
  Platform: 'primary',
  'Tenant Admin': 'primary',
  Management: 'emerald',
  Field: 'amber',
  Business: 'slate',
};

const MODULES: { key: ModuleKey; label: string; blurb: string }[] = [
  { key: 'workspace', label: 'Workspace', blurb: 'Dashboards, notifications, the home screen' },
  { key: 'assets', label: 'Assets', blurb: 'The registry, registration, custody' },
  { key: 'tracking', label: 'Tracking', blurb: 'Live map, journeys, geofences, devices' },
  { key: 'ai', label: 'AI', blurb: 'Insights, forecasting, anomaly detection' },
  { key: 'maintenance', label: 'Maint.', blurb: 'Work orders, PM schedules, inspections' },
  { key: 'inventory', label: 'Inventory', blurb: 'Parts, stock, purchase orders' },
  { key: 'operations', label: 'Ops', blurb: 'Transfers, reservations, cycle counts' },
  { key: 'analytics', label: 'Analytics', blurb: 'Reports, exports, BI' },
  { key: 'alerts', label: 'Alerts', blurb: 'Alert queue, rules, escalation' },
  { key: 'compliance', label: 'Compliance', blurb: 'Certifications, audit log, retention' },
  { key: 'admin', label: 'Admin', blurb: 'Users, roles, org configuration' },
  { key: 'system', label: 'System', blurb: 'API keys, integrations, platform internals' },
];

function EditRoleDialog({ role, onClose }: { role: RoleView; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const [modules, setModules] = useState<ModuleKey[]>(role.modules);

  const toggle = (key: ModuleKey) =>
    setModules((prev) => (prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]));

  const save = async () => {
    const ok = await run(adminApi.setRoleGrants(role.id, modules), {
      success: `${role.name} updated`,
      successDetail: `${modules.length} module${modules.length === 1 ? '' : 's'} — in effect on their next action.`,
      describe: 'change those permissions',
    });
    if (ok) onClose();
  };

  const reset = async () => {
    const ok = await run(adminApi.resetRoleGrants(role.id), {
      success: `${role.name} reset`,
      successDetail: 'Back to the shipped defaults.',
      describe: 'reset that role',
    });
    if (ok) onClose();
  };

  const changed =
    modules.length !== role.modules.length || modules.some((m) => !role.modules.includes(m));

  return (
    <FormDialog
      icon="🔐"
      title={`${role.name} permissions`}
      description={`${role.userCount} ${role.userCount === 1 ? 'person holds' : 'people hold'} this role. The API checks these grants on every request, so a change applies to them immediately — they do not need to sign in again.`}
      submitLabel="Save permissions"
      width="lg"
      busy={isPending}
      disabled={!changed || modules.length === 0}
      onSubmit={() => void save()}
      onCancel={onClose}
      footer={
        role.customised ? (
          <Button type="button" variant="ghost" disabled={isPending} onClick={() => void reset()}>
            Reset to default
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-2.5 sm:grid-cols-2">
        {MODULES.map((m) => (
          <CheckField
            key={m.key}
            label={m.label}
            hint={m.blurb}
            checked={modules.includes(m.key)}
            onChange={() => toggle(m.key)}
          />
        ))}
      </div>

      {modules.length === 0 && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          A role must grant at least one module — otherwise nobody holding it can reach any screen.
        </p>
      )}
    </FormDialog>
  );
}

export default function AdminRolesPage() {
  const { session } = useSession();
  const canEdit = session.role.id === 'super_admin' || session.role.id === 'org_admin';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['roles'],
    queryFn: adminApi.roles,
  });

  const [editing, setEditing] = useState<RoleView | null>(null);

  // Keep the open dialog in step with a refetch, so it never edits stale grants
  // after another administrator has changed the same role.
  useEffect(() => {
    if (!editing || !data) return;
    const fresh = data.find((r) => r.id === editing.id);
    if (fresh && fresh.modules.join() !== editing.modules.join()) setEditing(fresh);
  }, [data, editing]);

  const customised = data?.filter((r) => r.customised).length ?? 0;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Roles & Permissions"
        subtitle="Which modules each role can access. Roles drive the role-adaptive navigation and the API's own gate."
        breadcrumb={[{ label: 'Administration', href: '/admin/org' }, { label: 'Roles' }]}
      />

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3">
          <div>
            <h2 className="font-heading font-semibold text-slate-900">Permission Matrix</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {canEdit
                ? 'Click a role to change what it can reach. Grants are checked on every request, so changes apply at once.'
                : 'Only an administrator can change these.'}
            </p>
          </div>
          <span className="text-xs text-slate-400">
            {(data?.length ?? 0)} roles × {MODULES.length} modules
            {customised > 0 && ` · ${customised} customised`}
          </span>
        </div>

        {isLoading ? (
          <TableSkeleton rows={9} columns={6} />
        ) : error ? (
          <ErrorState title="Could not load roles" description="The permission matrix is served by the API." onRetry={() => void refetch()} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/70 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 z-10 bg-slate-50/70 px-5 py-2.5 text-left">Role</th>
                  <th className="px-3 py-2.5 text-left">Tier</th>
                  <th className="px-3 py-2.5 text-center">Users</th>
                  {MODULES.map((m) => (
                    <th key={m.key} title={m.blurb} className="whitespace-nowrap px-3 py-2.5 text-center">
                      {m.label}
                    </th>
                  ))}
                  {canEdit && <th className="px-5 py-2.5 text-right">Edit</th>}
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((role) => {
                  const granted = new Set<ModuleKey>(role.modules);
                  return (
                    <tr key={role.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/60">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-5 py-3 font-medium text-slate-800">
                        {role.name}
                        {role.customised && (
                          <Badge tone="amber" className="ml-2">customised</Badge>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={tierTone[role.tier] ?? 'slate'}>{role.tier}</Badge>
                      </td>
                      <td className="px-3 py-3 text-center tabular-nums text-slate-600">{role.userCount}</td>
                      {MODULES.map((m) => {
                        const has = granted.has(m.key);
                        // A grant that differs from the shipped matrix is marked,
                        // so a deployment's own decisions stay visible.
                        const isDefault = role.defaultModules.includes(m.key);
                        return (
                          <td key={m.key} className="px-3 py-3 text-center">
                            <span
                              className={cn(
                                'font-semibold',
                                has ? (isDefault ? 'text-emerald-600' : 'text-amber-600') : 'text-slate-300',
                              )}
                              title={has !== isDefault ? (has ? 'Added for this deployment' : 'Removed for this deployment') : undefined}
                            >
                              {has ? '✓' : '–'}
                            </span>
                          </td>
                        );
                      })}
                      {canEdit && (
                        <td className="px-5 py-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!role.editable}
                            title={role.editable ? undefined : 'Super Admin holds every module by definition'}
                            onClick={() => setEditing(role)}
                          >
                            Edit
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <EditRoleDialog role={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
