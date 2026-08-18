import type { Request, Response } from 'express';
import type { InspectionType } from '@access-genie/shared';
import { validatedQuery } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireScope } from '../middleware/scope.js';
import { sendData, sendList } from '../utils/response.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/inspection.service.js';
import type {
  CreateInspectionInput,
  CreateInspectionTemplateInput,
  InspectionListQuery,
  RespondInput,
  TemplateListQuery,
  UpdateInspectionTemplateInput,
} from '../validators/inspection.validator.js';

/** The caller's name is the actor on every audited write in this module. */
const actorOf = (req: Request): string => req.auth?.user.name ?? 'system';

// ── Templates ────────────────────────────────────────────────────────────────

export const listTemplates = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<TemplateListQuery>(res);
  const { items, meta } = await service.listTemplates(query);
  sendList(res, items, meta);
});

export const getTemplate = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await service.getTemplate(req.params.id as string));
});

/** Which assets a template's scope resolves to — the schedule-from-template picker. */
export const templateAssets = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await service.templateAssets(req.params.id as string));
});

export const createTemplate = asyncHandler(async (req: Request, res: Response) => {
  const template = await service.createTemplate(req.body as CreateInspectionTemplateInput, actorOf(req));
  recordAudit(req, { action: 'inspection_template.create', target: template._id, category: 'Maintenance' });
  sendData(res, template, 201);
});

export const updateTemplate = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const template = await service.updateTemplate(id, req.body as UpdateInspectionTemplateInput, actorOf(req));
  recordAudit(req, { action: 'inspection_template.update', target: id, category: 'Maintenance' });
  sendData(res, template);
});

/**
 * Retire or delete.
 *
 * A template with inspections behind it is deactivated rather than removed, so
 * the response says which happened instead of both answering 204 — the caller
 * needs to tell "gone" from "retired" to know what to show next.
 */
export const removeTemplate = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await service.deleteTemplate(id);
  recordAudit(req, {
    action: result.deleted ? 'inspection_template.delete' : 'inspection_template.deactivate',
    target: id,
    category: 'Maintenance',
  });
  sendData(res, result);
});

// ── Records ──────────────────────────────────────────────────────────────────

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<InspectionListQuery>(res);
  const { items, meta } = await service.listInspections(requireScope(req), query);
  sendList(res, items, meta);
});

export const stats = asyncHandler(async (req: Request, res: Response) => {
  // Same filters as the list, so the summary cards describe the cut on screen
  // rather than the whole estate.
  const query = validatedQuery<InspectionListQuery>(res);
  sendData(res, await service.getInspectionStats(requireScope(req), query));
});

export const facets = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await service.getInspectionFacets());
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await service.getInspection(req.params.id as string));
});

export const failures = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await service.getInspectionFailures(req.params.id as string));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const inspection = await service.createInspection(req.body as CreateInspectionInput, actorOf(req));
  recordAudit(req, { action: 'inspection.create', target: inspection._id, category: 'Maintenance' });
  sendData(res, inspection, 201);
});

export const createBulk = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { templateId: string; assetIds: string[]; scheduledFor: string; assignedTo?: string; type?: InspectionType };
  const result = await service.createInspectionsBulk(body, actorOf(req));
  recordAudit(req, {
    action: 'inspection.create_bulk',
    target: body.templateId,
    category: 'Maintenance',
    metadata: { created: result.created.length, failed: result.failed.length },
  });
  // 201 only when something was actually created; a batch where every asset was
  // rejected is not a creation, and answering 201 would say it was.
  sendData(res, result, result.created.length > 0 ? 201 : 200);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const inspection = await service.updateInspection(id, req.body as Record<string, never>, actorOf(req));
  recordAudit(req, { action: 'inspection.update', target: id, category: 'Maintenance' });
  sendData(res, inspection);
});

export const assign = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { assignedTo } = req.body as { assignedTo: string };
  const inspection = await service.assignInspection(id, assignedTo, actorOf(req));
  recordAudit(req, { action: 'inspection.assign', target: id, category: 'Maintenance', metadata: { assignedTo } });
  sendData(res, inspection);
});

export const start = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const inspection = await service.startInspection(id, actorOf(req));
  recordAudit(req, { action: 'inspection.start', target: id, category: 'Maintenance' });
  sendData(res, inspection);
});

export const respond = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await service.respond(req.params.id as string, req.body as RespondInput, actorOf(req)));
});

export const complete = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const inspection = await service.completeInspection(id, req.body as { notes?: string; performedBy?: string }, actorOf(req));
  recordAudit(req, {
    action: 'inspection.complete',
    target: id,
    category: 'Maintenance',
    metadata: { outcome: inspection.status },
  });
  sendData(res, inspection);
});

/** Raise corrective work for one failed checkpoint. */
export const raiseCorrective = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const key = req.params.key as string;
  const result = await service.raiseCorrectiveWorkOrder(id, key, req.body as Record<string, never>, actorOf(req));
  recordAudit(req, {
    action: 'inspection.raise_corrective',
    target: id,
    category: 'Maintenance',
    metadata: { checkpoint: key, workOrder: result.workOrderId },
  });
  sendData(res, result, 201);
});

/** Raise corrective work for every failure that does not have one yet. */
export const raiseAllCorrective = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await service.raiseAllCorrectiveWorkOrders(id, req.body as Record<string, never>, actorOf(req));
  recordAudit(req, {
    action: 'inspection.raise_corrective_all',
    target: id,
    category: 'Maintenance',
    metadata: { raised: result.workOrderIds.length },
  });
  sendData(res, result, result.workOrderIds.length > 0 ? 201 : 200);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await service.deleteInspection(id);
  recordAudit(req, { action: 'inspection.delete', target: id, category: 'Maintenance' });
  res.status(204).send();
});
