import { z } from 'zod';
import {
  ACTIVE_WORK_ORDER_SOURCES,
  ACTIVE_WORK_ORDER_TYPES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
} from '@access-genie/shared';
import { blankToUndefined, csvString, isoDateString, listQuerySchema, partialUpdate } from './common.js';

/**
 * Work-order validation.
 *
 * The one rule worth stating: **writes are checked against the active
 * type/source lists, reads are not.** `ACTIVE_WORK_ORDER_TYPES` omits
 * `Predictive` and `ACTIVE_WORK_ORDER_SOURCES` omits everything but Manual,
 * Scheduled Maintenance and Inspection Failure, so nothing can create or edit
 * an order into a parked origin — while the list filters below still accept the
 * full vocabulary, because records carrying the parked values exist and have to
 * remain findable. Narrowing what can be written without narrowing what can be
 * read is what makes this reversible.
 */

export const workOrderListQuerySchema = listQuerySchema.extend({
  // CSV, and deliberately *not* enum-checked: an unrecognised member is dropped
  // by the service rather than refused, so a stale bookmark still renders a
  // list instead of an error. See `csvEnum` in the service.
  status: csvString,
  priority: csvString,
  type: csvString,
  source: csvString,

  assetId: blankToUndefined(z.string().trim().max(64)).optional(),
  assignedTo: blankToUndefined(z.string().trim().max(120)).optional(),
  /** Scope-node id. Matches every asset sitting anywhere beneath it. */
  facility: blankToUndefined(z.string().trim().max(64)).optional(),

  /** `?overdue=true` → past due and not yet closed. */
  overdue: z.enum(['true', 'false']).optional(),
  /** `?unassigned=true` → the queue Scheduling & Dispatch exists to clear. */
  unassigned: z.enum(['true', 'false']).optional(),

  /** Due-date window. Either end may be given on its own. */
  dueFrom: blankToUndefined(isoDateString).optional(),
  dueTo: blankToUndefined(isoDateString).optional(),
  /** Scheduled-start window. */
  scheduledFrom: blankToUndefined(isoDateString).optional(),
  scheduledTo: blankToUndefined(isoDateString).optional(),
});

/** The board takes the same filters; only the shape of the answer differs. */
export const workOrderBoardQuerySchema = workOrderListQuerySchema.extend({
  /** Rows per column. The column's true total comes back regardless. */
  limitPerColumn: z.coerce.number().int().min(1).max(100).default(25),
});

const workOrderFields = {
  title: z.string().trim().min(4).max(140),
  assetId: z.string().trim().min(1),
  status: z.enum(WORK_ORDER_STATUSES).default('New'),
  priority: z.enum(WORK_ORDER_PRIORITIES).default('Medium'),
  type: z.enum(ACTIVE_WORK_ORDER_TYPES).default('Corrective'),
  // Technician assignment is optional at creation — an unassigned work order
  // is a normal, expected state (it is what Scheduling & Dispatch exists to
  // clear), not a validation failure.
  assignedTo: z.string().trim().min(2).max(120).default('Unassigned'),
  // Planned start. Nullable rather than merely optional, so a PATCH can clear a
  // date that was set by mistake — `undefined` means "leave it alone" and there
  // would otherwise be no way to say "remove it".
  scheduledDate: blankToUndefined(isoDateString).nullable().optional(),
  dueDate: isoDateString,
  description: z.string().trim().max(4000).default(''),
  estimatedHours: z.number().min(0).max(1000).default(1),
  source: z.enum(ACTIVE_WORK_ORDER_SOURCES).default('Manual'),
  requiredSkill: z.string().trim().max(80).optional(),
  checklist: z.array(z.object({ label: z.string().trim().min(1), done: z.boolean().default(false) })).max(50).default([]),
  parts: z
    .array(
      z.object({
        sku: z.string().trim().min(1),
        name: z.string().trim().min(1),
        qty: z.number().int().min(1),
        unitCost: z.number().min(0),
      }),
    )
    .max(50)
    .default([]),
};

export const createWorkOrderSchema = z.object(workOrderFields);

/**
 * `partialUpdate`, not `.partial()` — see validators/common.ts. `.partial()`
 * keeps the `.default(…)` on every field it makes optional, so a PATCH sending
 * only `title` would silently reset status, priority, type, source and empty
 * the checklist.
 *
 * `assetId` is omitted: moving a work order to a different asset is a different
 * job, and would invalidate its history, its parts and its facility.
 */
export const updateWorkOrderSchema = partialUpdate(z.object(workOrderFields).omit({ assetId: true }));

/** Status changes go through their own endpoint so they can be audited. */
export const workOrderStatusSchema = z.object({
  status: z.enum(WORK_ORDER_STATUSES),
  note: z.string().trim().max(500).optional(),
});

/**
 * Assignment is its own action too.
 *
 * The empty string and the literal "Unassigned" both mean "put it back in the
 * queue"; the service normalises them, so a UI that clears a `<select>` does
 * not have to know which spelling the database uses.
 */
export const workOrderAssignSchema = z.object({
  assignedTo: z.string().trim().max(120),
  note: z.string().trim().max(500).optional(),
});

export const workOrderCommentSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const workOrderLaborSchema = z.object({
  hours: z.number().min(0.1).max(100),
  note: z.string().trim().max(500).default(''),
});

export type WorkOrderListQuery = z.infer<typeof workOrderListQuerySchema>;
export type WorkOrderBoardQuery = z.infer<typeof workOrderBoardQuerySchema>;
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
