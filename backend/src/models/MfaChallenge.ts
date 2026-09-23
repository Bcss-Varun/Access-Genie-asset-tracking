import { model, Schema } from 'mongoose';
/** Short-lived password proof. Hash-only, shared across API processes. */
const schema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  authVersion: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const MfaChallenge = model('MfaChallenge', schema);
