import type { ModuleKey, PublicUser, Role, RoleId } from '@access-genie/shared';
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
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  roleId: RoleId;
  title: string;
  homeScopeId?: string;
}

export const adminApi = {
  users: (filters: UserFilters = {}) => apiList<PublicUser>('/users', filters as Record<string, unknown>),
  user: (id: string) => apiGet<PublicUser>(`/users/${id}`),
  roles: () => apiGet<RoleView[]>('/users/roles'),

  /** Widening or narrowing a role signs out everyone who holds it. */
  setRoleGrants: (id: RoleId, modules: ModuleKey[]) => apiPatch<RoleView>(`/users/roles/${id}`, { modules }),
  resetRoleGrants: (id: RoleId) => apiPost<RoleView>(`/users/roles/${id}/reset`),

  createUser: (input: CreateUserInput) => apiPost<PublicUser>('/users', input),
  updateUser: (id: string, input: Record<string, unknown>) => apiPatch<PublicUser>(`/users/${id}`, input),
  removeUser: (id: string) => apiDelete(`/users/${id}`),
};
