import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData, sendList } from '../utils/response.js';
import { validatedQuery } from '../middleware/validate.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/labelling.service.js';
import type {
  CreateDeviceInput,
  CreatePrintJobInput,
  CreateTemplateInput,
  PrintJobQuery,
  UpdateTemplateInput,
} from '../validators/labelling.validator.js';

/** The signed-in user's name, recorded on templates and jobs as their author. */
function actorOf(req: Request): string {
  if (!req.auth) throw ApiError.unauthorized();
  return req.auth.user.name;
}

// ── Templates ────────────────────────────────────────────────────────────────
export const createTemplate = asyncHandler(async (req: Request, res: Response) => {
  const created = await service.createTemplate(req.body as CreateTemplateInput, actorOf(req));
  recordAudit(req, { action: 'label_template.create', target: created._id, category: 'Configuration' });
  sendData(res, created, 201);
});

export const updateTemplate = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const updated = await service.updateTemplate(id, req.body as UpdateTemplateInput, actorOf(req));
  recordAudit(req, { action: 'label_template.update', target: id, category: 'Configuration' });
  sendData(res, updated);
});

export const deleteTemplate = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await service.deleteTemplate(id);
  recordAudit(req, { action: 'label_template.delete', target: id, category: 'Configuration' });
  res.status(204).end();
});

// ── Jobs ─────────────────────────────────────────────────────────────────────
export const listJobs = asyncHandler(async (_req: Request, res: Response) => {
  const { items, meta } = await service.listJobs(validatedQuery<PrintJobQuery>(res));
  sendList(res, items, meta);
});

export const createJob = asyncHandler(async (req: Request, res: Response) => {
  const job = await service.createJob(req.body as CreatePrintJobInput, actorOf(req));
  recordAudit(req, { action: 'print_job.create', target: job._id, category: 'Asset' });
  sendData(res, job, 201);
});

export const cancelJob = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const job = await service.cancelJob(id);
  recordAudit(req, { action: 'print_job.cancel', target: id, category: 'Asset' });
  sendData(res, job);
});

export const retryJob = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const job = await service.retryJob(id);
  recordAudit(req, { action: 'print_job.retry', target: id, category: 'Asset' });
  sendData(res, job);
});

export const createDevice = asyncHandler(async (req: Request, res: Response) => {
  const created = await service.createDevice(req.body as CreateDeviceInput);
  recordAudit(req, { action: 'print_device.create', target: created._id, category: 'Configuration' });
  sendData(res, created, 201);
});
