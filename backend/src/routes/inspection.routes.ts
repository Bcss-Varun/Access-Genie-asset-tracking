import { Router } from 'express';
import * as controller from '../controllers/inspection.controller.js';
import { requireModule, validate } from '../middleware/index.js';
import { idParamSchema } from '../validators/common.js';
import {
  assignInspectionSchema,
  completeInspectionSchema,
  createInspectionSchema,
  createInspectionTemplateSchema,
  createInspectionsBulkSchema,
  inspectionListQuerySchema,
  raiseCorrectiveSchema,
  respondSchema,
  templateListQuerySchema,
  updateInspectionSchema,
  updateInspectionTemplateSchema,
} from '../validators/inspection.validator.js';

/**
 * Inspections & Checklists.
 *
 * Two resources under one module grant: `/inspection-templates` is the reusable
 * library, `/inspections` the records executed from it. They are mounted
 * together because they are one feature — a template exists to be scheduled,
 * and a record cannot exist without one.
 */
const router = Router();

router.use(requireModule('maintenance'));

// ── Templates ────────────────────────────────────────────────────────────────
router.get('/inspection-templates', validate({ query: templateListQuerySchema }), controller.listTemplates);
router.get('/inspection-templates/:id', validate({ params: idParamSchema }), controller.getTemplate);
// The assets a template's scope resolves to — what the "schedule from template"
// picker offers, rather than making the client re-implement scope matching.
router.get('/inspection-templates/:id/assets', validate({ params: idParamSchema }), controller.templateAssets);
router.post('/inspection-templates', validate({ body: createInspectionTemplateSchema }), controller.createTemplate);
router.patch(
  '/inspection-templates/:id',
  validate({ params: idParamSchema, body: updateInspectionTemplateSchema }),
  controller.updateTemplate,
);
router.delete('/inspection-templates/:id', validate({ params: idParamSchema }), controller.removeTemplate);

// ── Records ──────────────────────────────────────────────────────────────────
// The literal paths come before `/:id`: Express matches in order, so `/stats`
// registered after a parameter route would be read as an inspection called
// "stats" and answer 404.
router.get('/inspections', validate({ query: inspectionListQuerySchema }), controller.list);
router.get('/inspections/stats', validate({ query: inspectionListQuerySchema }), controller.stats);
router.get('/inspections/facets', controller.facets);
router.get('/inspections/:id', validate({ params: idParamSchema }), controller.getOne);
router.get('/inspections/:id/failures', validate({ params: idParamSchema }), controller.failures);

router.post('/inspections', validate({ body: createInspectionSchema }), controller.create);
router.post('/inspections/bulk', validate({ body: createInspectionsBulkSchema }), controller.createBulk);
router.patch('/inspections/:id', validate({ params: idParamSchema, body: updateInspectionSchema }), controller.update);
router.delete('/inspections/:id', validate({ params: idParamSchema }), controller.remove);

// ── Execution ────────────────────────────────────────────────────────────────
// Each is a domain action with a rule of its own — a checked transition, a
// roster lookup, server-side grading — which is why none go through PATCH.
router.post('/inspections/:id/assign', validate({ params: idParamSchema, body: assignInspectionSchema }), controller.assign);
router.post('/inspections/:id/start', validate({ params: idParamSchema }), controller.start);
router.post('/inspections/:id/responses', validate({ params: idParamSchema, body: respondSchema }), controller.respond);
router.post('/inspections/:id/complete', validate({ params: idParamSchema, body: completeInspectionSchema }), controller.complete);

// ── Corrective work ──────────────────────────────────────────────────────────
router.post('/inspections/:id/corrective', validate({ params: idParamSchema, body: raiseCorrectiveSchema }), controller.raiseAllCorrective);
router.post('/inspections/:id/corrective/:key', validate({ body: raiseCorrectiveSchema }), controller.raiseCorrective);

export default router;
