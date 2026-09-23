import { MfaChallenge } from '../models/MfaChallenge.js';
import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ROLES, type AuthPayload, type Persona } from '@access-genie/shared';
import { User } from '../models/index.js';
import { env } from '../config/env.js';
import { generateRecoveryCodes, generateSecret, otpauthUri, verifyCode, matchingStep } from './totp.service.js';
import { ApiError } from '../utils/ApiError.js';
import { issueRefreshToken, revokeAllForUser, rotateRefreshToken, signAccessToken } from './token.service.js';
import { grantedActions, grantedModules } from './roleGrant.service.js';

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
  sessionId: string,
): Promise<AuthPayload> {
  const { token, expiresIn } = signAccessToken(user.id, user.roleId, sessionId);
  // Same union `requireAuth` applies on every later request (see
  // middleware/auth.ts) — computed independently here because sign-in builds
  // this payload before any request goes through that middleware, and without
  // it the navigation shown at login would omit a per-user grant until the
  // next page load happened to re-resolve it.
  const roleModules = await grantedModules(user.roleId);
  const candidates = Array.from(new Set([...roleModules, ...(publicUser.extraModules ?? [])]));
  const allowed = await Promise.all(candidates.map(async module => (await grantedActions(user.roleId, module, publicUser.extraModules)).includes('view')));
  const modules = candidates.filter((_module, index) => allowed[index]);

  return {
    user: publicUser,
    role: ROLES[user.roleId],
    modules,
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
    return { mfaRequired: true, challengeToken: await issueChallenge(user.id, user.authVersion ?? 0) };
  }

  user.lastLoginAt = new Date();
  await user.save();

  const refresh = await issueRefreshToken(user.id, context);

  return {
    auth: await toAuthPayload({ id: user.id, roleId: user.roleId }, user.toPublic(), refresh.sessionId),
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
  if (user.status !== 'active') { await revokeAllForUser(user._id); throw ApiError.forbidden('This account is suspended'); }

  return {
    auth: await toAuthPayload({ id: user.id, roleId: user.roleId }, user.toPublic(), rotated.sessionId),
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
  if (!env.ENABLE_DEMO_PERSONAS || env.isProd) return [];
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
const challengeHash = (token: string) => createHash('sha256').update(token).digest('hex');
async function issueChallenge(userId: string, authVersion: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await MfaChallenge.create({ tokenHash: challengeHash(token), userId, authVersion,
    expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS), attempts: 0 });
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
  const updated = await User.updateOne({ _id: userId, mfaEnabled: { $ne: true } }, { $set: { mfaSecret: secret } });
  if (!updated.modifiedCount) throw ApiError.conflict('Multi-factor authentication was changed. Reload and try again');

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
  const hashes = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, env.BCRYPT_ROUNDS)));
  const enabled = await User.updateOne({ _id: userId, mfaEnabled: { $ne: true }, mfaSecret: user.mfaSecret },
    { $set: { mfaEnabled: true, mfaRecoveryCodes: hashes, mfaLastStep: matchingStep(user.mfaSecret, code) }, $inc: { authVersion: 1 } });
  if (!enabled.modifiedCount) throw ApiError.conflict('Setup changed. Reload and try again');

  return { recoveryCodes };
}

/** Turn it off. Requires the current password — an unlocked screen is not consent. */
export async function disableMfa(userId: string, password: string): Promise<void> {
  const user = await User.findById(userId).select('+passwordHash +mfaSecret +mfaRecoveryCodes');
  if (!user) throw ApiError.notFound('User');
  if (!(await user.comparePassword(password))) throw ApiError.unauthorized('That password is not correct');

  await User.updateOne({ _id: userId, passwordHash: user.passwordHash }, {
    $set: { mfaEnabled: false, mfaRecoveryCodes: [] }, $unset: { mfaSecret: 1, mfaLastStep: 1 }, $inc: { authVersion: 1 },
  });
}

/** Fresh recovery codes, replacing the old set. */
export async function regenerateRecoveryCodes(userId: string, password: string): Promise<string[]> {
  const user = await User.findById(userId).select('+passwordHash +mfaRecoveryCodes');
  if (!user) throw ApiError.notFound('User');
  if (!user.mfaEnabled) throw ApiError.badRequest('Multi-factor authentication is not enabled');
  if (!(await user.comparePassword(password))) throw ApiError.unauthorized('That password is not correct');

  const codes = generateRecoveryCodes();
  const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, env.BCRYPT_ROUNDS)));
  const updated = await User.updateOne({ _id: userId, mfaEnabled: true, passwordHash: user.passwordHash },
    { $set: { mfaRecoveryCodes: hashes }, $inc: { authVersion: 1 } });
  if (!updated.modifiedCount) throw ApiError.conflict('Account security changed. Reload and try again');

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
  const challenge = await MfaChallenge.findOneAndUpdate({ tokenHash: challengeHash(challengeToken),
    expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } }, { new: true });
  if (!challenge) throw ApiError.unauthorized('That sign-in attempt has expired. Start again.');
  const user = await User.findById(challenge.userId).select('+mfaSecret +mfaRecoveryCodes +mfaLastStep');
  if (!user || user.status !== 'active' || !user.mfaEnabled || user.authVersion !== challenge.authVersion) {
    throw ApiError.unauthorized('That sign-in attempt is no longer valid. Start again.');
  }
  const cleaned = code.trim().toUpperCase();
  const step = user.mfaSecret ? matchingStep(user.mfaSecret, code) : null;
  let recoveryHash: string | undefined;
  if (step === null) {
    for (const hash of user.mfaRecoveryCodes) if (await bcrypt.compare(cleaned, hash)) { recoveryHash = hash; break; }
  }
  if (step === null && !recoveryHash) throw ApiError.unauthorized('That code is not valid');
  // Claim this challenge once across processes before issuing credentials.
  const claimed = await MfaChallenge.findOneAndDelete({ _id: challenge._id });
  if (!claimed) throw ApiError.unauthorized('That sign-in attempt was already used');
  const used = await User.updateOne({ _id: user._id, authVersion: challenge.authVersion === 0 ? { $in: [0, null] } : challenge.authVersion, mfaEnabled: true,
    ...(recoveryHash ? { mfaRecoveryCodes: recoveryHash } : { $or: [{ mfaLastStep: { $lt: step } }, { mfaLastStep: { $exists: false } }] }),
  }, recoveryHash ? { $pull: { mfaRecoveryCodes: recoveryHash }, $set: { lastLoginAt: new Date() } }
    : { $set: { mfaLastStep: step, lastLoginAt: new Date() } });
  if (!used.modifiedCount) throw ApiError.unauthorized('That code was already used. Start again with a fresh code.');
  const refresh = await issueRefreshToken(user.id, context);
  return {
    auth: await toAuthPayload({ id: user.id, roleId: user.roleId }, user.toPublic(), refresh.sessionId),
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  };
}

export { issueChallenge };
