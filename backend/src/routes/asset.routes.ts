import { Router } from 'express';
import * as controller from '../controllers/asset.controller.js';
import * as registration from '../controllers/registration.controller.js';
import lifecycleRoutes from './lifecycle.routes.js';
import { requireModule, validate, requirePermission } from '../middleware/index.js';
import {
  assetListQuerySchema,
  bulkUpdateAssetsSchema,
  createAssetSchema,
  updateAssetSchema,
} from '../validators/asset.validator.js';
import {
  createTemplateSchema,
  registrationDraftSchema,
  templateListQuerySchema,
  updateTemplateSchema,
} from '../validators/registration.validator.js';
import { idParamSchema } from '../validators/common.js';

const router = Router();

// Every route below requires the `assets` module grant. `requireAuth` is
// applied once by the parent router, so it is not repeated here.
router.use(requireModule('assets'));

router.get('/', validate({ query: assetListQuerySchema }), controller.list);
router.get('/stats', controller.stats);

// ─── Registration ───────────────────────────────────────────────────────────
// Registered before `/:id`, or Express would read "registration" as an asset id
// and answer every one of these with a 404.

router.get('/registration/catalog', registration.catalog);
router.get('/registration/defaults', registration.defaults);
router.get('/registration/form', registration.form);
router.post('/registration/validate', validate({ body: registrationDraftSchema }), registration.validateDraft);
router.post('/registration', validate({ body: registrationDraftSchema }), registration.register);

// ─── Templates ──────────────────────────────────────────────────────────────
// Also ahead of `/:id`, for the same reason. Authoring a template is an
// administrative act — it decides what thousands of registrations will ask —
// so writes are narrower than the read.

router.get('/templates', validate({ query: templateListQuerySchema }), registration.listTemplates);
router.post('/templates', requireModule('admin'), validate({ body: createTemplateSchema }), registration.createTemplate);
router.get('/templates/:id', validate({ params: idParamSchema }), registration.getTemplate);
router.patch(
  '/templates/:id',
  requireModule('admin'),
  validate({ params: idParamSchema, body: updateTemplateSchema }),
  registration.updateTemplate,
);
// Archive, not delete — assets keep a reference to the template that made them.
router.delete(
  '/templates/:id',
  requireModule('admin'),
  validate({ params: idParamSchema }),
  registration.archiveTemplate,
);

// ─── Lifecycle ──────────────────────────────────────────────────────────────
// Also ahead of `/:id` — `/lifecycle/board` would otherwise read as an id.

router.use(lifecycleRoutes);

// ─── One asset ──────────────────────────────────────────────────────────────

router.get('/:id', validate({ params: idParamSchema }), controller.getOne);
router.get('/:id/profile', validate({ params: idParamSchema }), controller.getProfile);
router.get('/:id/clone-source', validate({ params: idParamSchema }), registration.cloneSource);

router.post('/', requirePermission('assets', 'create'), validate({ body: createAssetSchema }), controller.create);

// Registered before `/:id` would ever be reached for a POST, and named `bulk`
// rather than sitting on `PATCH /` so it can never be confused with a
// collection-wide update.
router.post('/bulk', requirePermission('assets', 'edit'), validate({ body: bulkUpdateAssetsSchema }), controller.bulkUpdate);
router.patch('/:id', requirePermission('assets', 'edit'), validate({ params: idParamSchema, body: updateAssetSchema }), controller.update);

// Retiring an asset is destructive, so it needs the `delete` action rather than
// merely write access to the module. The `admin` module gate it used to carry
// was a blunter stand-in for exactly this — now that actions exist, a role can
// be given asset deletion without being handed Administration as well.
router.delete('/:id', requirePermission('assets', 'delete'), validate({ params: idParamSchema }), controller.remove);

export default router;
