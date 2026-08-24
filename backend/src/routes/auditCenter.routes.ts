import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/auditCenter.controller.js';
import { requireModule, validate } from '../middleware/index.js';
import { idParamSchema, listQuerySchema } from '../validators/common.js';
import {
  addEvidenceSchema,
  createAuditSchema,
  createFindingSchema,
  transitionAuditSchema,
  updateAuditSchema,
  updateFindingSchema,
} from '../validators/audit.validator.js';

const auditListQuery = listQuerySchema.extend({
  status: z.string().optional(),
  type: z.string().optional(),
  scopeId: z.string().optional(),
});

const findingListQuery = listQuerySchema.extend({
  status: z.string().optional(),
  severity: z.string().optional(),
});

const crossAuditFindingListQuery = findingListQuery.extend({ assetId: z.string().optional() });

const router = Router();

router.use(requireModule('compliance', 'admin'));

// Registered before `/:id` — a literal path must win over the id param, or
// "findings" would be looked up as an audit id.
router.get('/findings', validate({ query: crossAuditFindingListQuery }), controller.listAllFindings);

router.get('/', validate({ query: auditListQuery }), controller.list);
router.get('/:id', validate({ params: idParamSchema }), controller.getOne);
router.post('/', validate({ body: createAuditSchema }), controller.create);
router.patch('/:id', validate({ params: idParamSchema, body: updateAuditSchema }), controller.update);
router.post('/:id/transition', validate({ params: idParamSchema, body: transitionAuditSchema }), controller.transition);

router.get(
  '/:auditId/findings',
  validate({ params: z.object({ auditId: z.string().trim().min(1).max(64) }), query: findingListQuery }),
  controller.listFindings,
);
router.post(
  '/:auditId/findings',
  validate({ params: z.object({ auditId: z.string().trim().min(1).max(64) }), body: createFindingSchema }),
  controller.createFinding,
);
router.patch(
  '/:auditId/findings/:findingId',
  validate({
    params: z.object({ auditId: z.string().trim().min(1).max(64), findingId: z.string().trim().min(1).max(64) }),
    body: updateFindingSchema,
  }),
  controller.updateFinding,
);
router.post(
  '/:auditId/findings/:findingId/evidence',
  validate({
    params: z.object({ auditId: z.string().trim().min(1).max(64), findingId: z.string().trim().min(1).max(64) }),
    body: addEvidenceSchema,
  }),
  controller.addEvidence,
);

export default router;
