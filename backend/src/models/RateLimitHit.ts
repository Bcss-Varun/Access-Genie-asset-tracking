import { model, Schema } from 'mongoose';

/**
 * Rate-limit counters, in the database rather than in process memory.
 *
 * `express-rate-limit`'s default store is a Map on the instance. That is fine
 * for one long-lived process and wrong for a deployment: two instances behind a
 * load balancer each let the full budget through, so the effective limit is
 * `max × instances`, and every restart hands an attacker a fresh budget. For
 * the auth limiter — the one actually standing between the login route and
 * credential stuffing — both are real holes.
 *
 * One document per (key, window). The window start is part of the `_id`, so a
 * new window is a new document and expiry is what cleans up: no sweeper job,
 * and no counter to reset.
 */
export interface RateLimitHitDoc {
  /** `<prefix>:<client key>:<window start ms>` — unique per window by construction. */
  _id: string;
  count: number;
  /** When this window ends. A TTL index removes the document shortly after. */
  expiresAt: Date;
}

const rateLimitHitSchema = new Schema<RateLimitHitDoc>(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

// Mongo's TTL monitor runs about once a minute, so a document can outlive its
// window briefly. That is harmless: the reads are keyed by window start, so a
// lingering document is never counted against the current one.
rateLimitHitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimitHit = model<RateLimitHitDoc>('RateLimitHit', rateLimitHitSchema);
