import type { Request, Response } from 'express';
import type { WorkOrderStatus } from '@access-genie/shared';
import { validatedQuery } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData, sendList } from '../utils/response.js';
import * as workOrderService from '../services/workOrder.service.js';
import { recordAudit } from '../services/audit.service.js';
import type { CreateWorkOrderInput, UpdateWorkOrderInput, WorkOrderListQuery } from '../validators/workOrder.validator.js';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const query = validatedQuery<WorkOrderListQuery>(res);
  const { items, meta } = await workOrderService.listWorkOrders(query);
  sendList(res, items, meta);
});

export const stats = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await workOrderService.getWorkOrderStats());
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await workOrderService.getWorkOrder(req.params.id as string));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.auth?.user.name ?? 'system';
  const workOrder = await workOrderService.createWorkOrder(req.body as CreateWorkOrderInput, actor);

  recordAudit(req, { action: 'work_order.create', target: workOrder._id, category: 'Maintenance' });
  sendData(res, workOrder, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const workOrder = await workOrderService.updateWorkOrder(id, req.body as UpdateWorkOrderInput);

  recordAudit(req, { action: 'work_order.update', target: id, category: 'Maintenance' });
  sendData(res, workOrder);
});

/** Status transitions get their own endpoint — they are audited state changes,
 *  not a field edit. */
export const changeStatus = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.auth?.user.name ?? 'system';
  const id = req.params.id as string;
  const { status, note } = req.body as { status: WorkOrderStatus; note?: string };

  const workOrder = await workOrderService.changeWorkOrderStatus(id, status, actor, note);

  recordAudit(req, { action: 'work_order.status', target: id, category: 'Maintenance', metadata: { status } });
  sendData(res, workOrder);
});

export const comment = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.auth?.user.name ?? 'system';
  const { text } = req.body as { text: string };
  sendData(res, await workOrderService.addComment(req.params.id as string, actor, text), 201);
});

export const logLabor = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.auth?.user.name ?? 'system';
  const { hours, note } = req.body as { hours: number; note: string };
  sendData(res, await workOrderService.logLabor(req.params.id as string, actor, hours, note), 201);
});

export const toggleChecklist = asyncHandler(async (req: Request, res: Response) => {
  const { index, done } = req.body as { index: number; done: boolean };
  sendData(res, await workOrderService.toggleChecklistItem(req.params.id as string, index, done));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await workOrderService.deleteWorkOrder(id);

  recordAudit(req, { action: 'work_order.delete', target: id, category: 'Maintenance' });
  res.status(204).send();
});
