import type { Request, Response } from 'express';
import { validatedQuery } from '../middleware/validate.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData, sendList } from '../utils/response.js';
import { ROLES, type PermissionMatrix, ModuleKey, RoleId } from '@access-genie/shared';
import * as userService from '../services/user.service.js';
import * as roleGrantService from '../services/roleGrant.service.js';
import { recordAudit } from '../services/audit.service.js';
import type { CreateUserInput, SetUserPasswordInput, UpdateUserInput } from '../validators/user.validator.js';
import type { ListQueryInput } from '../validators/common.js';

import { requireScope } from '../middleware/scope.js';

type UserQuery = ListQueryInput & { roleId?: string; status?: string };

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<UserQuery>(res);
  const { items, meta } = await userService.listUsers(query, requireScope(req).ids, req.auth?.roleId === 'super_admin');
  sendList(res, items, meta);
});

export const roles = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await roleGrantService.listRoles());
});

/** Widen or narrow what a role may reach. Signs out everyone holding it. */
export const updateRoleGrants = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as RoleId;
  const view = await roleGrantService.setRoleGrants(id, req.body.modules as ModuleKey[]);

  recordAudit(req, { action: 'role.grants', target: id, category: 'Administration', metadata: { modules: view.modules } });
  sendData(res, view);
});

/** Return a role to the shipped matrix. */
/**
 * Replace a role's action permissions.
 *
 * Separate from the module grant above because they answer different questions
 * and are edited at different moments: which screens a role can open, versus
 * what it may do once inside one.
 */
export const setRolePermissions = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as RoleId;
  if (!ROLES[id]) throw ApiError.notFound('Role');

  const matrix = await roleGrantService.setPermissions(id, (req.body as { permissions: PermissionMatrix }).permissions);
  recordAudit(req, { action: 'role.permissions', target: id, category: 'Configuration' });
  sendData(res, matrix);
});

export const resetRoleGrants = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as RoleId;
  const view = await roleGrantService.resetRoleGrants(id);

  recordAudit(req, { action: 'role.reset', target: id, category: 'Administration' });
  sendData(res, view);
});

async function assertUserAccess(req: Request, id: string) {
  const user = await userService.getUser(id);
  if (req.auth?.roleId !== 'super_admin' && (user.roleId === 'super_admin' || !requireScope(req).ids.has(user.homeScopeId))) throw ApiError.notFound('User');
}
async function assertAssignment(req: Request) {
  if (req.auth?.roleId === 'super_admin') return;
  if (req.body.homeScopeId && !requireScope(req).ids.has(req.body.homeScopeId)) throw ApiError.forbidden('Home scope is outside your estate');
  if (req.body.roleId === 'super_admin') throw ApiError.forbidden('Only a platform administrator may grant this role');
  const modules = req.body.roleId ? await roleGrantService.grantedModules(req.body.roleId) : [];
  if ([...modules, ...(req.body.extraModules ?? [])].some(m => !req.auth!.modules.includes(m))) throw ApiError.forbidden('You cannot grant modules you do not hold');
  if (req.body.roleId || req.body.extraModules) {
    const existing = req.params.id ? await userService.getUser(req.params.id as string) : undefined;
    const targetRole = req.body.roleId ?? existing?.roleId;
    const extras = req.body.extraModules ?? existing?.extraModules ?? [];
    if (targetRole) {
      for (const module of new Set([...await roleGrantService.grantedModules(targetRole), ...extras] as ModuleKey[])) {
        const [assigned, held] = await Promise.all([
          roleGrantService.grantedActions(targetRole, module, extras),
          roleGrantService.grantedActions(req.auth!.roleId, module, req.auth!.user.extraModules),
        ]);
        if (assigned.some(action => !held.includes(action))) throw ApiError.forbidden('You cannot grant actions you do not hold');
      }
    }
  }
}

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  await assertUserAccess(req, req.params.id as string);
  sendData(res, await userService.getUser(req.params.id as string));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  await assertAssignment(req);
  const user = await userService.createUser(req.body as CreateUserInput);
  recordAudit(req, { action: 'user.create', target: user.id, category: 'Administration' });
  sendData(res, user, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  const id = req.params.id as string;
  await assertUserAccess(req, id);
  await assertAssignment(req);
  const user = await userService.updateUser(id, req.body as UpdateUserInput, req.auth.user.id);

  recordAudit(req, { action: 'user.update', target: id, category: 'Administration', metadata: { fields: Object.keys(req.body ?? {}) } });
  sendData(res, user);
});

/** An administrator sets a new password for someone who has locked themselves out. */
export const setPassword = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await assertUserAccess(req, id);
  const user = await userService.setUserPassword(id, req.body as SetUserPasswordInput);

  recordAudit(req, { action: 'user.password_reset', target: id, category: 'Administration' });
  sendData(res, user);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  const id = req.params.id as string;
  await userService.deleteUser(id, req.auth.user.id);

  recordAudit(req, { action: 'user.delete', target: id, category: 'Administration' });
  res.status(204).send();
});
