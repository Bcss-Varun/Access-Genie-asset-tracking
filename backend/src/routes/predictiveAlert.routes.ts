import { Router } from 'express';
import * as controller from '../controllers/predictiveAlert.controller.js';
import { requireModule, validate } from '../middleware/index.js';
import { idParamSchema } from '../validators/common.js';
import {
  createPredictiveAlertSchema,
  dismissPredictiveAlertSchema,
  predictiveAlertListQuerySchema,
  predictiveAlertNoteSchema,
  raisePredictiveWorkOrderSchema,
} from '../validators/predictiveAlert.validator.js';

/**
 * Predictive Alerts.
 *
 * Under the `maintenance` grant, not `alerts`: this is the Predictive
 * Maintenance pillar's board, and the person who triages it is the one who
 * receives the work order it raises.
 */
const router = Router();

router.use(requireModule('maintenance'));

// The literal paths come first: Express matches in order, so `/stats`
// registered after `/:id` would be read as an alert called "stats" and 404.
router.get('/', validate({ query: predictiveAlertListQuerySchema }), controller.list);
router.get('/stats', validate({ query: predictiveAlertListQuerySchema }), controller.stats);
router.get('/facets', controller.facets);
router.get('/:id', validate({ params: idParamSchema }), controller.getOne);
// Everything the detail drawer needs in one request — see the service.
router.get('/:id/detail', validate({ params: idParamSchema }), controller.detail);

/** Ingestion. A future predictive engine posts here; so does a person today. */
router.post('/', validate({ body: createPredictiveAlertSchema }), controller.create);

// ── Lifecycle ────────────────────────────────────────────────────────────────
// Each is a named transition rather than a PATCH on `status`, so the URL states
// the intent, the audit trail reads as a sequence of decisions, and dismissal
// can demand a reason that a generic field write could not.
router.post('/:id/acknowledge', validate({ params: idParamSchema, body: predictiveAlertNoteSchema }), controller.acknowledge);
router.post('/:id/dismiss', validate({ params: idParamSchema, body: dismissPredictiveAlertSchema }), controller.dismiss);
router.post('/:id/reopen', validate({ params: idParamSchema, body: predictiveAlertNoteSchema }), controller.reopen);
router.post('/:id/resolve', validate({ params: idParamSchema, body: predictiveAlertNoteSchema }), controller.resolve);

/** Raises a real work order through the work-order service. Idempotent. */
router.post(
  '/:id/work-order',
  validate({ params: idParamSchema, body: raisePredictiveWorkOrderSchema }),
  controller.raiseWorkOrder,
);

router.delete('/:id', validate({ params: idParamSchema }), controller.remove);

export default router;
