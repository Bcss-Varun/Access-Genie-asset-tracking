import { Asset, Certification, ComplianceRecord, nextId, type CertificationDoc } from '../models/index.js';
import { logger } from '../config/logger.js';
import { recordSystemAudit } from './audit.service.js';
import { fireEvent } from './notificationRule.service.js';
import { notify } from './notification.service.js';

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
 *
 * Since Part 2: a transition this pass makes is also a Compliance Monitoring
 * fact, not just a notification. Each certificate that crosses a threshold
 * raises a `ComplianceRecord` finding against the asset it certifies, an
 * immutable audit-log row (there is no `req` here — see `recordSystemAudit`),
 * and a `compliance.finding_raised`/`certification.expiring` event any
 * Notification Rule can react to. All three read from the same transition, so
 * they can never disagree about which certificates just changed.
 */

/** How far ahead a certificate is flagged as expiring. */
export const EXPIRING_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

export interface ComplianceSweepResult {
  expired: number;
  expiring: number;
  notified: number;
}

async function raiseComplianceRecord(cert: CertificationDoc, kind: 'Expired' | 'Expiring'): Promise<void> {
  const asset = await Asset.findById(cert.assetId).lean();
  const scopeId = asset?.location.id;
  const severity = kind === 'Expired' ? 'Critical' : 'Medium';
  const title = kind === 'Expired' ? `Certificate expired — ${cert.name}` : `Certificate expiring soon — ${cert.name}`;
  const description =
    kind === 'Expired'
      ? `${cert.name} (${cert.authority}) for ${cert.assetName} lapsed on ${cert.expiresAt.toISOString().slice(0, 10)}.`
      : `${cert.name} (${cert.authority}) for ${cert.assetName} expires on ${cert.expiresAt.toISOString().slice(0, 10)}, within the ${EXPIRING_WINDOW_DAYS}-day compliance window.`;

  const recordId = await nextId('complianceRecord', 'CMR');
  await ComplianceRecord.create({
    _id: recordId,
    assetId: cert.assetId,
    assetName: cert.assetName,
    scopeId,
    relatedCertificationId: cert._id,
    certificationEvent: kind,
    certificationExpiresAt: cert.expiresAt,
    title,
    description,
    category: 'Regulatory',
    severity,
    status: 'Open',
    source: 'Automated',
    dueDate: kind === 'Expiring' ? cert.expiresAt : undefined,
    createdBy: 'system',
  });

  recordSystemAudit({
    action: `certification.${kind.toLowerCase()}`,
    target: cert._id,
    category: 'Compliance',
    metadata: { complianceRecordId: recordId, assetId: cert.assetId, expiresAt: cert.expiresAt.toISOString() },
  });

  void fireEvent(
    kind === 'Expired' ? 'certification.expired' : 'certification.expiring',
    { subjectId: recordId, scopeId, actorId: 'system', actorName: 'Compliance sweep', severity },
    title,
    description,
  );
}

/**
 * Has this certificate already had a finding for this event at this expiry?
 *
 * Findings raised before the idempotency fields existed are matched by asset
 * and title, so the first pass after an upgrade does not duplicate them.
 */
async function alreadyAnnounced(cert: CertificationDoc, kind: 'Expired' | 'Expiring'): Promise<boolean> {
  const title = kind === 'Expired' ? `Certificate expired — ${cert.name}` : `Certificate expiring soon — ${cert.name}`;
  const existing = await ComplianceRecord.exists({
    $or: [
      { relatedCertificationId: cert._id, certificationEvent: kind, certificationExpiresAt: cert.expiresAt },
      { relatedCertificationId: { $exists: false }, source: 'Automated', assetId: cert.assetId, title },
    ],
  });
  return Boolean(existing);
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

  /*
   * Announce every certificate that has crossed a threshold and not yet been
   * announced for it — rather than only the ones this pass moved.
   *
   * It used to be "the ones `updateMany` just changed", which had two holes. A
   * certificate *recorded* already expired or inside the window is stored with
   * that status by the write path (compliance.service derives it), so no pass
   * ever moved it and no finding was ever raised. And the lapsed set was
   * re-selected as "the N most recently expired", which is not necessarily the
   * N that changed. The finding itself is now the record of having announced:
   * one per certificate, per event, per expiry date — so the pass stays
   * idempotent, and a renewed certificate that lapses again is announced again.
   */
  let notified = 0;

  const lapsed = await Certification.find({ status: 'Expired', expiresAt: { $lt: now } })
    .sort({ expiresAt: -1 })
    .lean<CertificationDoc[]>();
  for (const cert of lapsed) {
    if (await alreadyAnnounced(cert, 'Expired')) continue;
    try {
      await raiseComplianceRecord(cert, 'Expired');
      // An organisation-level fact: everyone who can see the asset's site is
      // told. This used to be a Notification with no `userId` — a "broadcast"
      // the inbox (which reads by user) never showed to anybody.
      const asset = await Asset.findById(cert.assetId).select('location').lean();
      await notify({
        title: `Certificate expired — ${cert.name}`,
        body: `${cert.name} for ${cert.assetName} lapsed on ${cert.expiresAt.toISOString().slice(0, 10)}.`,
        category: 'Compliance',
        scopeId: asset?.location?.id,
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

  const upcoming = await Certification.find({ status: 'Expiring', expiresAt: { $gte: now, $lte: horizon } })
    .sort({ expiresAt: 1 })
    .lean<CertificationDoc[]>();
  for (const cert of upcoming) {
    if (await alreadyAnnounced(cert, 'Expiring')) continue;
    try {
      await raiseComplianceRecord(cert, 'Expiring');
    } catch (err: unknown) {
      logger.error('Certificate expiring-soon finding failed', {
        certificate: cert._id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { expired: expired.modifiedCount, expiring: expiring.modifiedCount, notified };
}
