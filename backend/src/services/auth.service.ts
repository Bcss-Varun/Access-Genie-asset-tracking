import { ROLES, resolveModules, type AuthPayload, type Persona } from '@access-genie/shared';
import { User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { issueRefreshToken, revokeAllForUser, rotateRefreshToken, signAccessToken } from './token.service.js';

interface ClientContext {
  userAgent?: string;
  ip?: string;
}

/** Assemble the payload the client needs to render an authenticated session. */
function toAuthPayload(
  user: { id: string; roleId: keyof typeof ROLES } & Record<string, unknown>,
  publicUser: AuthPayload['user'],
): AuthPayload {
  const { token, expiresIn } = signAccessToken(user.id, user.roleId);
  return {
    user: publicUser,
    role: ROLES[user.roleId],
    modules: resolveModules(user.roleId),
    accessToken: token,
    expiresIn,
  };
}

/**
 * Exchange credentials for a token pair.
 *
 * A wrong email and a wrong password produce the identical error, and the
 * password comparison runs even when no user matched, so response timing does
 * not reveal which addresses are registered.
 */
export async function login(
  email: string,
  password: string,
  context: ClientContext,
): Promise<{ auth: AuthPayload; refreshToken: string; refreshExpiresAt: Date }> {
  const user = await User.findOne({ email }).select('+passwordHash');

  // Compare against a dummy hash when the account does not exist, so both paths
  // pay the same bcrypt cost.
  const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO1Cn0RQjqrGaMxLwTLDN8v7yQ2NqZ0KO';
  const matches = await (user
    ? user.comparePassword(password)
    : import('bcryptjs').then((bcrypt) => bcrypt.default.compare(password, DUMMY_HASH)));

  if (!user || !matches) throw ApiError.unauthorized('Incorrect email or password');
  if (user.status !== 'active') throw ApiError.forbidden('This account is suspended');

  user.lastLoginAt = new Date();
  await user.save();

  const refresh = await issueRefreshToken(user.id, context);

  return {
    auth: toAuthPayload({ id: user.id, roleId: user.roleId }, user.toPublic()),
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  };
}

/** Trade a valid refresh token for a new access token (rotating the refresh). */
export async function refresh(
  token: string,
  context: ClientContext,
): Promise<{ auth: AuthPayload; refreshToken: string; refreshExpiresAt: Date }> {
  const rotated = await rotateRefreshToken(token, context);
  const user = await User.findById(rotated.userId);

  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (user.status !== 'active') throw ApiError.forbidden('This account is suspended');

  return {
    auth: toAuthPayload({ id: user.id, roleId: user.roleId }, user.toPublic()),
    refreshToken: rotated.token,
    refreshExpiresAt: rotated.expiresAt,
  };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User');

  const matches = await user.comparePassword(currentPassword);
  if (!matches) throw ApiError.unauthorized('Current password is incorrect');

  user.passwordHash = newPassword; // hashed by the pre-save hook
  await user.save();

  // Changing a password invalidates every other session — that is usually the
  // whole reason a user changes it.
  await revokeAllForUser(userId);
}

/**
 * The demo persona list. This is a demo affordance, not an auth bypass: each
 * persona is a real account and still has to log in with a password.
 */
export async function listPersonas(): Promise<Persona[]> {
  const users = await User.find({ status: 'active' }).sort({ createdAt: 1 }).lean();

  return users.map((u) => ({
    email: u.email,
    name: u.name,
    roleId: u.roleId,
    roleName: ROLES[u.roleId].name,
    title: u.title,
    initials: u.initials,
  }));
}
