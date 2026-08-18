import { Certification, Notification, nextId } from '../models/index.js';
import { logger } from '../config/logger.js';

/**
 * Certification expiry, processed on a clock.
 *
 * A certificate's `status` is one of `Valid | Expiring | Expired`, and nothing
 * in this codebase ever moved it. The value was written once — at seed time, or
 * by whoever created the record — and then stayed there while `expiresAt` slid
 * into the past. So the compliance register reported certificates as valid
 * months after they had lapsed, and every screen downstream of it (the
 * compliance dashboard, the analytics pass rate, the expiring-soon triage
 * count) inherited that.
 *
 * This is the class of state that *cannot* be event-driven: nothing happens
 * when a certificate expires. No request arrives, no record is written. The
 * only thing that changed is the date, so only a scheduled pass can notice.
 *
 * The transitions are one-way and idempotent — a pass that runs twice in a day
 * changes nothing the second time — which is what lets it run on a simple
 * interval without any locking.
 */

/** How far ahead a certificate is flagged as expiring. */
export const EXPIRING_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

export interface ComplianceSweepResult {
  expired: number;
  expiring: number;
  notified: number;
}

/**
 * Advance every certificate whose status no longer matches its date.
 *
 * Two `updateMany` calls rather than a read-modify-write loop: the transition
 * is a pure function of `expiresAt` and the clock, so it is expressible as a
 * filter, and doing it in the database keeps the pass O(1) in round trips
 * however large the register grows.
 */
export async function sweepCertificationExpiry(now = new Date()): Promise<ComplianceSweepResult> {
  const horizon = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * DAY_MS);

  // Past its date and not already marked. Ordered first so a certificate that
  // crossed both thresholds since the last pass lands on `Expired`, not
  // `Expiring`.
  const expired = await Certification.updateMany(
    { expiresAt: { $lt: now }, status: { $ne: 'Expired' } },
    { $set: { status: 'Expired' } },
  );

  const expiring = await Certification.updateMany(
    { expiresAt: { $gte: now, $lte: horizon }, status: 'Valid' },
    { $set: { status: 'Expiring' } },
  );

  // Only the certificates that changed *in this pass* are announced. Notifying
  // on every pass for everything currently expired would make the inbox
  // useless within a week, which is the usual way a digest stops being read.
  let notified = 0;
  if (expired.modifiedCount > 0) {
    const lapsed = await Certification.find({ status: 'Expired', expiresAt: { $lt: now } })
      .sort({ expiresAt: -1 })
      .limit(expired.modifiedCount)
      .lean();

    for (const cert of lapsed) {
      try {
        // Broadcast (no `userId`) — an expired certificate is an
        // organisation-level compliance fact, not one person's task.
        await Notification.create({
          _id: await nextId('notification', 'NTF'),
          title: `Certificate expired — ${cert.name}`,
          body: `${cert.name} for ${cert.assetName} lapsed on ${cert.expiresAt.toISOString().slice(0, 10)}.`,
          category: 'Compliance',
          at: now,
          read: false,
        });
        notified += 1;
      } catch (err: unknown) {
        // A failed notification must not roll back a status that is now correct.
        logger.error('Certificate expiry notification failed', {
          certificate: cert._id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { expired: expired.modifiedCount, expiring: expiring.modifiedCount, notified };
}
