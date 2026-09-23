import { Router } from 'express';
import * as controller from '../controllers/lifecycle.controller.js';
import { requireModule, requirePermission, validate } from '../middleware/index.js';
import { bulkTransitionSchema, decideSchema, transitionSchema } from '../validators/lifecycle.validator.js';
import { idParamSchema } from '../validators/common.js';

/**
 * The lifecycle workflow — mounted under `/assets/lifecycle` and
 * `/assets/:id/lifecycle` from `asset.routes.ts`, ahead of its own `/:id`
 * for the same reason the registration routes are: Express would otherwise
 * read `lifecycle` as an asset id.
 */
const router = Router();

router.use(requireModule('assets'));

router.get('/lifecycle/board', controller.board);
router.get('/lifecycle/kpis', controller.kpis);
router.post(
  '/lifecycle/bulk-transition',
  requirePermission('assets', 'edit'),
  validate({ body: bulkTransitionSchema }),
  controller.bulkTransition,
);
router.post(
  '/lifecycle/transitions/:id/decide',
  requirePermission('assets', 'approve'),
  validate({ params: idParamSchema, body: decideSchema }),
  controller.decide,
);

router.get('/:id/lifecycle', validate({ params: idParamSchema }), controller.history);
router.post(
  '/:id/lifecycle/transition',
  requirePermission('assets', 'edit'),
  validate({ params: idParamSchema, body: transitionSchema }),
  controller.transition,
);

export default router;
