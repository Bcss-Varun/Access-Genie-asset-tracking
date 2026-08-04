import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ROLES, type AuthPayload, type Persona } from '@access-genie/shared';
import { User } from '../models/index.js';
import { env } from '../config/env.js';
import { generateRecoveryCodes, generateSecret, otpauthUri, verifyCode } from './totp.service.js';
import { ApiError } from '../utils/ApiError.js';
import { issueRefreshToken, revokeAllForUser, rotateRefreshToken, signAccessToken } from './token.service.js';
import { grantedModules } from './roleGrant.service.js';

interface ClientContext {
  userAgent?: string;
  ip?: string;
}

/**
 * Assemble the payload the client needs to render an authenticated session.
 *
 * Modules come from the grant service rather than straight from the matrix, so
 * the navigation a user sees at sign-in matches what the API will let them
 * through to — an override applied by an administrator takes effect on the very
 * next login, not once the shipped defaults happen to agree.
 */
async function toAuthPayload(
  user: { id: string; roleId: keyof typeof ROLES } & Record<string, unknown>,
  publicUser: AuthPayload['user'],
): Promise<AuthPayload> {
  const { token, expiresIn } = signAccessToken(user.id, user.roleId);
  return {
    user: publicUser,
    role: ROLES[user.roleId],
    modules: await grantedModules(user.roleId),
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
export interface MfaChallengeResult {
  mfaRequired: true;
  challengeToken: string;
}

export type LoginResult =
  | { mfaRequired?: false; auth: AuthPayload; refreshToken: string; refreshExpiresAt: Date }
  | MfaChallengeResult;

export async function login(email: string, password: string, context: ClientContext): Promise<LoginResult> {
  const user = await User.findOne({ email }).select('+passwordHash');

  // Compare against a dummy hash when the account does not exist, so both paths
  // pay the same bcrypt cost.
  const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO1Cn0RQjqrGaMxLwTLDN8v7yQ2NqZ0KO';
  const matches = await (user
    ? user.comparePassword(password)
    : import('bcryptjs').then((bcrypt) => bcrypt.default.compare(password, DUMMY_HASH)));

  if (!user || !matches) throw ApiError.unauthorized('Incorrect email or password');
  if (user.status !== 'active') throw ApiError.forbidden('This account is suspended');

  // The password was right, but it is not a session yet. No refresh token is
  // issued and `lastLoginAt` is not stamped until the second factor lands —
  // otherwise a stolen password would show up as a successful sign-in.
  if (user.mfaEnabled) {
    return { mfaRequired: true, challengeToken: issueChallenge(user.id) };
  }

  user.lastLoginAt = new Date();
  await user.save();

  const refresh = await issueRefreshToken(user.id, context);

  return {
    auth: await toAuthPayload({ id: user.id, roleId: user.roleId }, user.toPublic()),
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
    auth: await toAuthPayload({ id: user.id, roleId: user.roleId }, user.toPublic()),
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

// ── Multi-factor authentication ──────────────────────────────────────────────
/**
 * TOTP enrolment and challenge.
 *
 * The Security screen claimed MFA was enabled and showed an authenticator that
 * did not exist — the most dangerous kind of fiction a product can display,
 * because somebody reads it and stops worrying.
 *
 * Enrolment is two steps on purpose. `beginMfaSetup` mints a secret but does
 * *not* turn MFA on; `completeMfaSetup` requires a code generated from that
 * secret first. Without that, a half-finished enrolment would lock the account
 * behind a secret nobody had scanned.
 */

/** A challenge token binds a verified password to the second factor. */
const MFA_CHALLENGE_TTL_MS = 5 * 60_000;
const mfaChallenges = new Map<string, { userId: string; expiresAt: number }>();

/** Drop expired challenges whenever one is issued — the map stays tiny. */
function sweepChallenges(now: number): void {
  for (const [token, challenge] of mfaChallenges) {
    if (challenge.expiresAt <= now) mfaChallenges.delete(token);
  }
}

function issueChallenge(userId: string): string {
  const now = Date.now();
  sweepChallenges(now);

  const token = randomBytes(32).toString('base64url');
  mfaChallenges.set(token, { userId, expiresAt: now + MFA_CHALLENGE_TTL_MS });
  return token;
}

export interface MfaSetup {
  secret: string;
  otpauthUri: string;
}

export async function beginMfaSetup(userId: string): Promise<MfaSetup> {
  const user = await User.findById(userId).select('+mfaSecret');
  if (!user) throw ApiError.notFound('User');
  if (user.mfaEnabled) throw ApiError.conflict('Multi-factor authentication is already enabled');

  const secret = generateSecret();
  user.mfaSecret = secret;
  await user.save();

  return { secret, otpauthUri: otpauthUri(secret, user.email, env.ADMIN_ORG_NAME || 'Access Genie') };
}

/** Verify the first code, switch MFA on, and hand back the recovery codes once. */
export async function completeMfaSetup(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
  const user = await User.findById(userId).select('+mfaSecret +mfaRecoveryCodes');
  if (!user) throw ApiError.notFound('User');
  if (user.mfaEnabled) throw ApiError.conflict('Multi-factor authentication is already enabled');
  if (!user.mfaSecret) throw ApiError.badRequest('Start setup first — there is no secret to verify against');

  if (!verifyCode(user.mfaSecret, code)) {
    throw ApiError.badRequest('That code is not valid. Check your device clock and try the current code.');
  }

  const recoveryCodes = generateRecoveryCodes();
  user.mfaEnabled = true;
  // Hashed, like passwords: a recovery code is a credential, and a database
  // dump should not hand over eight working ones per account.
  user.mfaRecoveryCodes = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, env.BCRYPT_ROUNDS)));
  await user.save();

  return { recoveryCodes };
}

/** Turn it off. Requires the current password — an unlocked screen is not consent. */
export async function disableMfa(userId: string, password: string): Promise<void> {
  const user = await User.findById(userId).select('+passwordHash +mfaSecret +mfaRecoveryCodes');
  if (!user) throw ApiError.notFound('User');
  if (!(await user.comparePassword(password))) throw ApiError.unauthorized('That password is not correct');

  user.mfaEnabled = false;
  user.mfaSecret = undefined;
  user.mfaRecoveryCodes = [];
  await user.save();
}

/** Fresh recovery codes, replacing the old set. */
export async function regenerateRecoveryCodes(userId: string, password: string): Promise<string[]> {
  const user = await User.findById(userId).select('+passwordHash +mfaRecoveryCodes');
  if (!user) throw ApiError.notFound('User');
  if (!user.mfaEnabled) throw ApiError.badRequest('Multi-factor authentication is not enabled');
  if (!(await user.comparePassword(password))) throw ApiError.unauthorized('That password is not correct');

  const codes = generateRecoveryCodes();
  user.mfaRecoveryCodes = await Promise.all(codes.map((c) => bcrypt.hash(c, env.BCRYPT_ROUNDS)));
  await user.save();

  return codes;
}

/** How many unused recovery codes remain — shown on the Security screen. */
export async function remainingRecoveryCodes(userId: string): Promise<number> {
  const user = await User.findById(userId).select('+mfaRecoveryCodes').lean<{ mfaRecoveryCodes?: string[] }>();
  return user?.mfaRecoveryCodes?.length ?? 0;
}

/**
 * Complete a sign-in that stopped at the second factor.
 *
 * Accepts either a TOTP code or a recovery code. A recovery code is consumed —
 * that is what makes it single-use, and the whole point of them.
 */
export async function verifyMfa(
  challengeToken: string,
  code: string,
  context: ClientContext,
): Promise<{ auth: AuthPayload; refreshToken: string; refreshExpiresAt: Date }> {
  const challenge = mfaChallenges.get(challengeToken);
  if (!challenge || challenge.expiresAt <= Date.now()) {
    mfaChallenges.delete(challengeToken);
    throw ApiError.unauthorized('That sign-in attempt has expired. Start again.');
  }

  const user = await User.findById(challenge.userId).select('+mfaSecret +mfaRecoveryCodes');
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (user.status !== 'active') throw ApiError.forbidden('This account is suspended');

  const cleaned = code.trim().toUpperCase();
  let accepted = Boolean(user.mfaSecret && verifyCode(user.mfaSecret, code));

  if (!accepted && user.mfaRecoveryCodes.length > 0) {
    for (let i = 0; i < user.mfaRecoveryCodes.length; i++) {
      if (await bcrypt.compare(cleaned, user.mfaRecoveryCodes[i] as string)) {
        user.mfaRecoveryCodes.splice(i, 1);
        accepted = true;
        break;
      }
    }
  }

  if (!accepted) throw ApiError.unauthorized('That code is not valid');

  // Burned on success, so a captured challenge cannot be replayed.
  mfaChallenges.delete(challengeToken);

  user.lastLoginAt = new Date();
  await user.save();

  const refresh = await issueRefreshToken(user.id, context);
  return {
    auth: await toAuthPayload({ id: user.id, roleId: user.roleId }, user.toPublic()),
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  };
}

export { issueChallenge };
