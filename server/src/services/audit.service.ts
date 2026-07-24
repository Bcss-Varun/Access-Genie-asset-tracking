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
