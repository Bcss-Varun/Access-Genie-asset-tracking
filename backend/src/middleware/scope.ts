import type { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { resolveVisibleScope, type VisibleScope } from '../services/tenancy.service.js';

/**
 * Attach the caller's visible estate to the request.
 *
 * Mounted once, immediately after `requireAuth`, so every authenticated route
 * has `req.scope` by construction. A service that forgets to filter is then a
 * bug that a reviewer can see — rather than the previous situation, where a
 * service had no way to know what the caller was entitled to and so filtered
 * nothing.
 *
 * `?scope=` is read here rather than in each controller, which means the
 * "is this node inside your estate" check happens once and cannot be skipped by
 * an endpoint that reads the parameter itself.
 */
export const attachScope: RequestHandler = asyncHandler(async (req, _res, next) => {
  if (!req.auth) return next(ApiError.unauthorized());

  const requested = typeof req.query.scope === 'string' && req.query.scope ? req.query.scope : undefined;

  req.scope = await resolveVisibleScope(
    { roleId: req.auth.roleId, homeScopeId: req.auth.user.homeScopeId },
    requested,
  );

  next();
});

/**
 * Read the resolved estate, or fail loudly.
 *
 * Throws rather than falling back to "everything": a silent fallback is how a
 * route that lost its middleware turns into a data leak that nothing detects.
 */
export function requireScope(req: { scope?: VisibleScope }): VisibleScope {
  if (!req.scope) throw ApiError.internal('Route is missing its scope middleware');
  return req.scope;
}
