import type { Request, Response } from 'express';
import { validatedQuery } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireScope } from '../middleware/scope.js';
import { sendData, sendList } from '../utils/response.js';
import * as alertService from '../services/alert.service.js';
import { recordAudit } from '../services/audit.service.js';
import type { AlertListQuery, CreateAlertInput } from '../validators/alert.validator.js';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<AlertListQuery>(res);
  const { items, meta } = await alertService.listAlerts(requireScope(req), query);
  sendList(res, items, meta);
});

export const stats = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await alertService.getAlertStats());
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await alertService.getAlert(requireScope(req), req.params.id as string));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const alert = await alertService.createAlert(req.body as CreateAlertInput);
  recordAudit(req, { action: 'alert.create', target: alert._id, category: 'Alerts' });
  sendData(res, alert, 201);
});

/** One handler per transition — the URL names the intent, which keeps the
 *  audit trail readable and the client calls self-documenting. */
function transition(next: 'Acknowledged' | 'Escalated' | 'Resolved', action: string) {
  return asyncHandler(async (req: Request, res: Response) => {
    const actor = req.auth?.user.name ?? 'system';
    const id = req.params.id as string;
    const { note } = (req.body ?? {}) as { note?: string };

    const alert = await alertService.transitionAlert(id, next, actor, note);

    recordAudit(req, { action, target: id, category: 'Alerts' });
    sendData(res, alert);
  });
}

export const acknowledge = transition('Acknowledged', 'alert.acknowledge');
export const escalate = transition('Escalated', 'alert.escalate');
export const resolve = transition('Resolved', 'alert.resolve');

export const assign = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.auth?.user.name ?? 'system';
  const id = req.params.id as string;
  const { assignee } = req.body as { assignee: string };

  const alert = await alertService.assignAlert(id, assignee, actor);

  recordAudit(req, { action: 'alert.assign', target: id, category: 'Alerts', metadata: { assignee } });
  sendData(res, alert);
});

export const acknowledgeMany = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.auth?.user.name ?? 'system';
  const { ids } = req.body as { ids: string[] };

  const modified = await alertService.acknowledgeMany(ids, actor);

  recordAudit(req, { action: 'alert.acknowledge_bulk', target: ids.join(','), category: 'Alerts', metadata: { count: modified } });
  sendData(res, { acknowledged: modified });
});
