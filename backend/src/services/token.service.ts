import { createHash, randomBytes } from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type { RoleId, UserSession } from '@access-genie/shared';
import { env } from '../config/env.js';
import { RefreshToken, User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

export interface AccessTokenClaims extends JwtPayload {
  sub: string;
  roleId: RoleId;
  /** Token type, so a refresh token can never be replayed as an access token. */
  typ: 'access';
  sid: string;
}

/** Refresh tokens are opaque random strings, not JWTs — see issueRefreshToken. */
const REFRESH_BYTES = 48;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Parse `15m` / `7d` / `900` into seconds. */
export function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])?$/.exec(ttl.trim());
  if (!match) throw new Error(`Invalid TTL: ${ttl}`);
  const value = Number(match[1]);
  const unit = match[2] ?? 's';
  const multiplier = { s: 1, m: 60, h: 3600, d: 86_400 }[unit] ?? 1;
  return value * multiplier;
}

export function signAccessToken(userId: string, roleId: RoleId, sessionId: string): { token: string; expiresIn: number } {
  const expiresIn = ttlToSeconds(env.JWT_ACCESS_TTL);
  const options: SignOptions = { expiresIn, issuer: 'access-genie', audience: 'access-genie-web' };
  const token = jwt.sign({ sub: userId, roleId, typ: 'access', sid: sessionId }, env.JWT_ACCESS_SECRET, options);
  return { token, expiresIn };
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'access-genie',
      audience: 'access-genie-web',
      algorithms: ['HS256'],
    }) as AccessTokenClaims;

    if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string' || !/^[a-f0-9]{24}$/.test(claims.sid)) throw ApiError.unauthorized('Session must be renewed');
    if (claims.typ !== 'access') throw ApiError.unauthorized('Wrong token type');
    return claims;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw ApiError.tokenExpired();
    if (err instanceof ApiError) throw err;
    throw ApiError.unauthorized('Invalid access token');
  }
}

/**
 * Mint a refresh token.
 *
 * It is a random opaque string rather than a JWT: a refresh token's whole job
 * is to be revocable, and revocation means a database lookup anyway — so there
 * is nothing to gain from making it self-describing, and something to lose
 * (a stolen JWT stays readable). Only the SHA-256 is stored.
 */
export async function issueRefreshToken(
  userId: string,
  context: { userAgent?: string; ip?: string } = {},
): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const token = randomBytes(REFRESH_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlToSeconds(env.JWT_REFRESH_TTL) * 1000);

  const record = await RefreshToken.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent: context.userAgent,
    ip: context.ip,
  });

  return { token, expiresAt, sessionId: String(record._id) };
}

/**
 * Verify a refresh token and rotate it: the presented token is revoked and a
 * fresh one issued in the same step. A token that is presented twice is either
 * a race or a theft — either way the safe response is to reject it, which
 * falls out of `revokedAt` already being set.
 */
export async function rotateRefreshToken(
  token: string, context: { userAgent?: string; ip?: string } = {},
): Promise<{ userId: string; token: string; expiresAt: Date; sessionId: string }> {
  const next = randomBytes(REFRESH_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlToSeconds(env.JWT_REFRESH_TTL) * 1000);
  // Atomic compare-and-swap: only one caller can consume the current hash.
  // The document ID remains stable for access-token revocation and device lists.
  const record = await RefreshToken.findOneAndUpdate({ tokenHash: hashToken(token),
    revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, {
    $set: { tokenHash: hashToken(next), expiresAt, ...context },
    $push: { previousHashes: { $each: [hashToken(token)], $slice: -8 } },
  }, { new: true });
  if (!record) throw ApiError.unauthorized('Refresh token is expired, used or revoked');
  return { userId: record.userId, token: next, expiresAt, sessionId: String(record._id) };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  // A logout racing a rotation must still end that session.
  await RefreshToken.updateOne({ $or: [{ tokenHash: hashToken(token) }, { previousHashes: hashToken(token) }],
    revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
}

/** Log out every device for a user. */
export async function revokeAllForUser(userId: string): Promise<number> {
  await User.updateOne({ _id: userId }, { $inc: { authVersion: 1 } });
  const result = await RefreshToken.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
  return result.modifiedCount;
}

/**
 * The user's live sessions, derived from their un-revoked refresh tokens.
 *
 * The device string is parsed from the stored user agent rather than kept as a
 * separate field: the user agent is what was actually presented, and a friendly
 * label derived from it cannot drift away from the truth.
 */
export async function listSessions(userId: string, currentToken?: string): Promise<UserSession[]> {
  const rows = await RefreshToken.find({
    userId,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  })
    .sort({ updatedAt: -1 })
    .lean();

  const currentHash = currentToken ? hashToken(currentToken) : null;

  return rows.map((r) => ({
    id: String(r._id),
    device: describeAgent(r.userAgent),
    // Geo-IP is not wired up; showing the address is honest, inventing a city is not.
    location: r.ip ?? 'Unknown',
    lastActive: (r.updatedAt ?? r.createdAt).toISOString(),
    current: currentHash !== null && r.tokenHash === currentHash,
  }));
}

/** "Chrome · macOS" from a user-agent string. */
function describeAgent(ua?: string): string {
  if (!ua) return 'Unknown device';

  const browser =
    /Edg\//.test(ua) ? 'Edge'
      : /OPR\//.test(ua) ? 'Opera'
        : /Chrome\//.test(ua) ? 'Chrome'
          : /Safari\//.test(ua) ? 'Safari'
            : /Firefox\//.test(ua) ? 'Firefox'
              : 'Browser';

  const os =
    /Windows/.test(ua) ? 'Windows'
      : /Macintosh|Mac OS/.test(ua) ? 'macOS'
        : /iPhone|iPad/.test(ua) ? 'iOS'
          : /Android/.test(ua) ? 'Android'
            : /Linux/.test(ua) ? 'Linux'
              : 'Unknown OS';

  return `${browser} · ${os}`;
}

/** Sign one other device out. The caller's own session is refused by the route. */
export async function revokeSession(userId: string, sessionId: string): Promise<boolean> {
  const result = await RefreshToken.updateOne(
    { _id: sessionId, userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
  return result.modifiedCount > 0;
}
