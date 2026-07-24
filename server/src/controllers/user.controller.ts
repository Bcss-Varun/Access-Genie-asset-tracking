import type { Request, Response } from 'express';
import { validatedQuery } from '../middleware/validate.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData, sendList } from '../utils/response.js';
import * as userService from '../services/user.service.js';
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
  sendData(res, userService.listRoles());
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
