import { Router } from 'express';
import { createResource } from '../controllers/resource.controller.js';
import * as assetClassController from '../controllers/assetClass.controller.js';
import {
  AnomalyEvent,
  AiModel,
  ApprovalWorkflow,
  AssetDocument,
  AssetGroup,
  Certification,
  ChecklistTemplate,
  CycleCount,
  ForecastSeries,
  Inspection,
  Integration,
  MovementTrail,
  PmSchedule,
  Report,
} from '../models/index.js';
import { requireModule, validate } from '../middleware/index.js';
import * as pmController from '../controllers/pm.controller.js';
import * as complianceController from '../controllers/compliance.controller.js';
import * as fieldworkController from '../controllers/fieldwork.controller.js';
import * as configurationController from '../controllers/configuration.controller.js';
import * as documentController from '../controllers/document.controller.js';
import { uploadDocumentSchema } from '../validators/document.validator.js';
import {
  createApprovalWorkflowSchema,
  createAiModelSchema,
  createChecklistTemplateSchema,
  createIntegrationSchema,
  createReportSubscriptionSchema,
  updateAiModelSchema,
  updateApprovalWorkflowSchema,
  updateReportSubscriptionSchema,
  updateChecklistTemplateSchema,
  updateIntegrationSchema,
} from '../validators/configuration.validator.js';
import {
  createCertificationSchema,
  createCycleCountSchema,
  createInspectionSchema,
  updateCertificationSchema,
  updateCycleCountSchema,
  updateInspectionSchema,
} from '../validators/compliance.validator.js';
import { createPmScheduleSchema, updatePmScheduleSchema } from '../validators/pm.validator.js';
import { idParamSchema } from '../validators/common.js';
import { createAssetClassSchema, updateAssetClassSchema } from '../validators/assetClass.validator.js';
import { createReportSchema, updateReportSchema } from '../validators/platform.validator.js';

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

// ── Asset classes ────────────────────────────────────────────────────────────
// Not a plain resource: reading one computes its live asset count, and writing
// one is a configuration change that thousands of assets inherit.
router.get('/asset-classes', requireModule('assets'), assetClassController.list);
router.get('/asset-classes/:id', requireModule('assets'), validate({ params: idParamSchema }), assetClassController.getOne);
router.post(
  '/asset-classes',
  requireModule('admin'),
  validate({ body: createAssetClassSchema }),
  assetClassController.create,
);
router.patch(
  '/asset-classes/:id',
  requireModule('admin'),
  validate({ params: idParamSchema, body: updateAssetClassSchema }),
  assetClassController.update,
);
router.delete('/asset-classes/:id', requireModule('admin'), validate({ params: idParamSchema }), assetClassController.remove);

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
router.post('/inspections', comp, validate({ body: createInspectionSchema }), complianceController.createInspection);
router.patch('/inspections/:id', comp, validate({ params: idParamSchema, body: updateInspectionSchema }), complianceController.updateInspection);
router.delete('/inspections/:id', comp, validate({ params: idParamSchema }), complianceController.removeInspection);

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

const inspections = createResource(Inspection, {
  label: 'Inspection',
  filters: ['assetId', 'status'],
  sortable: ['dueDate', 'title', 'status'],
  defaultSort: 'dueDate',
  text: true,
});
router.get('/inspections', requireModule('maintenance'), inspections.validateQuery, inspections.list);
router.get('/inspections/:id', requireModule('maintenance'), inspections.getOne);

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
  filters: ['assetId', 'severity', 'metric'],
  sortable: ['detectedAt', 'zScore', 'confidence'],
  defaultSort: '-detectedAt',
});
router.get('/ai/anomalies', requireModule('ai'), anomalies.validateQuery, anomalies.list);

