import type { CookieOptions, Request, Response } from 'express';
import { ROLES } from '@access-genie/shared';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import * as authService from '../services/auth.service.js';
import { listSessions, revokeAllForUser, revokeRefreshToken, revokeSession } from '../services/token.service.js';
import { updateOwnProfile } from '../services/user.service.js';
import { recordAudit } from '../services/audit.service.js';

const REFRESH_COOKIE = env.COOKIE_NAME;

/**
 * The refresh cookie is httpOnly (script cannot read it), sameSite-restricted
 * (not sent on cross-site requests, which blunts CSRF), and scoped to the auth
 * path so it is not attached to every ordinary API call.
 *
 * Every one of those knobs is env-driven, because the right value depends on
 * how the app is served: same-origin behind a proxy, or a client on a different
 * host entirely.
 */
function refreshCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    path: env.cookiePath,
    expires: expiresAt,
  };
}

/** Clearing must match the attributes the cookie was set with, or it lingers. */
const clearOptions: CookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: env.cookieSameSite,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  path: env.cookiePath,
};

function clientContext(req: Request) {
  return { userAgent: req.get('user-agent'), ip: req.ip };
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  const result = await authService.login(email, password, clientContext(req));

  // A correct password against an MFA-protected account is a challenge, not a
  // session: no cookie is set and nothing is audited as a sign-in yet.
  if (result.mfaRequired) {
    sendData(res, { mfaRequired: true, challengeToken: result.challengeToken });
    return;
  }

  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions(result.refreshExpiresAt));
  recordAudit(req, { action: 'auth.login', target: result.auth.user.id, category: 'Authentication' });
  sendData(res, result.auth);
});

// ── Multi-factor ─────────────────────────────────────────────────────────────
export const verifyMfa = asyncHandler(async (req: Request, res: Response) => {
  const { challengeToken, code } = req.body as { challengeToken: string; code: string };
  const { auth, refreshToken, refreshExpiresAt } = await authService.verifyMfa(challengeToken, code, clientContext(req));

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(refreshExpiresAt));
  recordAudit(req, { action: 'auth.login_mfa', target: auth.user.id, category: 'Authentication' });
  sendData(res, auth);
});

export const beginMfaSetup = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  sendData(res, await authService.beginMfaSetup(req.auth.user.id));
});

export const completeMfaSetup = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  const result = await authService.completeMfaSetup(req.auth.user.id, (req.body as { code: string }).code);
  recordAudit(req, { action: 'auth.mfa_enabled', target: req.auth.user.id, category: 'Security' });
  sendData(res, result);
});

export const disableMfa = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  await authService.disableMfa(req.auth.user.id, (req.body as { password: string }).password);
  recordAudit(req, { action: 'auth.mfa_disabled', target: req.auth.user.id, category: 'Security' });
  sendData(res, { mfaEnabled: false });
});

export const regenerateRecoveryCodes = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  const codes = await authService.regenerateRecoveryCodes(req.auth.user.id, (req.body as { password: string }).password);
  recordAudit(req, { action: 'auth.recovery_codes', target: req.auth.user.id, category: 'Security' });
  sendData(res, { recoveryCodes: codes });
});

/** How many unused recovery codes are left — the Security screen's counter. */
export const mfaStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  sendData(res, {
    mfaEnabled: req.auth.user.mfaEnabled ?? false,
    recoveryCodesRemaining: await authService.remainingRecoveryCodes(req.auth.user.id),
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('No refresh token present');

  const { auth, refreshToken, refreshExpiresAt } = await authService.refresh(token, clientContext(req));

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(refreshExpiresAt));
  sendData(res, auth);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  if (token) await revokeRefreshToken(token);

  res.clearCookie(REFRESH_COOKIE, clearOptions);
  sendData(res, { loggedOut: true });
});

export const logoutEverywhere = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  const revoked = await revokeAllForUser(req.auth.user.id);
  res.clearCookie(REFRESH_COOKIE, clearOptions);
  recordAudit(req, { action: 'auth.logout_all', target: req.auth.user.id, category: 'Authentication' });
  sendData(res, { revokedSessions: revoked });
});

/** The session bootstrap the client calls on every page load. */
export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  sendData(res, {
    user: req.auth.user,
    role: ROLES[req.auth.roleId],
    // Already resolved by requireAuth — reusing it keeps this identical to
    // what the gate will actually enforce on the next request.
    modules: req.auth.modules,
  });
});

/** Update your own profile. Scoped to the session, never to an id in the path. */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  const user = await updateOwnProfile(req.auth.user.id, req.body);
  recordAudit(req, { action: 'profile.update', target: user.id, category: 'Configuration' });

  sendData(res, { user, role: ROLES[req.auth.roleId], modules: req.auth.modules });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  await authService.changePassword(req.auth.user.id, currentPassword, newPassword);

  res.clearCookie(REFRESH_COOKIE, clearOptions);
  recordAudit(req, { action: 'auth.password_change', target: req.auth.user.id, category: 'Authentication' });
  sendData(res, { changed: true });
});

/** Demo affordance: which accounts exist to log in as. */
export const personas = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await authService.listPersonas());
});

/** Every device currently signed in as this user. */
export const sessions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  sendData(res, await listSessions(req.auth.user.id, token));
});

/** Sign one other device out. */
export const revokeOneSession = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  const id = req.params.id as string;

  const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  const live = await listSessions(req.auth.user.id, token);
  const target = live.find((s) => s.id === id);

  if (!target) throw ApiError.notFound('Session');
  // Ending your own session from a device list is "log out", and it belongs on
  // the button that says so — not hidden in a row that looks like the others.
  if (target.current) throw ApiError.badRequest('Use Sign out to end the session you are using.');

  await revokeSession(req.auth.user.id, id);
  recordAudit(req, { action: 'auth.session_revoke', target: id, category: 'Authentication' });
  sendData(res, { revoked: true });
});
