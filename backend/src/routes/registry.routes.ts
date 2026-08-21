import { Router } from 'express';
import { createResource } from '../controllers/resource.controller.js';
import {
  AnomalyEvent,
  AiModel,
  AssetDocument,
  AssetGroup,
  Certification,
  CycleCount,
  ForecastSeries,
  Integration,
  MovementTrail,
  PmSchedule,
} from '../models/index.js';
import { requireModule, validate } from '../middleware/index.js';
import * as approvalController from '../controllers/approval.controller.js';
import * as numberingController from '../controllers/numbering.controller.js';
import * as notificationRuleController from '../controllers/notificationRule.controller.js';
import {
  createNotificationRuleSchema,
  logQuerySchema,
  updateNotificationRuleSchema,
} from '../validators/notificationRule.validator.js';
import {
  createNumberingRuleSchema,
  previewNumberingSchema,
  updateNumberingRuleSchema,
} from '../validators/numbering.validator.js';
import {
  cancelSchema,
  createWorkflowSchema,
  decideSchema,
  listRequestsQuerySchema,
  updateWorkflowSchema,
} from '../validators/approval.validator.js';
import * as pmController from '../controllers/pm.controller.js';
import * as complianceController from '../controllers/compliance.controller.js';
import * as fieldworkController from '../controllers/fieldwork.controller.js';
import * as documentController from '../controllers/document.controller.js';
import { uploadDocumentSchema } from '../validators/document.validator.js';
import {
  createAiModelSchema,
  createIntegrationSchema,
  updateAiModelSchema,
  updateIntegrationSchema,
} from '../validators/configuration.validator.js';
import {
  createCertificationSchema,
  createCycleCountSchema,
  updateCertificationSchema,
  updateCycleCountSchema,
} from '../validators/compliance.validator.js';
import { createPmScheduleSchema, updatePmScheduleSchema } from '../validators/pm.validator.js';
import { idParamSchema } from '../validators/common.js';

/**
 * The reference collections behind the registry, maintenance, AI, analytics and
 * administration screens.
 *
 * All but asset classes are plain read-mostly lookups, so they are built by
 * `createResource` rather than hand-written: see resource.controller.ts for why.
 * Each is still module-gated exactly as its screens are, so a role that cannot
 * see a section cannot read its data either.
 */
const router = Router();

// ── Collections & documents ──────────────────────────────────────────────────
const groups = createResource(AssetGroup, {
  label: 'Asset group',
  filters: ['type'],
  aliases: { assetId: 'memberIds' },
  sortable: ['name', 'type', 'createdAt'],
  defaultSort: 'name',
  paginated: false,
});
router.get('/asset-groups', requireModule('assets'), groups.validateQuery, groups.list);
router.get('/asset-groups/:id', requireModule('assets'), groups.getOne);

const documents = createResource(AssetDocument, {
  label: 'Document',
  scope: { by: 'asset' },
  filters: ['assetId', 'type'],
  sortable: ['uploadedAt', 'name', 'sizeKb'],
  defaultSort: '-uploadedAt',
});
router.get('/asset-documents', requireModule('assets'), documents.validateQuery, documents.list);
// Upload/download are hand-written: `createResource` writes JSON bodies and
// reads JSON back, and neither is true of a file.
router.post(
  '/asset-documents',
  requireModule('assets'),
  validate({ body: uploadDocumentSchema }),
  documentController.upload,
);
router.get(
  '/asset-documents/:id/download',
  requireModule('assets'),
  validate({ params: idParamSchema }),
  documentController.download,
);
router.delete(
  '/asset-documents/:id',
  requireModule('assets'),
  validate({ params: idParamSchema }),
  documentController.remove,
);

const trails = createResource(MovementTrail, {
  label: 'Movement trail',
  // Keyed *by* the asset id rather than carrying it as a field.
  scope: { by: 'assetKey' },
  idAlias: 'assetId',
  sortable: ['distanceM'],
  defaultSort: '-distanceM',
  paginated: false,
});
router.get('/movement-trails', requireModule('tracking'), trails.validateQuery, trails.list);
router.get('/movement-trails/:id', requireModule('tracking'), trails.getOne);

// ── Preventive maintenance & inspections ─────────────────────────────────────
const pm = createResource(PmSchedule, {
  label: 'PM schedule',
  scope: { by: 'asset' },
  filters: ['assetId', 'frequency', 'type'],
  sortable: ['nextDue', 'title', 'compliancePct', 'estHours'],
  defaultSort: 'nextDue',
  text: true,
});
router.get('/pm-schedules', requireModule('maintenance'), pm.validateQuery, pm.list);
// Writable: a schedule is the input to automated work-order generation, so the
// maintenance programme has to be editable for any of it to mean anything.
router.post('/pm-schedules', requireModule('maintenance'), validate({ body: createPmScheduleSchema }), pmController.create);
router.patch('/pm-schedules/:id', requireModule('maintenance'), validate({ params: idParamSchema, body: updatePmScheduleSchema }), pmController.update);
router.delete('/pm-schedules/:id', requireModule('maintenance'), validate({ params: idParamSchema }), pmController.remove);
router.post('/pm-schedules/run-automation', requireModule('maintenance'), pmController.runAutomation);

