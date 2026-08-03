import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/alert.controller.js';
import { requireModule, validate } from '../middleware/index.js';
import { alertActionSchema, alertListQuerySchema, createAlertSchema } from '../validators/alert.validator.js';
import { idParamSchema } from '../validators/common.js';

const router = Router();

// Alerts are readable by both the alerts and compliance grants — a security
// officer reaches them through compliance, an operator through alerts.
router.use(requireModule('alerts', 'compliance'));

router.get('/', validate({ query: alertListQuerySchema }), controller.list);
router.get('/stats', controller.stats);
router.get('/:id', validate({ params: idParamSchema }), controller.getOne);

router.post('/', validate({ body: createAlertSchema }), controller.create);

router.post('/:id/acknowledge', validate({ params: idParamSchema, body: alertActionSchema }), controller.acknowledge);
router.post('/:id/escalate', validate({ params: idParamSchema, body: alertActionSchema }), controller.escalate);
router.post('/:id/resolve', validate({ params: idParamSchema, body: alertActionSchema }), controller.resolve);

router.post(
  '/bulk/acknowledge',
  validate({ body: z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }) }),
  controller.acknowledgeMany,
);

export default router;
