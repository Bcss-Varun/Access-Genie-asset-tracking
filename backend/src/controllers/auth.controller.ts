import type { CookieOptions, Request, Response } from 'express';
import { ROLES, resolveModules } from '@access-genie/shared';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import * as authService from '../services/auth.service.js';
import { revokeAllForUser, revokeRefreshToken } from '../services/token.service.js';
import { recordAudit } from '../services/audit.service.js';

const REFRESH_COOKIE = 'ag_refresh';

/**
 * The refresh cookie is httpOnly (script cannot read it), sameSite=lax (not
 * sent on cross-site requests, which blunts CSRF), and scoped to the refresh
 * path so it is not attached to every ordinary API call.
 */
function refreshCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'strict' : 'lax',
    path: '/api/v1/auth',
    expires: expiresAt,
  };
}

function clientContext(req: Request) {
  return { userAgent: req.get('user-agent'), ip: req.ip };
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  const { auth, refreshToken, refreshExpiresAt } = await authService.login(email, password, clientContext(req));

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(refreshExpiresAt));
  recordAudit(req, { action: 'auth.login', target: auth.user.id, category: 'Authentication' });
  sendData(res, auth);
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

  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  sendData(res, { loggedOut: true });
});

export const logoutEverywhere = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  const revoked = await revokeAllForUser(req.auth.user.id);
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  recordAudit(req, { action: 'auth.logout_all', target: req.auth.user.id, category: 'Authentication' });
  sendData(res, { revokedSessions: revoked });
});

/** The session bootstrap the client calls on every page load. */
export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  sendData(res, {
    user: req.auth.user,
    role: ROLES[req.auth.roleId],
    modules: resolveModules(req.auth.roleId),
  });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  await authService.changePassword(req.auth.user.id, currentPassword, newPassword);

  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  recordAudit(req, { action: 'auth.password_change', target: req.auth.user.id, category: 'Authentication' });
  sendData(res, { changed: true });
});

/** Demo affordance: which accounts exist to log in as. */
export const personas = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await authService.listPersonas());
});
