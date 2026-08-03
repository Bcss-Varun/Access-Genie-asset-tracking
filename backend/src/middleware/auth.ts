import type { RequestHandler } from 'express';
import { resolveModules, type ModuleKey, type RoleId } from '@access-genie/shared';
import { User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../services/token.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Authenticate the bearer token and attach `req.auth`.
 *
 * The user is re-read on every request rather than trusted from the token
 * claims. It costs one indexed lookup and it means a suspended account or a
 * changed role takes effect immediately, instead of at the end of the access
 * token's lifetime.
 */
export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing bearer token');
  }

  const claims = verifyAccessToken(header.slice('Bearer '.length).trim());
  const user = await User.findById(claims.sub);

  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (user.status !== 'active') throw ApiError.forbidden('This account is suspended');

  req.auth = {
    user: user.toPublic(),
    roleId: user.roleId,
    modules: resolveModules(user.roleId),
  };

  next();
});

/**
 * Gate a route on a module grant. This is the enforcement point the design docs
 * insist on: the client hides nav sections as a courtesy, but a hand-crafted
 * request to a module the role does not hold is refused here.
 */
export function requireModule(...modules: ModuleKey[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(ApiError.unauthorized());

    const granted = modules.some((m) => req.auth!.modules.includes(m));
    if (!granted) {
      return next(ApiError.forbidden(`Your role does not grant access to: ${modules.join(', ')}`));
    }
    next();
  };
}

/** Gate a route on specific roles — for the few genuinely role-bound actions. */
export function requireRole(...roles: RoleId[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(ApiError.unauthorized());
    if (!roles.includes(req.auth.roleId)) {
      return next(ApiError.forbidden('This action is restricted to: ' + roles.join(', ')));
    }
    next();
  };
}
