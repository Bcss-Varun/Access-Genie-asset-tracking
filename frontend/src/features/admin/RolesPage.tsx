import { useQuery } from '@tanstack/react-query';
import { MODULE_KEYS } from '@access-genie/shared';
import { Badge, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { ApiRequestError } from '@/lib/api-client';
import { cn } from '@/lib/format';
import { adminApi } from './admin-api';

/**
 * The role/module matrix, read from the API rather than restated in the client.
 * What this grid shows is exactly what `requireModule` enforces on every request.
 */
export function RolesPage() {
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['roles'], queryFn: adminApi.roles });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Permissions"
        subtitle="Module grants per role — enforced at the API, not by hiding menu items."
        breadcrumb={[{ label: 'Administration' }, { label: 'Roles' }]}
      />

      {error ? (
        <ErrorState title="Could not load roles" description={error instanceof ApiRequestError ? error.message : undefined} onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton className="h-80" />
      ) : (
        <div className="glass-panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 sticky left-0 bg-slate-50/95">
                  Role
                </th>
                {MODULE_KEYS.map((module) => (
                  <th key={module} className="px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                    {module}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((role) => {
                const granted = role.modules === 'all' ? MODULE_KEYS : role.modules;
                return (
                  <tr key={role.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 sticky left-0 bg-white">
                      <span className="block font-medium text-slate-800 whitespace-nowrap">{role.name}</span>
                      <Badge tone="slate" className="mt-1">
                        {role.tier}
                      </Badge>
                    </td>
                    {MODULE_KEYS.map((module) => {
                      const has = granted.includes(module);
                      return (
                        <td key={module} className="px-2 py-3 text-center">
                          <span
                            className={cn('inline-block h-2 w-2 rounded-full', has ? 'bg-health-good' : 'bg-slate-200')}
                            title={`${role.name} ${has ? 'can' : 'cannot'} access ${module}`}
                          />
                          <span className="sr-only">{has ? 'granted' : 'not granted'}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        A filled dot is a granted module. Requests to a module a role does not hold are refused with 403 regardless of what
        the client displays.
      </p>
    </div>
  );
}
