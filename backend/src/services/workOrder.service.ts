import type { FilterQuery } from 'mongoose';
import type { ApiMeta, WorkOrderStatus } from '@access-genie/shared';
import { Activity, Asset, WorkOrder, nextId, type WorkOrderDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import { consumeParts } from './inventory.service.js';
import { markEstateChanged } from './derivation.scheduler.js';
import { csvFilter, escapeRegex, paginate, parsePagination } from '../utils/query.js';
import type { CreateWorkOrderInput, UpdateWorkOrderInput, WorkOrderListQuery } from '../validators/workOrder.validator.js';

const SORTABLE = ['dueDate', 'priority', 'status', 'createdAt', 'updatedAt', 'estimatedHours'];

/** A work order is "open" until it is completed. */
export const OPEN_WO_STATUSES: WorkOrderStatus[] = ['New', 'Assigned', 'In Progress', 'On Hold'];

function buildFilter(query: WorkOrderListQuery): FilterQuery<WorkOrderDoc> {
  const filter: FilterQuery<WorkOrderDoc> = {};

  const status = csvFilter(query.status);
  if (status) filter.status = status;

  const priority = csvFilter(query.priority);
  if (priority) filter.priority = priority;

  const type = csvFilter(query.type);
  if (type) filter.type = type;

  if (query.assetId) filter.assetId = query.assetId;
  if (query.assignedTo) filter.assignedTo = query.assignedTo;
  if (query.aiGenerated !== undefined) filter.aiGenerated = query.aiGenerated;

  if (query.overdue) {
    filter.dueDate = { $lt: new Date() };
    filter.status = { $in: OPEN_WO_STATUSES };
  }

  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ title: rx }, { description: rx }, { assetName: rx }, { _id: rx }];
  }

  return filter;
}

export async function listWorkOrders(query: WorkOrderListQuery): Promise<{ items: WorkOrderDoc[]; meta: ApiMeta }> {
  const pagination = parsePagination(query, SORTABLE, 'dueDate');
  return paginate(WorkOrder, buildFilter(query), pagination);
}

export async function getWorkOrder(id: string): Promise<WorkOrderDoc> {
  const workOrder = await WorkOrder.findById(id).lean<WorkOrderDoc>();
  if (!workOrder) throw ApiError.notFound('Work order');
  return workOrder;
}

export async function createWorkOrder(input: CreateWorkOrderInput, actor: string): Promise<WorkOrderDoc> {
  // The asset must exist: a work order against a non-existent asset is a
  // dangling record nobody will ever action.
  const asset = await Asset.findById(input.assetId).lean();
  if (!asset) throw ApiError.badRequest(`Asset ${input.assetId} does not exist`);

  const id = await nextId('workOrder', 'WO');

  const workOrder = await WorkOrder.create({
    ...input,
    _id: id,
    assetName: asset.name,
    dueDate: new Date(input.dueDate),
  });

  await Activity.create({
    assetId: input.assetId,
    type: 'Maintenance',
    description: `Work order ${id} raised: ${input.title}`,
    actor,
    timestamp: new Date(),
  });

  return workOrder.toObject();
}

export async function updateWorkOrder(id: string, input: UpdateWorkOrderInput): Promise<WorkOrderDoc> {
  const workOrder = await WorkOrder.findById(id);
  if (!workOrder) throw ApiError.notFound('Work order');

  Object.assign(workOrder, {
    ...input,
    ...(input.dueDate ? { dueDate: new Date(input.dueDate) } : {}),
  });

  await workOrder.save();
  return workOrder.toObject();
}

/**
 * Move a work order through its lifecycle.
 *
 * The transition is checked against an explicit map rather than allowing any
 * status to follow any other — "Completed → New" is not a workflow, it is a
 * data-entry mistake, and reopening should raise a fresh work order.
 */
const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  New: ['Assigned', 'In Progress', 'On Hold'],
  Assigned: ['In Progress', 'On Hold', 'New'],
  'In Progress': ['On Hold', 'Completed'],
  'On Hold': ['In Progress', 'Assigned'],
  Completed: [],
};