// ── Compliance records ───────────────────────────────────────────────────────
// Inspections, certifications and cycle counts were read-only: a compliance
// programme that could be displayed but never run. See compliance.service.ts.
const comp = requireModule('compliance', 'maintenance');
// Inspections moved to inspection.routes.ts when Inspections & Checklists became
// one module with templates, typed checkpoints and server-side grading.

router.post('/certifications', comp, validate({ body: createCertificationSchema }), complianceController.createCertification);
router.patch('/certifications/:id', comp, validate({ params: idParamSchema, body: updateCertificationSchema }), complianceController.updateCertification);
router.delete('/certifications/:id', comp, validate({ params: idParamSchema }), complianceController.removeCertification);

router.post('/cycle-counts', comp, validate({ body: createCycleCountSchema }), complianceController.createCycleCount);
router.patch('/cycle-counts/:id', comp, validate({ params: idParamSchema, body: updateCycleCountSchema }), complianceController.updateCycleCount);
router.delete('/cycle-counts/:id', comp, validate({ params: idParamSchema }), complianceController.removeCycleCount);

// ── Mobile workforce ─────────────────────────────────────────────────────────
// One queue across work orders and inspections, and scan-to-act. See
// fieldwork.service.ts for why they are merged rather than shown as two lists.
router.get('/field/queue', requireModule('maintenance', 'assets'), fieldworkController.queue);
router.get('/field/queue/all', requireModule('maintenance', 'assets'), fieldworkController.allWork);
router.post('/field/scan/:id', requireModule('assets'), validate({ params: idParamSchema }), fieldworkController.scan);
router.get('/pm-schedules/:id', requireModule('maintenance'), pm.getOne);

// ── AI / MLOps ───────────────────────────────────────────────────────────────
// Writable: the registry records models that exist elsewhere, and a registry
// nobody can add to only ever describes what shipped with the seed. Nothing
// here trains anything — see the validator.
const models = createResource(AiModel, {
  label: 'Model',
  filters: ['status'],
  sortable: ['name', 'accuracy', 'driftPct', 'lastTrained'],
  defaultSort: '-accuracy',
  paginated: false,
  writable: {
    create: createAiModelSchema,
    update: updateAiModelSchema,
    idSequence: ['aiModel', 'MDL'],
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    audit: { action: 'ai_model', category: 'AI' },
  },
});
const ai = requireModule('ai');
router.get('/ai/models', ai, models.validateQuery, models.list);
router.post('/ai/models', ai, models.validateCreate, models.create);
router.patch('/ai/models/:id', ai, validate({ params: idParamSchema }), models.validateUpdate, models.update);
router.delete('/ai/models/:id', ai, validate({ params: idParamSchema }), models.remove);
router.get('/ai/models/:id', requireModule('ai'), models.getOne);

const forecasts = createResource(ForecastSeries, {
  label: 'Forecast',
  sortable: ['name'],
  defaultSort: 'name',
  paginated: false,
});
router.get('/ai/forecasts', requireModule('ai'), forecasts.validateQuery, forecasts.list);
router.get('/ai/forecasts/:id', requireModule('ai'), forecasts.getOne);

const anomalies = createResource(AnomalyEvent, {
  label: 'Anomaly',
  scope: { by: 'asset' },
  filters: ['assetId', 'severity', 'metric'],
  sortable: ['detectedAt', 'zScore', 'confidence'],
  defaultSort: '-detectedAt',
});
router.get('/ai/anomalies', requireModule('ai'), anomalies.validateQuery, anomalies.list);

// ── Analytics ────────────────────────────────────────────────────────────────
// Moved out. Reports, the report builder, scheduled reports and exports now
// live in `analytics.routes.ts`, behind one engine that executes a saved
// *definition* against live collections. The versions that used to sit here
// were a `createResource` mount over the report records plus a runner keyed on
// a category string, which meant the shape of a report's output was decided by
// which of eight words it had been filed under rather than by anything its
// author chose.

// ── Compliance ───────────────────────────────────────────────────────────────
const cycleCounts = createResource(CycleCount, {
  label: 'Cycle count',
  filters: ['status', 'location'],
  sortable: ['date', 'location', 'status'],
  defaultSort: '-date',
  paginated: false,
});
router.get('/cycle-counts', requireModule('operations', 'compliance'), cycleCounts.validateQuery, cycleCounts.list);

const certifications = createResource(Certification, {
  label: 'Certification',
  scope: { by: 'asset' },
  filters: ['assetId', 'status', 'authority'],
  sortable: ['expiresAt', 'name', 'status'],
  defaultSort: 'expiresAt',
  paginated: false,
});
router.get('/certifications', requireModule('compliance'), certifications.validateQuery, certifications.list);

