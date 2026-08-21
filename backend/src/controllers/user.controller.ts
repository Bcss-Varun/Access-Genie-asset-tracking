import type { Request, Response } from 'express';
import { validatedQuery } from '../middleware/validate.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData, sendList } from '../utils/response.js';
import { ROLES, type PermissionMatrix, ModuleKey, RoleId } from '@access-genie/shared';
import * as userService from '../services/user.service.js';
import * as roleGrantService from '../services/roleGrant.service.js';
import { recordAudit } from '../services/audit.service.js';
import type { CreateUserInput, UpdateUserInput } from '../validators/user.validator.js';
import type { ListQueryInput } from '../validators/common.js';

type UserQuery = ListQueryInput & { roleId?: string; status?: string };

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const query = validatedQuery<UserQuery>(res);
  const { items, meta } = await userService.listUsers(query);
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

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await userService.getUser(req.params.id as string));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.createUser(req.body as CreateUserInput);
  recordAudit(req, { action: 'user.create', target: user.id, category: 'Administration' });
  sendData(res, user, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  const id = req.params.id as string;
  const user = await userService.updateUser(id, req.body as UpdateUserInput, req.auth.user.id);

  recordAudit(req, { action: 'user.update', target: id, category: 'Administration', metadata: { fields: Object.keys(req.body ?? {}) } });
  sendData(res, user);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();

  const id = req.params.id as string;
  await userService.deleteUser(id, req.auth.user.id);

  recordAudit(req, { action: 'user.delete', target: id, category: 'Administration' });
  res.status(204).send();
});
