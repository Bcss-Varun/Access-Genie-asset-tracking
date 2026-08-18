import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/compliance.service.js';

/** Compliance writes. Every one is audited — these records are the evidence. */

const audit = (req: Request, action: string, target: string) =>
  recordAudit(req, { action, target, category: 'Compliance' });

// Inspection handlers moved to controllers/inspection.controller.ts.

export const createCertification = asyncHandler(async (req: Request, res: Response) => {
  const created = await service.createCertification(req.body);
  audit(req, 'certification.create', created._id);
  sendData(res, created, 201);
});
export const updateCertification = asyncHandler(async (req: Request, res: Response) => {
  const updated = await service.updateCertification(req.params.id as string, req.body);
  audit(req, 'certification.update', req.params.id as string);
  sendData(res, updated);
});
export const removeCertification = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteCertification(req.params.id as string);
  audit(req, 'certification.delete', req.params.id as string);
  res.status(204).end();
});

export const createCycleCount = asyncHandler(async (req: Request, res: Response) => {
  const created = await service.createCycleCount(req.body);
  audit(req, 'cycle_count.create', created._id);
  sendData(res, created, 201);
});
export const updateCycleCount = asyncHandler(async (req: Request, res: Response) => {
  const updated = await service.updateCycleCount(req.params.id as string, req.body);
  audit(req, 'cycle_count.update', req.params.id as string);
  sendData(res, updated);
});
export const removeCycleCount = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteCycleCount(req.params.id as string);
  audit(req, 'cycle_count.delete', req.params.id as string);
  res.status(204).end();
});
