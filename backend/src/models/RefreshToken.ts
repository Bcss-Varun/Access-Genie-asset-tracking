import { model, Schema } from 'mongoose';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * Server-side record of every issued refresh token.
 *
 * Storing only a SHA-256 of the token means a database dump cannot be replayed
 * as a live session. Keeping the record at all is what makes revocation real:
 * "log out everywhere" and refresh-token rotation both need a server-side
 * handle on the token, which a stateless JWT alone cannot give.
 */
export interface RefreshTokenDoc {
  _id: Schema.Types.ObjectId;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  /** Set when rotation replaces this token — makes reuse detectable. */
  replacedByHash?: string;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    userId: { type: String, required: true, ref: 'User', index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    replacedByHash: { type: String },
    userAgent: { type: String },
    ip: { type: String },
  },
  { timestamps: true },
);

refreshTokenSchema.plugin(baseSchemaPlugin);

// Mongo evicts expired tokens on its own — no cleanup job to forget to run.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model<RefreshTokenDoc>('RefreshToken', refreshTokenSchema);
