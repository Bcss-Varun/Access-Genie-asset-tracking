import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/complianceRecord.controller.js';
import { requireModule, validate } from '../middleware/index.js';
import { idParamSchema, listQuerySchema } from '../validators/common.js';
import {
  createComplianceRecordSchema,
  resolveComplianceRecordSchema,
  updateComplianceRecordSchema,
} from '../validators/complianceRecord.validator.js';

const listQuery = listQuerySchema.extend({
  status: z.string().optional(),
  severity: z.string().optional(),
  category: z.string().optional(),
  assetId: z.string().optional(),
});

const router = Router();

router.use(requireModule('compliance', 'admin'));

router.get('/', validate({ query: listQuery }), controller.list);
router.get('/:id', validate({ params: idParamSchema }), controller.getOne);
router.post('/', validate({ body: createComplianceRecordSchema }), controller.create);
router.patch('/:id', validate({ params: idParamSchema, body: updateComplianceRecordSchema }), controller.update);
router.post(
  '/:id/resolve',
  validate({ params: idParamSchema, body: resolveComplianceRecordSchema }),
  controller.resolve,
);

export default router;
