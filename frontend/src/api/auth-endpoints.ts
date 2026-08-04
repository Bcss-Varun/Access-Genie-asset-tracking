import type { AuthPayload, Persona, Session, UserSession } from '@access-genie/shared';
import { apiGet, apiPost } from '@/api/client';

/**
 * What `/auth/login` returns when the account has a second factor.
 *
 * A correct password is not a session in that case — it is a challenge, and the
 * caller has to exchange it for one.
 */
export interface MfaChallenge {
  mfaRequired: true;
  challengeToken: string;
}

export type LoginResult = AuthPayload | MfaChallenge;

export const isMfaChallenge = (result: LoginResult): result is MfaChallenge =>
  (result as MfaChallenge).mfaRequired === true;

export interface MfaSetup {
  secret: string;
  otpauthUri: string;
}

export const authApi = {
  login: (email: string, password: string) => apiPost<LoginResult>('/auth/login', { email, password }),

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

  // ── Multi-factor ───────────────────────────────────────────────────────────
  /** Completes a sign-in that stopped at the second factor. */
  verifyMfa: (challengeToken: string, code: string) =>
    apiPost<AuthPayload>('/auth/mfa/verify', { challengeToken, code }),

  mfaStatus: () => apiGet<{ mfaEnabled: boolean; recoveryCodesRemaining: number }>('/auth/mfa'),

  /** Mints a secret. Does not enable anything until a code is verified. */
  beginMfaSetup: () => apiPost<MfaSetup>('/auth/mfa/setup'),
  enableMfa: (code: string) => apiPost<{ recoveryCodes: string[] }>('/auth/mfa/enable', { code }),
  disableMfa: (password: string) => apiPost<{ mfaEnabled: false }>('/auth/mfa/disable', { password }),
  regenerateRecoveryCodes: (password: string) =>
    apiPost<{ recoveryCodes: string[] }>('/auth/mfa/recovery-codes', { password }),
};
