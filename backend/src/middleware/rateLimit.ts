import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { MongoRateLimitStore } from './mongoRateLimitStore.js';

const failure = (code: string, message: string) => ({
  success: false as const,
  error: { code, message },
});

/**
 * Both limiters count in MongoDB rather than in process memory.
 *
 * The counters are the last piece of request state that used to live on the
 * instance, and the one where that was actually dangerous: an in-memory budget
 * is per-instance and per-restart, so a two-instance deploy silently doubles
 * the ceiling and every deploy resets it. See mongoRateLimitStore.ts.
 */

/** Baseline limit for the whole API surface. Window and ceiling are env-driven. */
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.rateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new MongoRateLimitStore('api'),
  message: failure('RATE_LIMITED', 'Too many requests — slow down and try again shortly.'),
});

/**
 * Login and refresh get their own much tighter budget, keyed by IP. Credential
 * stuffing is a volume game; the general API limit is far too generous to blunt
 * it.
 */
export const authLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.authRateLimitMax,
  skipSuccessfulRequests: true, // only failed attempts count toward the budget
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new MongoRateLimitStore('auth'),
  message: failure('RATE_LIMITED', 'Too many authentication attempts. Try again in a few minutes.'),
});
