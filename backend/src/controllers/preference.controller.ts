import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { sendData } from '../utils/response.js';
import * as preferences from '../services/preference.service.js';
import type { SavedViewInput, UpdatePreferencesInput } from '../validators/preference.validator.js';

/**
 * Preferences always belong to the caller. There is no `:userId` on any of
 * these routes and no way to address someone else's document — the id comes
 * from the verified session, so the authorization question never arises.
 */
function requireUserId(req: Request): string {
  if (!req.auth) throw ApiError.unauthorized();
  return req.auth.user.id;
}

export const get = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await preferences.getPreferences(requireUserId(req)));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const patch = req.body as UpdatePreferencesInput;
  sendData(res, await preferences.updatePreferences(requireUserId(req), patch));
});

export const createView = asyncHandler(async (req: Request, res: Response) => {
  const view = req.body as SavedViewInput;
  sendData(res, await preferences.saveView(requireUserId(req), view), 201);
});

export const renameView = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body as { name: string };
  sendData(res, await preferences.renameView(requireUserId(req), req.params.id as string, name));
});

export const removeView = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await preferences.removeView(requireUserId(req), req.params.id as string));
});
