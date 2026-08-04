import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('Enter a valid email address').trim().toLowerCase(),
  // Length only — complexity rules belong at registration, and rejecting a
  // login for "weak password" leaks that the account exists.
  password: z.string().min(1, 'Password is required').max(200),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(10, 'Use at least 10 characters')
      .max(200)
      .regex(/[a-z]/, 'Include a lowercase letter')
      .regex(/[A-Z]/, 'Include an uppercase letter')
      .regex(/\d/, 'Include a number'),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'The new password must differ from the current one',
    path: ['newPassword'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * What a person may change about themselves.
 *
 * Deliberately narrow: name, title and contact details. Email identifies the
 * account and role decides what it can do, so neither is editable here — those
 * go through an administrator, which is what the profile screen already says.
 */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    title: z.string().trim().min(2).max(160),
    phone: z.string().trim().max(40),
    timezone: z.string().trim().max(60),
  })
  .partial();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ── Multi-factor ─────────────────────────────────────────────────────────────
/** Six digits, or a recovery code in the `XXXXX-XXXXX` shape. */
const mfaCode = z.string().trim().min(6).max(16);

export const verifyMfaSchema = z.object({
  challengeToken: z.string().trim().min(10).max(200),
  code: mfaCode,
});

export const mfaCodeSchema = z.object({ code: mfaCode });

/** Turning MFA off, or reissuing recovery codes, re-proves the password first. */
export const mfaPasswordSchema = z.object({ password: z.string().min(1).max(200) });