// ── Administration ───────────────────────────────────────────────────────────
// Both of these were read-only while their screens offered "Add" buttons that
// opened a toast. Connecting a system and drafting an approval chain are the
// two things an administrator sets up on day one, so both are writable.
const admin = requireModule('admin');

const integrations = createResource(Integration, {
  label: 'Integration',
  filters: ['status', 'category'],
  sortable: ['name', 'category', 'lastSync'],
  defaultSort: 'name',
  paginated: false,
  writable: {
    create: createIntegrationSchema,
    update: updateIntegrationSchema,
    idSequence: ['integration', 'INT'],
    timestamps: { updatedAt: 'lastSync' },
    audit: { action: 'integration', category: 'Configuration' },
  },
});
router.get('/integrations', admin, integrations.validateQuery, integrations.list);
router.post('/integrations', admin, integrations.validateCreate, integrations.create);
router.patch('/integrations/:id', admin, validate({ params: idParamSchema }), integrations.validateUpdate, integrations.update);
router.delete('/integrations/:id', admin, validate({ params: idParamSchema }), integrations.remove);

// Approval workflows have their own controller rather than the generic resource
// helper: a workflow validates its scope against the location tree, joins that
// scope's name on read, and orders its steps — none of which the generic CRUD
// knows about. The requests it raises live alongside it, because the pair is one
// feature (see approval.controller.ts).
router.get('/approval-workflows', admin, approvalController.listWorkflows);
router.post(
  '/approval-workflows',
  admin,
  validate({ body: createWorkflowSchema }),
  approvalController.createWorkflow,
);
router.patch(
  '/approval-workflows/:id',
  admin,
  validate({ params: idParamSchema, body: updateWorkflowSchema }),
  approvalController.updateWorkflow,
);
router.delete(
  '/approval-workflows/:id',
  admin,
  validate({ params: idParamSchema }),
  approvalController.removeWorkflow,
);
router.get('/approval-workflows/approvers', admin, approvalController.listApprovers);

// ── Numbering & ID rules ─────────────────────────────────────────────────────
// Administration only: these decide the shape of every ID the platform issues
// from here on, which is not a setting an operator should be able to reach.
router.get('/numbering-rules', admin, numberingController.list);
router.post(
  '/numbering-rules',
  admin,
  validate({ body: createNumberingRuleSchema }),
  numberingController.create,
);
router.post(
  '/numbering-rules/preview',
  admin,
  validate({ body: previewNumberingSchema }),
  numberingController.preview,
);
router.patch(
  '/numbering-rules/:id',
  admin,
  validate({ params: idParamSchema, body: updateNumberingRuleSchema }),
  numberingController.update,
);
router.delete(
  '/numbering-rules/:id',
  admin,
  validate({ params: idParamSchema }),
  numberingController.remove,
);

// ── Notification rules ───────────────────────────────────────────────────────
router.get('/notification-rules', admin, notificationRuleController.list);
router.get('/notification-rules/log', admin, validate({ query: logQuerySchema }), notificationRuleController.log);
router.post('/notification-rules', admin, validate({ body: createNotificationRuleSchema }), notificationRuleController.create);
router.patch(
  '/notification-rules/:id',
  admin,
  validate({ params: idParamSchema, body: updateNotificationRuleSchema }),
  notificationRuleController.update,
);
router.delete('/notification-rules/:id', admin, validate({ params: idParamSchema }), notificationRuleController.remove);
router.get('/notification-rules/:id/preview', admin, validate({ params: idParamSchema }), notificationRuleController.preview);
router.post('/notification-rules/:id/test', admin, validate({ params: idParamSchema }), notificationRuleController.testSend);

// ── Approval requests ────────────────────────────────────────────────────────
// Deliberately *not* behind the `admin` gate. An approver is a facility manager
// or a maintenance manager acting on their own queue — requiring the
// Administration grant to approve a transfer would mean only administrators
// could ever clear one, which is the opposite of what a multi-role chain is for.
router.get(
  '/approvals',
  validate({ query: listRequestsQuerySchema }),
  approvalController.listRequests,
);
router.get('/approvals/:id', validate({ params: idParamSchema }), approvalController.getRequest);
router.post(
  '/approvals/:id/decide',
  validate({ params: idParamSchema, body: decideSchema }),
  approvalController.decideRequest,
);
router.post(
  '/approvals/:id/cancel',
  validate({ params: idParamSchema, body: cancelSchema }),
  approvalController.cancelRequest,
);

// ── Checklist library ────────────────────────────────────────────────────────
// Removed: a checklist *is* an inspection template. Both now live at
// `/inspection-templates` (inspection.routes.ts), where a checkpoint carries a
// type, a required flag and a failure rule — none of which a `string[]` could
// express.

export default router;
