import type { Request, Response } from 'express';
import type { AuditStatus } from '@access-genie/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { sendData, sendList } from '../utils/response.js';
import { requireScope } from '../middleware/scope.js';
import { validatedQuery } from '../middleware/validate.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/auditCenter.service.js';
import type {
  AddEvidenceInput,
  CreateAuditInput,
  CreateFindingInput,
  UpdateAuditInput,
  UpdateFindingInput,
} from '../validators/audit.validator.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<service.AuditQuery>(res);
  const { items, meta } = await service.listAudits(requireScope(req), query);
  sendList(res, items, meta);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const audit = await service.getAudit(requireScope(req), req.params.id as string);
  sendData(res, audit);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  const audit = await service.createAudit(requireScope(req), req.body as CreateAuditInput, req.auth.user.email);
  recordAudit(req, { action: 'audit.create', target: audit._id, category: 'Compliance' });
  sendData(res, audit, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const audit = await service.updateAudit(requireScope(req), req.params.id as string, req.body as UpdateAuditInput);
  recordAudit(req, { action: 'audit.update', target: audit._id, category: 'Compliance' });
  sendData(res, audit);
});

export const transition = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body as { status: AuditStatus };
  const audit = await service.transitionAudit(requireScope(req), req.params.id as string, status);
  recordAudit(req, { action: 'audit.transition', target: audit._id, category: 'Compliance', metadata: { status } });
  sendData(res, audit);
});

export const listAllFindings = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<{
    page?: string;
    limit?: string;
    sort?: string;
    status?: string;
    severity?: string;
    assetId?: string;
  }>(res);
  const { items, meta } = await service.listFindingsAcrossAudits(requireScope(req), query);
  sendList(res, items, meta);
});

export const listFindings = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<{ page?: string; limit?: string; sort?: string; status?: string; severity?: string }>(
    res,
  );
  const { items, meta } = await service.listFindings(requireScope(req), req.params.auditId as string, query);
  sendList(res, items, meta);
});

export const createFinding = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  const finding = await service.createFinding(
    requireScope(req),
    req.params.auditId as string,
    req.body as CreateFindingInput,
    req.auth.user.email,
  );
  recordAudit(req, { action: 'audit_finding.create', target: finding._id, category: 'Compliance' });
  sendData(res, finding, 201);
});

export const updateFinding = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  const finding = await service.updateFinding(
    requireScope(req),
    req.params.auditId as string,
    req.params.findingId as string,
    req.body as UpdateFindingInput,
    req.auth.user.email,
  );
  recordAudit(req, { action: 'audit_finding.update', target: finding._id, category: 'Compliance' });
  sendData(res, finding);
});

export const addEvidence = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  const finding = await service.addEvidence(
    requireScope(req),
    req.params.auditId as string,
    req.params.findingId as string,
    req.body as AddEvidenceInput,
    req.auth.user.email,
  );
  recordAudit(req, { action: 'audit_finding.evidence', target: finding._id, category: 'Compliance' });
  sendData(res, finding, 201);
});
