import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLES, type RoleId } from '@access-genie/shared';
import { Avatar, Badge, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { formatDate, relTime } from '@/lib/format';
import { useSession } from '@/features/auth/AuthProvider';
import { adminApi } from './admin-api';

export function UsersPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: () => adminApi.users({ limit: 100, sort: 'name' }),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) => adminApi.updateUser(id, input),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => setActionError(err instanceof ApiRequestError ? err.message : 'Update failed.'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Roles"
        subtitle="Who can enter which modules. Changes take effect immediately — sessions are revoked on a role change."
        actions={
          <Button size="sm" onClick={() => setCreating((open) => !open)}>
            {creating ? 'Close' : '➕ Add user'}
          </Button>
        }
      />

      {creating && <CreateUserForm onDone={() => setCreating(false)} />}

      {actionError && (
        <p role="alert" className="text-sm text-health-critical bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {actionError}
        </p>
      )}

      {error ? (
        <ErrorState
          title="Could not load users"
          description={error instanceof ApiRequestError ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : isPending ? (
        <TableSkeleton rows={6} columns={5} />
      ) : data.items.length === 0 ? (
        <div className="glass-panel">
          <EmptyState icon="👥" title="No users yet" />
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60">
                  {['User', 'Role', 'Modules', 'Status', 'Last sign-in', ''].map((heading, i) => (
                    <th key={i} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((user) => {
                  const role = ROLES[user.roleId];
                  const moduleCount = role.modules === '*' ? 'All' : role.modules.length;
                  const isSelf = user.id === session.user.id;

                  return (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 min-w-[220px]">
                          <Avatar initials={user.initials} />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 truncate">
                              {user.name}
                              {isSelf && <span className="ml-1.5 text-[10px] text-slate-400">(you)</span>}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {/* Self-service role changes are blocked server-side; the
                            control is disabled rather than failing on submit. */}
                        <select
                          value={user.roleId}
                          disabled={isSelf || update.isPending}
                          onChange={(e) => update.mutate({ id: user.id, input: { roleId: e.target.value as RoleId } })}
                          aria-label={`Role for ${user.name}`}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-700 outline-none focus:border-primary-500 disabled:opacity-60"
                        >
                          {Object.values(ROLES).map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] text-slate-400 mt-1">{role.tier}</p>
                      </td>

                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{moduleCount}</td>

                      <td className="px-4 py-3">
                        <Badge tone={user.status === 'active' ? 'emerald' : 'slate'}>{user.status}</Badge>
                      </td>

                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {user.lastLoginAt ? relTime(user.lastLoginAt) : 'Never'}
                        <span className="block text-[11px] text-slate-400">joined {formatDate(user.createdAt)}</span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isSelf || update.isPending}
                          onClick={() =>
                            update.mutate({ id: user.id, input: { status: user.status === 'active' ? 'suspended' : 'active' } })
                          }
                        >
                          {user.status === 'active' ? 'Suspend' : 'Reinstate'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '', roleId: 'technician' as RoleId, title: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: adminApi.createUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      onDone();
    },
    onError: (err) => {
      if (err instanceof ApiRequestError) {
        setFieldErrors(err.fieldErrors);
        setFormError(Object.keys(err.fieldErrors).length ? 'Check the highlighted fields.' : err.message);
      } else {
        setFormError('Could not create the user.');
      }
    },
  });

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setFieldErrors({});
        setFormError(null);
        create.mutate({ ...form, homeScopeId: 'ORG-1' });
      }}
      className="glass-panel p-5 grid gap-4 sm:grid-cols-2"
      noValidate
    >
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
        {fieldErrors.name && <p className="text-[11px] text-health-critical mt-1">{fieldErrors.name}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Work email</label>
        <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
        {fieldErrors.email && <p className="text-[11px] text-health-critical mt-1">{fieldErrors.email}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Temporary password</label>
        <input type="text" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} />
        <p className="text-[11px] text-slate-400 mt-1">10+ characters, with upper, lower and a digit.</p>
        {fieldErrors.password && <p className="text-[11px] text-health-critical mt-1">{fieldErrors.password}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
        <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value as RoleId })} className={inputClass}>
          {Object.values(ROLES).map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Job title</label>
        <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} placeholder="Field Technician — Hyderabad" />
        {fieldErrors.title && <p className="text-[11px] text-health-critical mt-1">{fieldErrors.title}</p>}
      </div>

      {formError && (
        <p role="alert" className="sm:col-span-2 text-sm text-health-critical bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {formError}
        </p>
      )}

      <div className="sm:col-span-2 flex items-center gap-2">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create user'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
