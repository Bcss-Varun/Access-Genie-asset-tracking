import { z } from 'zod';
import { ROLE_IDS } from '@access-genie/shared';
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
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  roleId: z.enum(ROLE_IDS).optional(),
  title: z.string().trim().min(2).max(160).optional(),
  homeScopeId: z.string().trim().min(1).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
