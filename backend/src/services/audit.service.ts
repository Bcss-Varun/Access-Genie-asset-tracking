import type { Request } from 'express';
import { AuditLog } from '../models/index.js';
import { logger } from '../config/logger.js';

/**
 * Record a state change in the immutable audit log.
 *
 * Deliberately fire-and-forget: a failure to write the audit row must never
 * fail the user's request, but it must be loud in the logs. (In a system where
 * audit is a hard compliance requirement, this becomes an outbox write inside
 * the same transaction — noted in docs/16.)
 */
export function recordAudit(
  req: Request,
  input: { action: string; target: string; category: string; metadata?: Record<string, unknown> },
): void {
  const actor = req.auth?.user.email ?? 'anonymous';

  void AuditLog.create({
    actor,
    action: input.action,
    target: input.target,
    category: input.category,
    ip: req.ip ?? '',
    timestamp: new Date(),
    metadata: { requestId: req.requestId, ...input.metadata },
  }).catch((err: unknown) => {
    logger.error('Failed to write audit record', {
      requestId: req.requestId,
      action: input.action,
      target: input.target,
      err: String(err),
    });
  });
}

/**
 * Record a state change with no request behind it.
 *
 * `recordAudit` assumes an authenticated `req` because every write it audits
 * came from one. A scheduled sweep (certificate expiry, a future overdue-work
 * pass) has no request — the actor is the system itself — so it needs the same
 * write without that dependency. Kept as a separate function rather than an
 * optional `req` on `recordAudit`: a call site that forgets to pass `req` should
 * fail to compile, not silently log "anonymous".
 */
export function recordSystemAudit(input: {
  action: string;
  target: string;
  category: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}): void {
  void AuditLog.create({
    actor: input.actor ?? 'system',
    action: input.action,
    target: input.target,
    category: input.category,
    ip: '',
    timestamp: new Date(),
    metadata: input.metadata ?? {},
  }).catch((err: unknown) => {
    logger.error('Failed to write system audit record', {
      action: input.action,
      target: input.target,
      err: String(err),
    });
  });
}
