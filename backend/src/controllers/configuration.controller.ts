import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/configuration.service.js';

/** The signed-in user. Records that belong to a person are keyed by this, not by role. */
function actorOf(req: Request): { id: string; name: string } {
  const user = req.auth?.user;
  if (!user) throw ApiError.unauthorized('Not signed in');
  return { id: user.id, name: user.name };
}

// ── Report subscriptions, runs and downloads ─────────────────────────────────
// Removed. All four moved to `analytics.controller.ts`, where a schedule is a
// standing instruction against a saved report and a run executes that report's
// definition rather than a query keyed on its category. Exports are streamed in
// the response now instead of being stored as an artifact and fetched back —
// the two-step version left rows in the export list with no file behind them.

// ── Organisation settings ────────────────────────────────────────────────────
export const getOrgSettings = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await service.getOrgSettings());
});

export const updateOrgSettings = asyncHandler(async (req: Request, res: Response) => {
  const updated = await service.updateOrgSettings(req.body);
  recordAudit(req, { action: 'org_settings.update', category: 'Configuration', target: 'ORG' });
  sendData(res, updated);
});

// ── Passkeys ─────────────────────────────────────────────────────────────────
export const createPasskey = asyncHandler(async (req: Request, res: Response) => {
  const created = await service.createPasskey(req.body, actorOf(req).id);
  recordAudit(req, { action: 'passkey.create', category: 'Security', target: created._id });
  sendData(res, created, 201);
});

export const removePasskey = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await service.deletePasskey(id, actorOf(req).id);
  recordAudit(req, { action: 'passkey.delete', category: 'Security', target: id });
  res.status(204).end();
});

// ── Backups ──────────────────────────────────────────────────────────────────
export const createBackup = asyncHandler(async (req: Request, res: Response) => {
  const created = await service.createBackup();
  recordAudit(req, { action: 'backup.create', category: 'Data', target: created._id });
  sendData(res, created, 201);
});

export const restoreBackup = asyncHandler(async (req: Request, _res: Response) => {
  // Always throws — see the service for why a restore is refused rather than faked.
  await service.requestRestore(req.params.id as string);
});

// ── Checklist templates ──────────────────────────────────────────────────────
// The checklist library is served by inspection.controller.ts now, at
// `/inspection-templates`.

// ── Webhooks ─────────────────────────────────────────────────────────────────
export const testWebhook = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await service.testWebhook(id);
  recordAudit(req, { action: 'webhook.test', category: 'Configuration', target: id, metadata: { ok: result.ok } });
  sendData(res, result);
});
