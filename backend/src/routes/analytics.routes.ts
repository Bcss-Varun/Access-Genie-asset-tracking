import { Router } from 'express';
import { requireModule, validate } from '../middleware/index.js';
import { idParamSchema } from '../validators/common.js';
import * as analytics from '../controllers/analytics.controller.js';
import {
  analyticsDashboardQuerySchema,
  createReportSchema,
  createScheduleSchema,
  exportPreviewSchema,
  exportQuerySchema,
  previewReportSchema,
  runReportSchema,
  updateReportSchema,
  updateScheduleSchema,
} from '../validators/analytics.validator.js';

/**
 * Analytics & Reporting.
 *
 * Four sections, one module gate. Everything is behind `analytics` because that
 * is the grant whose nav section these screens live in — and because a role
 * that cannot open the Analytics Dashboard must not be able to reach the same
 * figures through a report or an export, which is exactly what a per-route
 * patchwork of gates eventually allows.
 *
 * The *scope* a caller sees inside that gate is resolved from their session on
 * every request — see `analyticsScope.service.ts`. The module gate answers "may
 * you use analytics at all"; the scope answers "over which estate", and the two
 * are deliberately separate.
 */
const router = Router();

const analyticsGate = requireModule('analytics');

// ── Analytics Dashboard ──────────────────────────────────────────────────────
router.get(
  '/analytics/dashboard',
  analyticsGate,
  validate({ query: analyticsDashboardQuerySchema }),
  analytics.dashboard,
);

// ── Report Builder ───────────────────────────────────────────────────────────
// The catalogue of sources, dimensions and measures the builder renders, and
// the preview that executes an unsaved definition against live collections.
router.get('/analytics/catalogue', analyticsGate, analytics.catalogue);
router.post('/analytics/preview', analyticsGate, validate({ body: previewReportSchema }), analytics.preview);
router.post(
  '/analytics/preview/export',
  analyticsGate,
  validate({ body: exportPreviewSchema }),
  analytics.exportPreview,
);

// ── Reports ──────────────────────────────────────────────────────────────────
router.get('/analytics/reports', analyticsGate, analytics.list);
router.post('/analytics/reports', analyticsGate, validate({ body: createReportSchema }), analytics.create);
router.get('/analytics/reports/:id', analyticsGate, validate({ params: idParamSchema }), analytics.getOne);
router.patch(
  '/analytics/reports/:id',
  analyticsGate,
  validate({ params: idParamSchema, body: updateReportSchema }),
  analytics.update,
);
router.delete('/analytics/reports/:id', analyticsGate, validate({ params: idParamSchema }), analytics.remove);
router.post(
  '/analytics/reports/:id/duplicate',
  analyticsGate,
  validate({ params: idParamSchema }),
  analytics.duplicate,
);
// Running returns rows; exporting returns a file of the same rows with the cap
// lifted. Both go through the one engine, so they cannot disagree.
router.post(
  '/analytics/reports/:id/run',
  analyticsGate,
  validate({ params: idParamSchema, body: runReportSchema }),
  analytics.run,
);
router.get(
  '/analytics/reports/:id/export',
  analyticsGate,
  validate({ params: idParamSchema, query: exportQuerySchema }),
  analytics.exportReport,
);

// ── Scheduled Reports ────────────────────────────────────────────────────────
router.get('/analytics/schedules', analyticsGate, analytics.listScheduled);
router.post(
  '/analytics/schedules',
  analyticsGate,
  validate({ body: createScheduleSchema }),
  analytics.createScheduled,
);
router.patch(
  '/analytics/schedules/:id',
  analyticsGate,
  validate({ params: idParamSchema, body: updateScheduleSchema }),
  analytics.updateScheduled,
);
router.delete(
  '/analytics/schedules/:id',
  analyticsGate,
  validate({ params: idParamSchema }),
  analytics.removeScheduled,
);

export default router;
