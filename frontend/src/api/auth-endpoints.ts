import type { AuthPayload, Persona, Session, UserSession } from '@access-genie/shared';
import { apiGet, apiPost } from '@/api/client';

export const authApi = {
  login: (email: string, password: string) => apiPost<AuthPayload>('/auth/login', { email, password }),

  /** Exchanges the httpOnly refresh cookie for a fresh access token. */
  refresh: () => apiPost<AuthPayload>('/auth/refresh'),

  logout: () => apiPost<{ loggedOut: boolean }>('/auth/logout'),

  me: () => apiGet<Session>('/auth/me'),

  /** Demo affordance: the seeded accounts, for the login screen's quick-pick. */
  personas: () => apiGet<Persona[]>('/auth/personas'),

  /** Devices currently signed in as this user. */
  sessions: () => apiGet<UserSession[]>('/auth/sessions'),
  revokeSession: (id: string) => apiPost<{ revoked: boolean }>(`/auth/sessions/${id}/revoke`),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiPost<{ changed: boolean }>('/auth/change-password', { currentPassword, newPassword }),
};
