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

import * as dashboardController from '../controllers/dashboard.controller.js';
import * as insightController from '../controllers/insight.controller.js';
import * as catalogController from '../controllers/catalog.controller.js';

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

// ── Core modules ─────────────────────────────────────────────────────────────
router.use('/assets', assetRoutes);
router.use('/work-orders', workOrderRoutes);
router.use('/alerts', alertRoutes);
router.use('/tracking', trackingRoutes);
router.use('/users', userRoutes);

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

// ── Alert rules ──────────────────────────────────────────────────────────────
router.get('/alert-rules', requireModule('alerts', 'compliance'), catalogController.listAlertRules);
router.post(
  '/alert-rules/:id/toggle',
  requireModule('alerts', 'compliance'),
  validate({ body: z.object({ enabled: z.boolean() }) }),
  catalogController.toggleAlertRule,
);

export default router;
