import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { ApiKey } from '../models/index.js';
import { nextId } from '../models/Counter.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { sendData } from '../utils/response.js';
import { recordAudit } from '../services/audit.service.js';

/**
 * API key issuance.
 *
 * This does not go through the resource factory because creating a key is not
 * "insert the body": the secret is generated here, returned exactly once, and
 * never stored. The Administration screen used to fabricate a plausible-looking
 * string in the browser and put it in a toast, which meant the key it showed
 * could not have authenticated anything.
 *
 * Only the last four characters are kept, so the record can identify a key in a
 * list without a database dump handing anyone a working credential.
 */

/** `agk_live_` + 32 hex characters. Long enough that guessing is not a strategy. */
function mintSecret(): string {
  return `agk_live_${randomBytes(16).toString('hex')}`;
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  const { name, scope, scopes } = req.body as {
    name: string;
    scope: 'organization' | 'personal';
    scopes: string[];
  };

  // A personal token belongs to whoever is signed in; there is no route that
  // mints one on someone else's behalf.
  const ownerId = scope === 'personal' ? req.auth?.user.id : undefined;
  if (scope === 'personal' && !ownerId) throw ApiError.unauthorized();

  const secret = mintSecret();
  const _id = await nextId('apiKey', 'KEY');

  const created = await ApiKey.create({
    _id,
    name,
    scope,
    scopes,
    ownerId,
    last4: secret.slice(-4),
    createdAt: new Date(),
  });

  recordAudit(req, {
    action: 'api_key.create',
    target: _id,
    category: 'Security',
    metadata: { scope, scopes },
  });

  // `secret` is present on this response and on no other, ever. The client is
  // told to copy it now because there is no second chance to read it.
  sendData(res, { ...created.toJSON(), secret }, 201);
});

/**
 * Revoke, rather than delete.
 *
 * The key's calls are in the audit log, and a log referring to a credential
 * that no longer exists cannot be investigated. Revoking keeps the record and
 * makes it unusable — which is also what lets the screen show "revoked
 * yesterday" instead of the row silently vanishing.
 */
export const revoke = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const key = await ApiKey.findByIdAndUpdate(id, { $set: { revokedAt: new Date() } }, { new: true }).lean();
  if (!key) throw ApiError.notFound('API key');

  recordAudit(req, { action: 'api_key.revoke', target: id, category: 'Security' });
  sendData(res, key);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const key = await ApiKey.findByIdAndUpdate(id, { $set: req.body as object }, { new: true, runValidators: true }).lean();
  if (!key) throw ApiError.notFound('API key');

  recordAudit(req, { action: 'api_key.update', target: id, category: 'Security' });
  sendData(res, key);
});
