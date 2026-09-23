import { resolveVisibleScope } from './tenancy.service.js';
import type { RoleId } from '@access-genie/shared';
import { Notification, User, nextId } from '../models/index.js';
import { logger } from '../config/logger.js';
import { deliverNotification } from './notificationDelivery.service.js';

/**
 * Inbox writes. `Notification` (the model) has existed since early on with
 * nothing behind it — nothing in the codebase ever called `.create()` on it.
 * This is that missing write path: one broadcast helper, one role-targeted
 * helper, both fire-and-forget so a notification failure never fails the
 * request that triggered it (same reasoning as `audit.service.ts`'s
 * `recordAudit`).
 */

export interface NotifyInput {
  title: string;
  body: string;
  category: string;
  /** Omit for a broadcast every user sees. */
  userId?: string;
  scopeId?: string;
  platformOnly?: boolean;
}

async function write(input: NotifyInput): Promise<void> {
  try {
    const created = await Notification.create({
      _id: await nextId('notification', 'NTF'),
      userId: input.userId,
      title: input.title,
      body: input.body,
      category: input.category,
      read: false,
      at: new Date(),
    });

    /*
     * The inbox row is not the delivery.
     *
     * Everything used to stop at the line above, and callers read a successful
     * insert as "the user has been told". External delivery now runs through
     * the provider chain and its outcome — per channel, per destination — is
     * written back onto the notification, so a failed webhook is visible rather
     * than assumed away.
     *
     * Awaited rather than fired and forgotten: `notify` is already
     * fire-and-forget at its own call sites, and swallowing the result here
     * would put the status write in a race with the request finishing.
     */
    await deliverNotification(created.toObject());
  } catch (err) {
    logger.warn('Notification write failed', { category: input.category, err });
  }
}

/** Resolve recipients before storing any asset details in an inbox. */
async function recipients(input: NotifyInput, roles?: RoleId[]): Promise<void> {
  const users = await User.find({ status: 'active',
    ...(input.userId ? { _id: input.userId } : {}),
    ...(input.platformOnly ? { roleId: 'super_admin' } : roles ? { roleId: { $in: roles } } : {}),
  }).lean();
  for (const user of users) {
    if (input.scopeId && user.roleId !== 'super_admin') {
      try {
        const scope = await resolveVisibleScope({ roleId: user.roleId, homeScopeId: user.homeScopeId });
        if (!scope.ids.has(input.scopeId)) continue;
      } catch { continue; }
    }
    await write({ ...input, userId: String(user._id) });
  }
}
export async function notify(input: NotifyInput): Promise<void> {
  try { await recipients(input); }
  catch (err) { logger.warn('Notification recipients could not be resolved', { category: input.category, err }); }
}
export async function notifyRoles(roles: RoleId[], input: Omit<NotifyInput, 'userId'>): Promise<void> {
  try { if (roles.length) await recipients(input, roles); }
  catch (err) { logger.warn('Notification recipients could not be resolved', { category: input.category, err }); }
}
