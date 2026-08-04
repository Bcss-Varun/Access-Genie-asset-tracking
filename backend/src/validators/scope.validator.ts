import { z } from 'zod';

/**
 * The scope hierarchy is configuration, and its names are read by people
 * choosing where an asset lives — so they are trimmed and bounded rather than
 * accepted raw.
 */
export const SCOPE_LEVELS = ['org', 'region', 'facility', 'building', 'floor', 'zone'] as const;

export const createScopeSchema = z.object({
  name: z.string().trim().min(2, 'Give it a name of at least 2 characters').max(80),
  level: z.enum(SCOPE_LEVELS),
  /**
   * Optional only because the org root has no parent. Every other level is
   * checked against its permitted parents in the service, which is where the
   * parent's own level can actually be looked up.
   */
  parentId: z.string().trim().min(1).optional(),
});

export const updateScopeSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
});

export type CreateScopeInput = z.infer<typeof createScopeSchema>;
export type UpdateScopeInput = z.infer<typeof updateScopeSchema>;
