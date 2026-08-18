import { model, Schema } from 'mongoose';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * A message in a user's inbox. `userId` is optional: an unset value is a
 * broadcast every user sees, which is how platform-wide notices are modelled
 * without fanning out one row per user.
 */
/**
 * One attempt to deliver this notification somewhere outside the app.
 *
 * Held per channel rather than as a single flag, because "the webhook fired but
 * the email bounced" is a real and important state — and because the previous
 * situation (an in-app row and nothing else) let the product claim a
 * notification had been *sent* when all that existed was a database insert.
 */
export interface NotificationDeliveryDoc {
  channel: 'webhook' | 'email';
  /**
   * `pending`  — queued, not yet attempted
   * `sent`     — the provider accepted it
   * `failed`   — the provider rejected it or timed out
   * `skipped`  — no destination configured for this channel
   */
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  target?: string;
  attempts: number;
  lastAttemptAt?: Date;
  /** The provider's reason, kept verbatim so a failure can be diagnosed. */
  error?: string;
}

export interface NotificationDoc {
  _id: string; // NTF-01
  userId?: string;
  title: string;
  body: string;
  category: string;
  read: boolean;
  at: Date;
  /** Empty for in-app-only notifications. */
  delivery: NotificationDeliveryDoc[];
}

const deliverySchema = new Schema<NotificationDeliveryDoc>(
  {
    channel: { type: String, required: true, enum: ['webhook', 'email'] },
    status: { type: String, required: true, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'pending' },
    target: String,
    attempts: { type: Number, default: 0, min: 0 },
    lastAttemptAt: Date,
    error: String,
  },
  { _id: false },
);

const notificationSchema = new Schema<NotificationDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, ref: 'User', index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    category: { type: String, required: true, index: true },
    read: { type: Boolean, default: false, index: true },
    at: { type: Date, required: true, default: Date.now },
    delivery: { type: [deliverySchema], default: [] },
  },
  { versionKey: false },
);

notificationSchema.plugin(baseSchemaPlugin);
notificationSchema.index({ userId: 1, read: 1, at: -1 });

export const Notification = model<NotificationDoc>('Notification', notificationSchema);
