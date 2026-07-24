import bcrypt from 'bcryptjs';
import { model, Schema, type HydratedDocument, type Model } from 'mongoose';
import { ROLE_IDS, type PublicUser, type RoleId } from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

const BCRYPT_ROUNDS = 12;

export interface UserDoc {
  _id: string;
  name: string;
  email: string;
  passwordHash: string;
  initials: string;
  roleId: RoleId;
  title: string;
  homeScopeId: string;
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
  this.passwordHash = await bcrypt.hash(this.passwordHash, BCRYPT_ROUNDS);
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
    status: this.status,
    lastLoginAt: this.lastLoginAt?.toISOString(),
    createdAt: this.createdAt.toISOString(),
  };
};

export const User = model<UserDoc, UserModel>('User', userSchema);
