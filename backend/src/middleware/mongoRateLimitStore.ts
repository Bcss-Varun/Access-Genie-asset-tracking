import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit';
import { RateLimitHit } from '../models/RateLimitHit.js';
import { logger } from '../config/logger.js';

/**
 * An `express-rate-limit` store backed by MongoDB.
 *
 * The library's default store is a Map on the process. Behind a load balancer
 * that means each instance enforces the limit independently — the real ceiling
 * becomes `max × instances` — and every deploy or restart hands out a fresh
 * budget. For the auth limiter, which is the thing standing between `/login`
 * and credential stuffing, neither is acceptable.
 *
 * Counting in the database makes the limit global and durable. It costs one
 * upsert per request, which on the auth routes is trivially cheap next to a
 * bcrypt compare, and on the general limiter is still one small indexed write.
 */

/** Fixed windows: `now / windowMs`, so every instance agrees on the boundary. */
function windowStart(windowMs: number): number {
  return Math.floor(Date.now() / windowMs) * windowMs;
}

export class MongoRateLimitStore implements Store {
  /** Set by `init` from the middleware's own options — never duplicated here. */
  private windowMs = 60_000;

  /** Distinguishes the general limiter's counters from the auth limiter's. */
  readonly prefix: string;

  /** Counters are shared through Mongo, so the double-count check must know. */
  readonly localKeys = false;

  constructor(prefix: string) {
    this.prefix = `${prefix}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private docId(key: string, start: number): string {
    return `${this.prefix}${key}:${start}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const start = windowStart(this.windowMs);
    const resetTime = new Date(start + this.windowMs);

    try {
      const doc = await RateLimitHit.findByIdAndUpdate(
        this.docId(key, start),
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: resetTime } },
        { upsert: true, new: true, lean: true },
      );

      return { totalHits: doc?.count ?? 1, resetTime };
    } catch (err) {
      // A rate limiter that fails closed takes the whole API down with the
      // database. Count the request as the first in its window instead and let
      // it through — degraded limiting beats a hard outage, and the connection
      // error is already being logged by the driver's own handlers.
      logger.warn('Rate-limit store unavailable — allowing the request', {
        err: err instanceof Error ? err.message : String(err),
      });
      return { totalHits: 1, resetTime };
    }
  }

  async decrement(key: string): Promise<void> {
    // Used by `skipSuccessfulRequests`: a successful sign-in gives its slot
    // back, so only failures spend the budget.
    const start = windowStart(this.windowMs);
    try {
      await RateLimitHit.updateOne({ _id: this.docId(key, start), count: { $gt: 0 } }, { $inc: { count: -1 } });
    } catch {
      // Refunding a slot is best-effort; over-counting is the safe direction.
    }
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const start = windowStart(this.windowMs);
    const doc = await RateLimitHit.findById(this.docId(key, start)).lean();
    if (!doc) return undefined;
    return { totalHits: doc.count, resetTime: new Date(start + this.windowMs) };
  }

  async resetKey(key: string): Promise<void> {
    await RateLimitHit.deleteOne({ _id: this.docId(key, windowStart(this.windowMs)) });
  }

  async resetAll(): Promise<void> {
    await RateLimitHit.deleteMany({ _id: new RegExp(`^${this.prefix}`) });
  }
}
