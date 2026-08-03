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
  CycleCount,
  ForecastSeries,
  Inspection,
  Integration,
  MovementTrail,
  PmSchedule,
  Report,
} from '../models/index.js';
import { requireModule, validate } from '../middleware/index.js';
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
const models = createResource(AiModel, {
  label: 'Model',
  filters: ['status'],
  sortable: ['name', 'accuracy', 'driftPct', 'lastTrained'],
  defaultSort: '-accuracy',
  paginated: false,
});
router.get('/ai/models', requireModule('ai'), models.validateQuery, models.list);
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
const integrations = createResource(Integration, {
  label: 'Integration',
  filters: ['status', 'category'],
  sortable: ['name', 'category', 'lastSync'],
  defaultSort: 'name',
  paginated: false,
});
router.get('/integrations', requireModule('admin'), integrations.validateQuery, integrations.list);

const workflows = createResource(ApprovalWorkflow, {
  label: 'Approval workflow',
  filters: ['status'],
  sortable: ['name', 'status'],
  defaultSort: 'name',
  paginated: false,
});
router.get('/approval-workflows', requireModule('admin'), workflows.validateQuery, workflows.list);

export default router;
