import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { sendData, sendList } from '../utils/response.js';
import { requireScope } from '../middleware/scope.js';
import { validatedQuery } from '../middleware/validate.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/complianceRecord.service.js';
import type {
  CreateComplianceRecordInput,
  ResolveComplianceRecordInput,
  UpdateComplianceRecordInput,
} from '../validators/complianceRecord.validator.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<service.ComplianceRecordQuery>(res);
  const { items, meta } = await service.listComplianceRecords(requireScope(req), query);
  sendList(res, items, meta);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const record = await service.getComplianceRecord(requireScope(req), req.params.id as string);
  sendData(res, record);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  const record = await service.createComplianceRecord(
    requireScope(req),
    req.body as CreateComplianceRecordInput,
    req.auth.user.email,
  );
  recordAudit(req, { action: 'compliance_record.create', target: record._id, category: 'Compliance' });
  sendData(res, record, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const record = await service.updateComplianceRecord(
    requireScope(req),
    req.params.id as string,
    req.body as UpdateComplianceRecordInput,
  );
  recordAudit(req, { action: 'compliance_record.update', target: record._id, category: 'Compliance' });
  sendData(res, record);
});

export const resolve = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  const record = await service.resolveComplianceRecord(
    requireScope(req),
    req.params.id as string,
    req.body as ResolveComplianceRecordInput,
    req.auth.user.email,
  );
  recordAudit(req, { action: 'compliance_record.resolve', target: record._id, category: 'Compliance' });
  sendData(res, record);
});
