import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireModule, validate } from '../middleware/index.js';
import { listQuerySchema } from '../validators/common.js';

import authRoutes from './auth.routes.js';
import assetRoutes from './asset.routes.js';
import workOrderRoutes from './workOrder.routes.js';
import alertRoutes from './alert.routes.js';
import trackingRoutes from './tracking.routes.js';
import userRoutes from './user.routes.js';
import registryRoutes from './registry.routes.js';
import labellingRoutes from './labelling.routes.js';
import operationsRoutes from './operations.routes.js';
import platformRoutes from './platform.routes.js';

import * as dashboardController from '../controllers/dashboard.controller.js';
import * as insightController from '../controllers/insight.controller.js';
import * as catalogController from '../controllers/catalog.controller.js';
import * as preferenceController from '../controllers/preference.controller.js';
import {
  renameViewSchema,
  savedViewSchema,
  updatePreferencesSchema,
} from '../validators/preference.validator.js';
import { idParamSchema } from '../validators/common.js';
import {
  createAlertRuleSchema,
  createCustodySchema,
  updateAlertRuleSchema,
} from '../validators/catalog.validator.js';

/**
 * The `/api/v1` surface.
 *
 * Auth is mounted first and stays public; everything after `router.use(requireAuth)`
 * is authenticated by construction — a new route cannot accidentally ship
 * unprotected, because protection is positional rather than per-route.
 */
const router = Router();

router.use('/auth', authRoutes);

router.use(requireAuth);

// ── Workspace ────────────────────────────────────────────────────────────────
router.get('/dashboard/summary', requireModule('workspace'), dashboardController.summary);
router.get('/scope/tree', dashboardController.scopeTree);

// The reference dataset the screens read, filtered to the caller's grants.
// No module gate of its own: the service gates each slice individually, so a
// role receives exactly the sections it is allowed to see.
router.get('/dataset', dashboardController.dataset);

// ── Preferences (no module gate — everyone has a theme and their own views) ───
// What the browser used to keep in localStorage/sessionStorage. Always scoped
// to the session's own user; there is no route that reads someone else's.
router.get('/me/preferences', preferenceController.get);
router.patch('/me/preferences', validate({ body: updatePreferencesSchema }), preferenceController.update);
router.post('/me/views', validate({ body: savedViewSchema }), preferenceController.createView);
router.patch(
  '/me/views/:id',
  validate({ params: idParamSchema, body: renameViewSchema }),
  preferenceController.renameView,
);
router.delete('/me/views/:id', validate({ params: idParamSchema }), preferenceController.removeView);

// ── Core modules ─────────────────────────────────────────────────────────────
router.use('/assets', assetRoutes);
router.use('/work-orders', workOrderRoutes);
router.use('/alerts', alertRoutes);
router.use('/tracking', trackingRoutes);
router.use('/users', userRoutes);
router.use('/labels', labellingRoutes);
router.use('/operations', operationsRoutes);

// Reference collections behind the registry, maintenance, AI, analytics,
// compliance and administration screens. Mounted at the root because each
// declares its own path and its own module gate.
router.use(registryRoutes);
router.use(platformRoutes);

// ── AI insights ──────────────────────────────────────────────────────────────
const insightQuerySchema = listQuerySchema.extend({
  type: z.string().optional(),
  severity: z.string().optional(),
  status: z.string().optional(),
  assetId: z.string().optional(),
});

router.get('/insights', requireModule('ai'), validate({ query: insightQuerySchema }), insightController.list);
router.get('/insights/stats', requireModule('ai'), insightController.stats);
router.get('/insights/:id', requireModule('ai'), insightController.getOne);
router.post('/insights/:id/action', requireModule('ai'), insightController.action);
router.post('/insights/:id/dismiss', requireModule('ai'), insightController.dismiss);

// ── Inventory ────────────────────────────────────────────────────────────────
const partQuerySchema = listQuerySchema.extend({
  warehouseId: z.string().optional(),
  abcClass: z.string().optional(),
  reorder: z.string().optional(),
});

router.get('/inventory/parts', requireModule('inventory'), validate({ query: partQuerySchema }), catalogController.listParts);
router.get('/inventory/warehouses', requireModule('inventory'), catalogController.listWarehouses);
router.get('/inventory/suppliers', requireModule('inventory'), catalogController.listSuppliers);
router.get('/inventory/purchase-orders', requireModule('inventory'), catalogController.listPurchaseOrders);

// ── Notifications (no module gate — every session has an inbox) ───────────────
router.get('/notifications', catalogController.listNotifications);
router.post('/notifications/read-all', catalogController.markAllNotificationsRead);
router.post('/notifications/:id/read', catalogController.markNotificationRead);

// ── Compliance ───────────────────────────────────────────────────────────────
const auditQuerySchema = listQuerySchema.extend({ category: z.string().optional(), actor: z.string().optional() });
const custodyQuerySchema = listQuerySchema.extend({ assetId: z.string().optional() });

router.get('/audit', requireModule('compliance', 'admin'), validate({ query: auditQuerySchema }), catalogController.listAudit);
router.get('/custody', requireModule('compliance', 'assets'), validate({ query: custodyQuerySchema }), catalogController.listCustody);

// A custody move also reassigns the asset and writes its timeline entry, so it
// is a domain action rather than an insert — see custody.service.ts.
router.post(
  '/custody',
  requireModule('assets', 'operations'),
  validate({ body: createCustodySchema }),
  catalogController.createCustody,
);

// ── Alert rules ──────────────────────────────────────────────────────────────
router.get('/alert-rules', requireModule('alerts', 'compliance'), catalogController.listAlertRules);
router.post(
  '/alert-rules',
  requireModule('alerts', 'compliance'),
  validate({ body: createAlertRuleSchema }),
  catalogController.createAlertRule,
);
router.patch(
  '/alert-rules/:id',
  requireModule('alerts', 'compliance'),
  validate({ params: idParamSchema, body: updateAlertRuleSchema }),
  catalogController.updateAlertRule,
);
router.delete(
  '/alert-rules/:id',
  requireModule('alerts', 'compliance'),
  validate({ params: idParamSchema }),
  catalogController.deleteAlertRule,
);
router.post(
  '/alert-rules/:id/toggle',
  requireModule('alerts', 'compliance'),
  validate({ body: z.object({ enabled: z.boolean() }) }),
  catalogController.toggleAlertRule,
);

export default router;
