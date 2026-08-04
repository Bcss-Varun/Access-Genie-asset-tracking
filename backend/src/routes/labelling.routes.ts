import { Router } from 'express';
import { createResource } from '../controllers/resource.controller.js';
import * as controller from '../controllers/labelling.controller.js';
import { LabelTemplate, PrintDevice } from '../models/index.js';
import { requireModule, validate } from '../middleware/index.js';
import { idParamSchema } from '../validators/common.js';
import {
  createDeviceSchema,
  createPrintJobSchema,
  createTemplateSchema,
  printJobQuerySchema,
  updateTemplateSchema,
} from '../validators/labelling.validator.js';

/**
 * Labelling and tag printing.
 *
 * Gated on `assets`, not `tracking`: the job here is "make this asset
 * scannable", which belongs to the registry — printing the label and binding
 * the tag it carries are the same event.
 */
const router = Router();

router.use(requireModule('assets'));

// ── Templates ────────────────────────────────────────────────────────────────
const templates = createResource(LabelTemplate, {
  label: 'Label template',
  filters: ['medium', 'size'],
  sortable: ['name', 'updatedAt', 'usageCount'],
  defaultSort: 'name',
  paginated: false,
});
router.get('/templates', templates.validateQuery, templates.list);
router.get('/templates/:id', validate({ params: idParamSchema }), templates.getOne);
router.post('/templates', validate({ body: createTemplateSchema }), controller.createTemplate);
router.patch('/templates/:id', validate({ params: idParamSchema, body: updateTemplateSchema }), controller.updateTemplate);
router.delete('/templates/:id', validate({ params: idParamSchema }), controller.deleteTemplate);

// ── Print devices ────────────────────────────────────────────────────────────
const devices = createResource(PrintDevice, {
  label: 'Print device',
  filters: ['facility', 'state', 'kind'],
  sortable: ['name', 'facility', 'queueDepth'],
  defaultSort: 'name',
  paginated: false,
});
router.get('/devices', devices.validateQuery, devices.list);
// Registering a printer is administrative — a device is shared infrastructure,
// not something an individual should be able to add mid-print-run.
router.post('/devices', requireModule('admin'), validate({ body: createDeviceSchema }), controller.createDevice);

// ── Print jobs ───────────────────────────────────────────────────────────────
router.get('/jobs', validate({ query: printJobQuerySchema }), controller.listJobs);
router.post('/jobs', validate({ body: createPrintJobSchema }), controller.createJob);
router.post('/jobs/:id/cancel', validate({ params: idParamSchema }), controller.cancelJob);
router.post('/jobs/:id/retry', validate({ params: idParamSchema }), controller.retryJob);

export default router;
