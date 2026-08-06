import { z } from 'zod';

/**
 * Preferences are written from the interface on every toggle, so the schema is
 * the only thing standing between a UI bug and a document full of junk. Each
 * field is bounded, and `nullable` is meaningful: `null` clears the value,
 * while omitting the key leaves it alone.
 */
export const updatePreferencesSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'system']),
    activeFacility: z.string().trim().min(1).max(64).nullable(),
    activeScope: z.string().trim().min(1).max(64).nullable(),
    dismissed: z.array(z.string().trim().min(1).max(64)).max(50),
    // Bounded by category count and shape, but not by category *name* — the
    // screen owns that list, and pinning it here would mean a schema change
    // every time a notification type is added.
    notifications: z.record(
      z.string().trim().min(1).max(40),
      z.object({ email: z.boolean(), push: z.boolean(), inApp: z.boolean() }),
    ),
    digest: z.string().trim().min(1).max(40),
    // Opaque widget ids, bounded in count and length but not enumerated: which
    // widgets exist is the client's business, and pinning the list here would
    // mean a backend deploy every time one is added. `null` resets the user to
    // their role's default layout.
    dashboard: z
      .object({
        kpis: z.array(z.string().trim().min(1).max(40)).max(8),
        main: z.array(z.string().trim().min(1).max(40)).max(20),
        rail: z.array(z.string().trim().min(1).max(40)).max(20),
      })
      .nullable(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Provide at least one preference to update' });

export const savedViewSchema = z.object({
  name: z.string().trim().min(1).max(80),
  search: z.string().trim().max(120).default(''),
  status: z.string().trim().min(1).max(40).default('All'),
  category: z.string().trim().min(1).max(60).default('All'),
  lens: z.string().trim().min(1).max(40).default('all'),
});

export const renameViewSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type SavedViewInput = z.infer<typeof savedViewSchema>;
