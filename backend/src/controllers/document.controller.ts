import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireScope } from '../middleware/scope.js';
import { sendData } from '../utils/response.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/document.service.js';
import type { UploadDocumentInput } from '../validators/document.validator.js';

const actorOf = (req: Request): string => req.auth?.user.name ?? 'System';

export const upload = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UploadDocumentInput;
  const created = await service.uploadDocument(requireScope(req), body, actorOf(req));
  recordAudit(req, {
    action: 'document.upload',
    target: created._id,
    category: 'Asset',
    // The bytes are deliberately not in the metadata — the audit log is read
    // often and in bulk, and it only needs to say what was attached to what.
    metadata: { assetId: created.assetId, type: created.type, sizeKb: created.sizeKb },
  });
  sendData(res, created, 201);
});

export const download = asyncHandler(async (req: Request, res: Response) => {
  const { name, mimeType, body } = await service.documentContent(requireScope(req), req.params.id as string);
  res.setHeader('Content-Type', mimeType);
  // `attachment` rather than `inline`: these are arbitrary uploaded files, and
  // rendering one in the origin's own context is how a stored HTML or SVG
  // upload turns into script running against the signed-in session.
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`);
  res.setHeader('Content-Length', String(body.length));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(body);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await service.deleteDocument(requireScope(req), id, actorOf(req));
  recordAudit(req, { action: 'document.delete', target: id, category: 'Asset' });
  sendData(res, { id });
});