export async function changeWorkOrderStatus(
  id: string,
  status: WorkOrderStatus,
  actor: string,
  note?: string,
): Promise<WorkOrderDoc> {
  const workOrder = await WorkOrder.findById(id);
  if (!workOrder) throw ApiError.notFound('Work order');

  if (workOrder.status === status) return workOrder.toObject();

  const allowed = ALLOWED_TRANSITIONS[workOrder.status];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(
      `Cannot move a work order from "${workOrder.status}" to "${status}"` +
        (allowed.length ? `. Allowed: ${allowed.join(', ')}` : '. This work order is closed.'),
    );
  }

  const previous = workOrder.status;
  workOrder.status = status;
  if (note) workOrder.comments.push({ author: actor, text: note, at: new Date() });
  if (status === 'Completed') workOrder.completedAt = new Date();
  await workOrder.save();

  await Activity.create({
    assetId: workOrder.assetId,
    type: 'Maintenance',
    description: `Work order ${id} moved from ${previous} to ${status}`,
    actor,
    timestamp: new Date(),
  });

  /*
   * Completing the work is what takes the parts off the shelf.
   *
   * Not when they are added to the order — a planner listing what a job will
   * need has not used anything yet, and decrementing then would make stock
   * wrong for every job that gets planned and cancelled. Completion is the
   * point at which the parts are known to be physically gone.
   *
   * Short stock is reported, not enforced: see consumeParts for why a
   * technician must always be able to close the job.
   */
  if (status === 'Completed' && workOrder.parts.length > 0) {
    const shortfalls = (
      await consumeParts(
        workOrder.parts.map((p) => ({ sku: p.sku, qty: p.qty })),
        `work order ${id}`,
      )
    ).filter((r) => r.shortfall);

    if (shortfalls.length > 0) {
      logger.warn('Work order consumed more stock than was recorded', {
        workOrder: id,
        shortfalls: shortfalls.map((s) => `${s.sku} short by ${s.shortfall}`).join(', '),
      });
    }
  }

  // Closing a corrective order changes the asset's health, and closing a PM
  // clears an overdue finding.
  markEstateChanged('work-order-status');

  return workOrder.toObject();
}

export async function addComment(id: string, author: string, text: string): Promise<WorkOrderDoc> {
  const workOrder = await WorkOrder.findByIdAndUpdate(
    id,
    { $push: { comments: { author, text, at: new Date() } } },
    { new: true },
  ).lean<WorkOrderDoc>();

  if (!workOrder) throw ApiError.notFound('Work order');
  return workOrder;
}

export async function logLabor(id: string, tech: string, hours: number, note: string): Promise<WorkOrderDoc> {
  const workOrder = await WorkOrder.findByIdAndUpdate(
    id,
    { $push: { laborLog: { tech, hours, note, at: new Date() } } },
    { new: true },
  ).lean<WorkOrderDoc>();

  if (!workOrder) throw ApiError.notFound('Work order');
  return workOrder;
}

export async function toggleChecklistItem(id: string, index: number, done: boolean): Promise<WorkOrderDoc> {
  const workOrder = await WorkOrder.findById(id);
  if (!workOrder) throw ApiError.notFound('Work order');

  const item = workOrder.checklist[index];
  if (!item) throw ApiError.notFound(`Checklist item ${index}`);

  item.done = done;
  await workOrder.save();
  return workOrder.toObject();
}

export async function deleteWorkOrder(id: string): Promise<void> {
  const result = await WorkOrder.findByIdAndDelete(id);
  if (!result) throw ApiError.notFound('Work order');
}

/** Board counters: the numbers on the maintenance page header. */
export async function getWorkOrderStats() {
  const now = new Date();

  const [byStatus, byPriority, overdue, aiGenerated, laborTotals] = await Promise.all([
    WorkOrder.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    WorkOrder.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
    WorkOrder.countDocuments({ dueDate: { $lt: now }, status: { $in: OPEN_WO_STATUSES } }),
    WorkOrder.countDocuments({ aiGenerated: true, status: { $in: OPEN_WO_STATUSES } }),
    WorkOrder.aggregate<{ _id: null; estimated: number }>([
      { $match: { status: { $in: OPEN_WO_STATUSES } } },
      { $group: { _id: null, estimated: { $sum: '$estimatedHours' } } },
    ]),
  ]);

  const open = byStatus.filter((s) => OPEN_WO_STATUSES.includes(s._id as WorkOrderStatus)).reduce((sum, s) => sum + s.count, 0);

  return {
    open,
    overdue,
    aiGenerated,
    completed: byStatus.find((s) => s._id === 'Completed')?.count ?? 0,
    estimatedHoursOpen: Math.round(laborTotals[0]?.estimated ?? 0),
    byStatus: byStatus.map((s) => ({ status: s._id, count: s.count })),
    byPriority: byPriority.map((p) => ({ priority: p._id, count: p.count })),
  };
}
