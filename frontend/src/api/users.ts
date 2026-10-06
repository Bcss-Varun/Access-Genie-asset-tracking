import { useQuery } from '@tanstack/react-query';
import type { ModuleKey, PermissionMatrix, PublicUser, Role, RoleId } from '@access-genie/shared';
import { apiDelete, apiGet, apiList, apiPatch, apiPost } from '@/api/client';

export interface UserFilters {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  roleId?: string;
  status?: string;
}

/**
 * A role with its *effective* grants — the shipped matrix plus any override an
 * administrator has applied to this deployment.
 */
export interface RoleView {
  id: RoleId;
  name: string;
  tier: Role['tier'];
  modules: ModuleKey[];
  /** Whether the grants differ from what shipped. */
  customised: boolean;
  defaultModules: ModuleKey[];
  /** False for Super Admin, which holds everything by definition. */
  editable: boolean;
  userCount: number;
  /** Effective action grants enforced by the API for each module. */
  permissions: PermissionMatrix;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  roleId: RoleId;
  title: string;
  homeScopeId?: string;
  /** Beyond the role's own grants. */
  extraModules?: ModuleKey[];
}

export const adminApi = {
  users: (filters: UserFilters = {}) => apiList<PublicUser>('/users', filters as Record<string, unknown>),
  user: (id: string) => apiGet<PublicUser>(`/users/${id}`),
  roles: () => apiGet<RoleView[]>('/users/roles'),

  /** Widening or narrowing a role signs out everyone who holds it. */
  setRoleGrants: (id: RoleId, modules: ModuleKey[]) => apiPatch<RoleView>(`/users/roles/${id}`, { modules }),
  setRolePermissions: (id: RoleId, permissions: PermissionMatrix) =>
    apiPatch<PermissionMatrix>(`/users/roles/${id}/permissions`, { permissions }),
  resetRoleGrants: (id: RoleId) => apiPost<RoleView>(`/users/roles/${id}/reset`),

  createUser: (input: CreateUserInput) => apiPost<PublicUser>('/users', input),
  updateUser: (id: string, input: Record<string, unknown>) => apiPatch<PublicUser>(`/users/${id}`, input),
  /** Admin-on-behalf-of-user reset — the "they forgot it" path. Ends every session they have open. */
  setPassword: (id: string, password: string) => apiPatch<PublicUser>(`/users/${id}/password`, { password }),
  removeUser: (id: string) => apiDelete(`/users/${id}`),
};

/**
 * The administrator's view of the people directory — suspended accounts included.
 *
 * The dataset's directory (`allUsers`) is the *active* people only, because it
 * feeds the custodian and assignee pickers, where a suspended account must not
 * be offered. The admin screens read it too, so suspending somebody made them
 * vanish from Users & Roles — and the "Suspended" filter could never match,
 * leaving no way back to reactivate them. Every write re-reads this query (see
 * `refreshAfterWrite`), so an invite or a role change shows on the next render.
 *
 * `null` until the first response, so callers can fall back to `allUsers`.
 */
export function useUserDirectory(): PublicUser[] | null {
  const { data } = useQuery({
    queryKey: ['admin', 'users', 'directory'],
    queryFn: () => adminApi.users({ limit: 200, sort: 'name' }),
    staleTime: 30_000,
  });
  return data?.items ?? null;
}

/** One account, whatever its status — see {@link useUserDirectory}. */
export function useUserRecord(id: string): { user: PublicUser | undefined; isPending: boolean } {
  const { data, isPending } = useQuery({
    queryKey: ['admin', 'users', 'one', id],
    queryFn: () => adminApi.user(id),
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: false,
  });
  return { user: data, isPending };
}
