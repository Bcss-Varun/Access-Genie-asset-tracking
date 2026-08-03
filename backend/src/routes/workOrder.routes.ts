import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/workOrder.controller.js';
import { requireModule, validate } from '../middleware/index.js';
import { idParamSchema } from '../validators/common.js';
import {
  createWorkOrderSchema,
  updateWorkOrderSchema,
  workOrderCommentSchema,
  workOrderLaborSchema,
  workOrderListQuerySchema,
  workOrderStatusSchema,
} from '../validators/workOrder.validator.js';

const router = Router();

router.use(requireModule('maintenance'));

router.get('/', validate({ query: workOrderListQuerySchema }), controller.list);
router.get('/stats', controller.stats);
router.get('/:id', validate({ params: idParamSchema }), controller.getOne);

router.post('/', validate({ body: createWorkOrderSchema }), controller.create);
router.patch('/:id', validate({ params: idParamSchema, body: updateWorkOrderSchema }), controller.update);
router.delete('/:id', validate({ params: idParamSchema }), controller.remove);

// ── Work-order actions ───────────────────────────────────────────────────────
router.post('/:id/status', validate({ params: idParamSchema, body: workOrderStatusSchema }), controller.changeStatus);
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
