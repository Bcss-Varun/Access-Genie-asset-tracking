import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/workOrder.controller.js';
import { requireModule, validate, requirePermission } from '../middleware/index.js';
import { idParamSchema } from '../validators/common.js';
import {
  createWorkOrderSchema,
  updateWorkOrderSchema,
  workOrderAssignSchema,
  workOrderBoardQuerySchema,
  workOrderCommentSchema,
  workOrderLaborSchema,
  workOrderListQuerySchema,
  workOrderStatusSchema,
} from '../validators/workOrder.validator.js';

const router = Router();

router.use(requireModule('maintenance'));

// ── Reads ────────────────────────────────────────────────────────────────────
// `/board`, `/facets` and `/stats` are declared before `/:id` — Express matches
// in order, so a literal path registered after a parameter route would be
// swallowed by it and answer "work order 'board' not found".
router.get('/', validate({ query: workOrderListQuerySchema }), controller.list);
router.get('/board', validate({ query: workOrderBoardQuerySchema }), controller.board);
router.get('/facets', controller.facets);
router.get('/stats', validate({ query: workOrderListQuerySchema }), controller.stats);
router.get('/:id', validate({ params: idParamSchema }), controller.getOne);

// ── Writes ───────────────────────────────────────────────────────────────────
router.post('/', requirePermission('maintenance', 'create'), validate({ body: createWorkOrderSchema }), controller.create);
router.patch('/:id', requirePermission('maintenance', 'edit'), validate({ params: idParamSchema, body: updateWorkOrderSchema }), controller.update);
router.delete('/:id', requirePermission('maintenance', 'delete'), validate({ params: idParamSchema }), controller.remove);

// ── Work-order actions ───────────────────────────────────────────────────────
// Each of these is a domain action with a rule of its own — a checked
// transition, a roster lookup — rather than a field edit, which is why none of
// them go through PATCH.
router.post('/:id/status', validate({ params: idParamSchema, body: workOrderStatusSchema }), controller.changeStatus);
router.post('/:id/assign', validate({ params: idParamSchema, body: workOrderAssignSchema }), controller.assign);
router.post('/:id/comments', validate({ params: idParamSchema, body: workOrderCommentSchema }), controller.comment);
router.post('/:id/labor', validate({ params: idParamSchema, body: workOrderLaborSchema }), controller.logLabor);
router.post(
  '/:id/checklist',
  validate({
    params: idParamSchema,
    body: z.object({ index: z.number().int().min(0), done: z.boolean() }),
  }),
  controller.toggleChecklist,
);

export default router;
