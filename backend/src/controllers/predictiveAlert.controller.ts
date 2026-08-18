import type { Request, Response } from 'express';
import { validatedQuery } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireScope } from '../middleware/scope.js';
import { sendData, sendList } from '../utils/response.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/predictiveAlert.service.js';
import type {
  CreatePredictiveAlertInput,
  DismissPredictiveAlertInput,
  PredictiveAlertListQuery,
  RaisePredictiveWorkOrderInput,
} from '../validators/predictiveAlert.validator.js';

/** The caller's name is the actor on every audited write in this module. */
const actorOf = (req: Request): string => req.auth?.user.name ?? 'system';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<PredictiveAlertListQuery>(res);
  const { items, meta } = await service.listPredictiveAlerts(requireScope(req), query);
  sendList(res, items, meta);
});

export const stats = asyncHandler(async (req: Request, res: Response) => {
  // Same filters as the list, so the summary cards describe the cut on screen
  // rather than the whole estate.
  const query = validatedQuery<PredictiveAlertListQuery>(res);
  sendData(res, await service.getPredictiveAlertStats(requireScope(req), query));
});

export const facets = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await service.getPredictiveAlertFacets());
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await service.getPredictiveAlert(req.params.id as string));
});

/** The alert, its asset, the orders it raised and the asset's other alerts. */
export const detail = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await service.getPredictiveAlertDetail(req.params.id as string));
});

/**
 * Ingestion.
 *
 * The same endpoint for a person raising an alert and for a predictive engine
 * posting one — `source` and `detector` are what distinguish them, and the
 * service refuses the combinations that would misattribute either.
 */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const alert = await service.createPredictiveAlert(req.body as CreatePredictiveAlertInput, actorOf(req));
  recordAudit(req, {
    action: 'predictive_alert.create',
    target: alert._id,
    category: 'Maintenance',
    metadata: { source: alert.source, confidence: alert.confidence, asset: alert.assetId },
  });
  sendData(res, alert, 201);
});

export const acknowledge = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { note } = (req.body ?? {}) as { note?: string };
  const alert = await service.acknowledgePredictiveAlert(id, actorOf(req), note);
  recordAudit(req, { action: 'predictive_alert.acknowledge', target: id, category: 'Maintenance' });
  sendData(res, alert);
});

export const dismiss = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { reason } = req.body as DismissPredictiveAlertInput;
  const alert = await service.dismissPredictiveAlert(id, actorOf(req), reason);
  recordAudit(req, { action: 'predictive_alert.dismiss', target: id, category: 'Maintenance', metadata: { reason } });
  sendData(res, alert);
});

export const reopen = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { note } = (req.body ?? {}) as { note?: string };
  const alert = await service.reopenPredictiveAlert(id, actorOf(req), note);
  recordAudit(req, { action: 'predictive_alert.reopen', target: id, category: 'Maintenance' });
  sendData(res, alert);
});

export const resolve = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { note } = (req.body ?? {}) as { note?: string };
  const alert = await service.resolvePredictiveAlert(id, actorOf(req), note);
  recordAudit(req, { action: 'predictive_alert.resolve', target: id, category: 'Maintenance' });
  sendData(res, alert);
});

/**
 * Raise a real work order.
 *
 * 200 rather than 201 when an existing open order is returned: nothing was
 * created, and answering 201 would tell a retrying client it had made a second
 * one.
 */
export const raiseWorkOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = await service.raiseWorkOrderFromAlert(requireScope(req), id, req.body as RaisePredictiveWorkOrderInput, actorOf(req));

  if (!result.reused) {
    recordAudit(req, {
      action: 'predictive_alert.raise_work_order',
      target: id,
      category: 'Maintenance',
      metadata: { workOrder: result.workOrderId },
    });
  }

  sendData(res, result, result.reused ? 200 : 201);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await service.deletePredictiveAlert(id);
  recordAudit(req, { action: 'predictive_alert.delete', target: id, category: 'Maintenance' });
  res.status(204).send();
});
