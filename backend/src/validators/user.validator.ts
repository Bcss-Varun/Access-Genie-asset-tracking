import { z } from 'zod';
import { MODULE_KEYS, ROLE_IDS } from '@access-genie/shared';
import { csvString, listQuerySchema } from './common.js';

export const userListQuerySchema = listQuerySchema.extend({
  roleId: csvString,
  status: csvString,
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().trim().toLowerCase(),
  password: z
    .string()
    .min(10, 'Use at least 10 characters')
    .max(200)
    .regex(/[a-z]/, 'Include a lowercase letter')
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/\d/, 'Include a number'),
  roleId: z.enum(ROLE_IDS),
  title: z.string().trim().min(2).max(160),
  homeScopeId: z.string().trim().min(1).default('ORG-1'),
  /** Derived from the name when omitted. */
  initials: z.string().trim().min(1).max(3).optional(),
  /** Beyond the role's own grants — see `User.extraModules`. */
  extraModules: z.array(z.enum(MODULE_KEYS)).max(MODULE_KEYS.length).default([]),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  roleId: z.enum(ROLE_IDS).optional(),
  title: z.string().trim().min(2).max(160).optional(),
  homeScopeId: z.string().trim().min(1).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  extraModules: z.array(z.enum(MODULE_KEYS)).max(MODULE_KEYS.length).optional(),
});

/** Same policy as `createUserSchema.password` — an administrator setting it on someone's behalf still has to meet it. */
export const setUserPasswordSchema = z.object({
  password: z
    .string()
    .min(10, 'Use at least 10 characters')
    .max(200)
    .regex(/[a-z]/, 'Include a lowercase letter')
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/\d/, 'Include a number'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type SetUserPasswordInput = z.infer<typeof setUserPasswordSchema>;

/**
 * A role's module grants.
 *
 * At least one module: a role granting none cannot reach any screen, including
 * the administration screen that would put it back.
 */
export const roleGrantsSchema = z.object({
  modules: z.array(z.enum(MODULE_KEYS)).min(1).max(MODULE_KEYS.length),
});

export type RoleGrantsInput = z.infer<typeof roleGrantsSchema>;

