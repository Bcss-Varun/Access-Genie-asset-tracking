import { Router } from 'express';
import * as controller from '../controllers/asset.controller.js';
import { requireModule, validate } from '../middleware/index.js';
import { assetListQuerySchema, createAssetSchema, updateAssetSchema } from '../validators/asset.validator.js';
import { idParamSchema } from '../validators/common.js';

const router = Router();

// Every route below requires the `assets` module grant. `requireAuth` is
// applied once by the parent router, so it is not repeated here.
router.use(requireModule('assets'));

router.get('/', validate({ query: assetListQuerySchema }), controller.list);
router.get('/stats', controller.stats);
router.get('/:id', validate({ params: idParamSchema }), controller.getOne);
router.get('/:id/profile', validate({ params: idParamSchema }), controller.getProfile);

router.post('/', validate({ body: createAssetSchema }), controller.create);
router.patch('/:id', validate({ params: idParamSchema, body: updateAssetSchema }), controller.update);

// Retiring an asset is destructive and administrative — deliberately narrower
// than the read/write grant the rest of the module uses.
router.delete('/:id', requireModule('admin'), validate({ params: idParamSchema }), controller.remove);

export default router;
