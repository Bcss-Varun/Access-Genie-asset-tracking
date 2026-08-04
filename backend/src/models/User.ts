import bcrypt from 'bcryptjs';
import { model, Schema, type HydratedDocument, type Model } from 'mongoose';
import { ROLE_IDS, type PublicUser, type RoleId } from '@access-genie/shared';
import { env } from '../config/env.js';
import { baseSchemaPlugin } from '../utils/mongoose.js';

export interface UserDoc {
  _id: string;
  name: string;
  email: string;
  passwordHash: string;
  initials: string;
  roleId: RoleId;
  title: string;
  homeScopeId: string;
  phone: string;
  timezone: string;
  /**
   * TOTP. `mfaSecret` exists as soon as setup begins; `mfaEnabled` only once a
   * code has been verified — otherwise a half-finished enrolment would lock the
   * account behind a secret nobody has scanned.
   */
  mfaEnabled: boolean;
  mfaSecret?: string;
  /** Hashed, single-use. Consumed by splicing the used one out. */
  mfaRecoveryCodes: string[];
  status: 'active' | 'suspended';
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserMethods {
  comparePassword(candidate: string): Promise<boolean>;
  toPublic(): PublicUser;
}

export type UserModel = Model<UserDoc, Record<string, never>, UserMethods>;
export type UserDocument = HydratedDocument<UserDoc, UserMethods>;

const userSchema = new Schema<UserDoc, UserModel, UserMethods>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      // Deliberately permissive: real-world corporate addresses break clever
      // regexes far more often than they catch a genuine typo.
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    // `select: false` keeps the hash out of every query that does not ask for
    // it by name, so it cannot leak through a forgotten `.lean()` or `toJSON`.
    passwordHash: { type: String, required: true, select: false },
    initials: { type: String, required: true, maxlength: 3 },
    roleId: { type: String, required: true, enum: ROLE_IDS },
    title: { type: String, required: true },
    homeScopeId: { type: String, required: true },
    // Maintained by the user on their own profile, not by an administrator.
    phone: { type: String, default: '' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    mfaEnabled: { type: Boolean, default: false },
    // Both are secrets: `select: false` keeps them out of every query that does
    // not name them, so they cannot leak through a forgotten `.lean()`.
    mfaSecret: { type: String, select: false },
    mfaRecoveryCodes: { type: [String], default: [], select: false },
    status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.plugin(baseSchemaPlugin);
userSchema.index({ roleId: 1, status: 1 });

/** Hash on the way in, so no caller can ever persist a plaintext password. */
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, env.BCRYPT_ROUNDS);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

/** The only shape a user is allowed to leave the server in. */
userSchema.methods.toPublic = function toPublic(): PublicUser {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    initials: this.initials,
    roleId: this.roleId,
    title: this.title,
    homeScopeId: this.homeScopeId,
    phone: this.phone,
    timezone: this.timezone,
    mfaEnabled: this.mfaEnabled,
    status: this.status,
    lastLoginAt: this.lastLoginAt?.toISOString(),
    createdAt: this.createdAt.toISOString(),
  };
};

export const User = model<UserDoc, UserModel>('User', userSchema);
