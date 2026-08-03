import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const failure = (code: string, message: string) => ({
  success: false as const,
  error: { code, message },
});

/** Baseline limit for the whole API surface. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.isProd ? 300 : 10_000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: failure('RATE_LIMITED', 'Too many requests — slow down and try again shortly.'),
});

/**
 * Login and refresh get their own much tighter budget, keyed by IP. Credential
 * stuffing is a volume game; the general API limit is far too generous to blunt
 * it.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.isProd ? 10 : 100,
  skipSuccessfulRequests: true, // only failed attempts count toward the budget
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: failure('RATE_LIMITED', 'Too many authentication attempts. Try again in a few minutes.'),
});
