import { model, Schema } from 'mongoose';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * A message in a user's inbox. `userId` is optional: an unset value is a
 * broadcast every user sees, which is how platform-wide notices are modelled
 * without fanning out one row per user.
 */
export interface NotificationDoc {
  _id: string; // NTF-01
  userId?: string;
  title: string;
  body: string;
  category: string;
  read: boolean;
  at: Date;
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, ref: 'User', index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    category: { type: String, required: true, index: true },
    read: { type: Boolean, default: false, index: true },
    at: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

notificationSchema.plugin(baseSchemaPlugin);
notificationSchema.index({ userId: 1, read: 1, at: -1 });

export const Notification = model<NotificationDoc>('Notification', notificationSchema);
