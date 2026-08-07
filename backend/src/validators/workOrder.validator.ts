import { z } from 'zod';
import {
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
} from '@access-genie/shared';
import { csvString, isoDateString, listQuerySchema, partialUpdate } from './common.js';

export const workOrderListQuerySchema = listQuerySchema.extend({
  status: csvString,
  priority: csvString,
  type: csvString,
  assetId: z.string().trim().optional(),
  assignedTo: z.string().trim().optional(),
  /** `?overdue=true` → past due and not yet completed. */
  overdue: z.coerce.boolean().optional(),
  /** `?aiGenerated=true` → raised by the predictive engine. */
  aiGenerated: z.coerce.boolean().optional(),
});

export const createWorkOrderSchema = z.object({
  title: z.string().trim().min(4).max(140),
  assetId: z.string().trim().min(1),
  status: z.enum(WORK_ORDER_STATUSES).default('New'),
  priority: z.enum(WORK_ORDER_PRIORITIES).default('Medium'),
  type: z.enum(WORK_ORDER_TYPES).default('Corrective'),
  assignedTo: z.string().trim().min(2).max(120),
  dueDate: isoDateString,
  description: z.string().trim().max(4000).default(''),
  estimatedHours: z.number().min(0).max(1000).default(1),
  aiGenerated: z.boolean().default(false),
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
});

export const updateWorkOrderSchema = partialUpdate(createWorkOrderSchema.omit({ assetId: true }));

/** Status changes go through their own endpoint so they can be audited. */
export const workOrderStatusSchema = z.object({
  status: z.enum(WORK_ORDER_STATUSES),
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
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
