import type { RoleId } from '@access-genie/shared';
import { Notification, User, nextId } from '../models/index.js';
import { logger } from '../config/logger.js';

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
}

async function write(input: NotifyInput): Promise<void> {
  try {
    await Notification.create({
      _id: await nextId('notification', 'NTF'),
      userId: input.userId,
      title: input.title,
      body: input.body,
      category: input.category,
      read: false,
      at: new Date(),
    });
  } catch (err) {
    logger.warn('Notification write failed', { category: input.category, err });
  }
}

/** Broadcast, or targeted when `userId` is given. */
export async function notify(input: NotifyInput): Promise<void> {
  await write(input);
}

/** One notification per active user holding any of the given roles. */
export async function notifyRoles(roles: RoleId[], input: Omit<NotifyInput, 'userId'>): Promise<void> {
  if (roles.length === 0) return;
  const users = await User.find({ roleId: { $in: roles }, status: 'active' }).select('_id').lean();
  await Promise.all(users.map((u) => write({ ...input, userId: String(u._id) })));
}
