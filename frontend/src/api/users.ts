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

/** Roles as the API returns them — `'*'` expanded to the literal `'all'`. */
export type RoleSummary = Omit<Role, 'modules'> & { modules: ModuleKey[] | 'all' };

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
  roles: () => apiGet<RoleSummary[]>('/users/roles'),

  createUser: (input: CreateUserInput) => apiPost<PublicUser>('/users', input),
  updateUser: (id: string, input: Record<string, unknown>) => apiPatch<PublicUser>(`/users/${id}`, input),
  removeUser: (id: string) => apiDelete(`/users/${id}`),
};
