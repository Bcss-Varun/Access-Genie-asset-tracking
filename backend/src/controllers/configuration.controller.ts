import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildMeta, sendData, sendList } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/configuration.service.js';
import * as reportRun from '../services/reportRun.service.js';
import { ChecklistTemplate, ReportSubscription } from '../models/index.js';

/** These collections are small and bounded, so they are returned whole. */
const whole = <T>(res: Response, items: T[]) => sendList(res, items, buildMeta(1, items.length || 1, items.length));

/** The signed-in user. Records that belong to a person are keyed by this, not by role. */
function actorOf(req: Request): { id: string; name: string } {
  const user = req.auth?.user;
  if (!user) throw ApiError.unauthorized('Not signed in');
  return { id: user.id, name: user.name };
}

// ── Report subscriptions ─────────────────────────────────────────────────────
export const listSubscriptions = asyncHandler(async (_req: Request, res: Response) => {
  whole(res, await ReportSubscription.find().sort({ reportName: 1 }).lean());
});

export const createSubscription = asyncHandler(async (req: Request, res: Response) => {
  const created = await service.createSubscription(req.body, actorOf(req).name);
  recordAudit(req, { action: 'report_subscription.create', category: 'Analytics', target: created._id });
  sendData(res, created, 201);
});

export const updateSubscription = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const updated = await service.updateSubscription(id, req.body);
  recordAudit(req, { action: 'report_subscription.update', category: 'Analytics', target: id });
  sendData(res, updated);
});

export const removeSubscription = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await service.deleteSubscription(id);
  recordAudit(req, { action: 'report_subscription.delete', category: 'Analytics', target: id });
  res.status(204).end();
});

// ── Report runs and downloads ────────────────────────────────────────────────
export const runReport = asyncHandler(async (req: Request, res: Response) => {
  const format = typeof req.body?.format === 'string' ? req.body.format : undefined;
  const result = await reportRun.runReport(req.params.id as string, actorOf(req).name, format);
  recordAudit(req, { action: 'report.run', category: 'Analytics', target: result.job._id });
  sendData(res, result, 201);
});

/**
 * Stream a produced export.
 *
 * Sent as an attachment with its real filename, so the browser saves a file
 * rather than rendering CSV as a wall of text in a tab.
 */
export const downloadExport = asyncHandler(async (req: Request, res: Response) => {
  const artifact = await reportRun.readArtifact(req.params.id as string);
  res.setHeader('Content-Type', `${artifact.mime}; charset=utf-8`);
  res.setHeader('Content-Disposition', `attachment; filename="${artifact.filename}"`);
  res.send(artifact.body);
});

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
/**
 * The template library, with how often each has actually been used.
 *
 * Usage is joined on read rather than stored on the template: a counter
 * incremented on write drifts the moment an inspection is deleted, and the
 * number people care about is how many inspections reference this today.
 */
export const listChecklistTemplates = asyncHandler(async (_req: Request, res: Response) => {
  const [templates, usage] = await Promise.all([
    ChecklistTemplate.find().sort({ name: 1 }).lean(),
    service.templateUsage(),
  ]);
  whole(
    res,
    templates.map((t) => ({ ...t, usageCount: usage[t.name] ?? 0 })),
  );
});

// ── Webhooks ─────────────────────────────────────────────────────────────────
export const testWebhook = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await service.testWebhook(id);
  recordAudit(req, { action: 'webhook.test', category: 'Configuration', target: id, metadata: { ok: result.ok } });
  sendData(res, result);
});