// ── Analytics ────────────────────────────────────────────────────────────────
// Writable: the report builder's "Save" used to raise a toast and keep the
// definition in component state, so the report it claimed to have saved was
// gone as soon as you left the page.
const reports = createResource(Report, {
  label: 'Report',
  filters: ['category', 'persona'],
  sortable: ['name', 'category', 'lastRun'],
  defaultSort: 'name',
  text: true,
  paginated: false,
  writable: {
    create: createReportSchema,
    update: updateReportSchema,
    idSequence: ['report', 'RPT'],
    timestamps: { createdAt: 'lastRun' },
    audit: { action: 'report', category: 'Analytics' },
  },
});
router.get('/reports', requireModule('analytics'), reports.validateQuery, reports.list);
router.get('/reports/:id', requireModule('analytics'), reports.getOne);
router.post('/reports', requireModule('analytics'), reports.validateCreate, reports.create);
router.patch(
  '/reports/:id',
  requireModule('analytics'),
  validate({ params: idParamSchema }),
  reports.validateUpdate,
  reports.update,
);
router.delete('/reports/:id', requireModule('analytics'), validate({ params: idParamSchema }), reports.remove);

// Running a report queries the live estate and writes a file the browser can
// download — see reportRun.service.ts. `/exports/:id/download` is mounted here
// rather than beside the export list because it is the other half of this.
const analytics = requireModule('analytics');
router.post('/reports/:id/run', analytics, validate({ params: idParamSchema }), configurationController.runReport);
router.get('/exports/:id/download', analytics, validate({ params: idParamSchema }), configurationController.downloadExport);

router.get('/report-subscriptions', analytics, configurationController.listSubscriptions);
router.post(
  '/report-subscriptions',
  analytics,
  validate({ body: createReportSubscriptionSchema }),
  configurationController.createSubscription,
);
router.patch(
  '/report-subscriptions/:id',
  analytics,
  validate({ params: idParamSchema, body: updateReportSubscriptionSchema }),
  configurationController.updateSubscription,
);
router.delete(
  '/report-subscriptions/:id',
  analytics,
  validate({ params: idParamSchema }),
  configurationController.removeSubscription,
);

// ── Compliance ───────────────────────────────────────────────────────────────
const cycleCounts = createResource(CycleCount, {
  label: 'Cycle count',
  filters: ['status', 'location'],
  sortable: ['date', 'location', 'status'],
  defaultSort: '-date',
  paginated: false,
});
router.get('/cycle-counts', requireModule('operations', 'inventory'), cycleCounts.validateQuery, cycleCounts.list);

const certifications = createResource(Certification, {
  label: 'Certification',
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

const workflows = createResource(ApprovalWorkflow, {
  label: 'Approval workflow',
  filters: ['status'],
  sortable: ['name', 'status'],
  defaultSort: 'name',
  paginated: false,
  writable: {
    create: createApprovalWorkflowSchema,
    update: updateApprovalWorkflowSchema,
    idSequence: ['approvalWorkflow', 'WF'],
    audit: { action: 'approval_workflow', category: 'Configuration' },
  },
});
router.get('/approval-workflows', admin, workflows.validateQuery, workflows.list);
router.post('/approval-workflows', admin, workflows.validateCreate, workflows.create);
router.patch('/approval-workflows/:id', admin, validate({ params: idParamSchema }), workflows.validateUpdate, workflows.update);
router.delete('/approval-workflows/:id', admin, validate({ params: idParamSchema }), workflows.remove);

// ── Checklist library ────────────────────────────────────────────────────────
// The list is hand-written because it joins usage counts; the writes are plain.
const checklists = createResource(ChecklistTemplate, {
  label: 'Checklist template',
  filters: ['category'],
  sortable: ['name', 'category'],
  defaultSort: 'name',
  paginated: false,
  writable: {
    create: createChecklistTemplateSchema,
    update: updateChecklistTemplateSchema,
    idSequence: ['checklistTemplate', 'TPLC'],
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    audit: { action: 'checklist_template', category: 'Configuration' },
  },
});
const maint = requireModule('maintenance');
router.get('/checklist-templates', maint, configurationController.listChecklistTemplates);
router.post('/checklist-templates', maint, checklists.validateCreate, checklists.create);
router.patch('/checklist-templates/:id', maint, validate({ params: idParamSchema }), checklists.validateUpdate, checklists.update);
router.delete('/checklist-templates/:id', maint, validate({ params: idParamSchema }), checklists.remove);

export default router;
