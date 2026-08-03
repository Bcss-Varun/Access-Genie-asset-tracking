import { createHash, randomBytes } from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type { RoleId } from '@access-genie/shared';
import { env } from '../config/env.js';
import { RefreshToken } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

export interface AccessTokenClaims extends JwtPayload {
  sub: string;
  roleId: RoleId;
  /** Token type, so a refresh token can never be replayed as an access token. */
  typ: 'access';
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

export function signAccessToken(userId: string, roleId: RoleId): { token: string; expiresIn: number } {
  const expiresIn = ttlToSeconds(env.JWT_ACCESS_TTL);
  const options: SignOptions = { expiresIn, issuer: 'access-genie', audience: 'access-genie-web' };
  const token = jwt.sign({ sub: userId, roleId, typ: 'access' }, env.JWT_ACCESS_SECRET, options);
  return { token, expiresIn };
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'access-genie',
      audience: 'access-genie-web',
    }) as AccessTokenClaims;

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
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(REFRESH_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlToSeconds(env.JWT_REFRESH_TTL) * 1000);

  await RefreshToken.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent: context.userAgent,
    ip: context.ip,
  });

  return { token, expiresAt };
}

/**
 * Verify a refresh token and rotate it: the presented token is revoked and a
 * fresh one issued in the same step. A token that is presented twice is either
 * a race or a theft — either way the safe response is to reject it, which
 * falls out of `revokedAt` already being set.
 */
export async function rotateRefreshToken(
  token: string,
  context: { userAgent?: string; ip?: string } = {},
): Promise<{ userId: string; token: string; expiresAt: Date }> {
  const tokenHash = hashToken(token);
  const record = await RefreshToken.findOne({ tokenHash });

  if (!record) throw ApiError.unauthorized('Invalid refresh token');
  if (record.revokedAt) throw ApiError.unauthorized('Refresh token has been used or revoked');
  if (record.expiresAt.getTime() < Date.now()) throw ApiError.unauthorized('Refresh token expired');

  const next = await issueRefreshToken(record.userId, context);

  record.revokedAt = new Date();
  record.replacedByHash = hashToken(next.token);
  await record.save();

  return { userId: record.userId, ...next };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await RefreshToken.updateOne(
    { tokenHash: hashToken(token), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

/** Log out every device for a user. */
export async function revokeAllForUser(userId: string): Promise<number> {
  const result = await RefreshToken.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
  return result.modifiedCount;
}
