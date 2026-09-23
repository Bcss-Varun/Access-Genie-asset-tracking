import type { RequestHandler } from 'express';
import type { ModuleKey, RoleId, PermissionAction } from '@access-genie/shared';
import { User, RefreshToken } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../services/token.service.js';
import { grantedActions, grantedModules } from '../services/roleGrant.service.js';
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
  const live = await RefreshToken.exists({ _id: claims.sid, userId: user._id, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
  if (!live) throw ApiError.unauthorized('Session has ended');
  if (user.status !== 'active') throw ApiError.forbidden('This account is suspended');

  // Effective grants: the role's own (possibly customised) modules, unioned
  // with whatever has been granted to this user specifically. A per-user grant
  // only ever adds — there is no per-user revocation of something the role
  // already grants, so this is a plain set union, not a resolution the way the
  // role's own grant is.
  const roleModules = await grantedModules(user.roleId);
  const candidates = Array.from(new Set([...roleModules, ...user.extraModules]));
  const visible = await Promise.all(candidates.map(async module =>
    (await grantedActions(user.roleId, module, user.extraModules)).includes('view') ? module : null));
  const modules = visible.filter((module): module is ModuleKey => module !== null);

  req.auth = {
    user: user.toPublic(),
    roleId: user.roleId,
    modules,
  };

  next();
});

/**
 * Gate a route on a module grant. This is the enforcement point the design docs
 * insist on: the client hides nav sections as a courtesy, but a hand-crafted
 * request to a module the role does not hold is refused here.
 */
export function requireModule(...modules: ModuleKey[]): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    if (!req.auth) throw ApiError.unauthorized();
    const action: PermissionAction = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? 'view'
      : req.method === 'DELETE' ? 'delete'
      : req.method === 'POST' && /\/(preview|validate)\/?$/i.test(req.path) ? 'view'
      : ['PATCH', 'PUT'].includes(req.method) ? 'edit'
      : /\/(approve|reject|decide)\/?$/i.test(req.path) ? 'approve'
      : /\/(status|toggle|action|dismiss|assign|complete|cancel|start|acknowledge|close|resolve|bulk)\/?$/i.test(req.path) ? 'edit'
      : 'create';
    const permissions = await Promise.all(modules.map(m => grantedActions(req.auth!.roleId, m, req.auth!.user.extraModules)));
    if (!permissions.some(actions => actions.includes(action))) {
      throw ApiError.forbidden(`Your role may not ${action} in: ${modules.join(', ')}`);
    }
    next();
  });
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

/**
 * Gate a route on a specific action inside a module.
 *
 * `requireModule` asks whether the caller may enter Assets at all;
 * this asks whether they may delete one. Routes that mutate should use this,
 * because a module-only gate means everyone who can open a screen can do
 * everything on it — and hiding the button in the client is not a control, it
 * is a suggestion.
 *
 * Resolved per request from `roleGrant.service`, so a permission change takes
 * effect on the caller's next call rather than on their next sign-in.
 */
export function requirePermission(module: ModuleKey, action: PermissionAction): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(ApiError.unauthorized());

    grantedActions(req.auth.roleId, module, req.auth.user.extraModules)
      .then((actions) => {
        if (!actions.includes(action)) {
          return next(
            ApiError.forbidden(`Your role may not ${action} in ${module}.`),
          );
        }
        next();
      })
      .catch(next);
  };
}
