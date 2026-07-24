import { Router } from 'express';
import * as controller from '../controllers/user.controller.js';
import { requireModule, requireRole, validate } from '../middleware/index.js';
import { idParamSchema, listQuerySchema } from '../validators/common.js';
import { createUserSchema, updateUserSchema, userListQuerySchema } from '../validators/user.validator.js';

const router = Router();

router.use(requireModule('admin'));

router.get('/', validate({ query: userListQuerySchema }), controller.list);
router.get('/roles', validate({ query: listQuerySchema.partial() }), controller.roles);
router.get('/:id', validate({ params: idParamSchema }), controller.getOne);

// Creating accounts and granting roles is an administrator's job specifically,
// not everyone who can open the admin module.
router.post('/', requireRole('super_admin', 'org_admin'), validate({ body: createUserSchema }), controller.create);
router.patch(
  '/:id',
  requireRole('super_admin', 'org_admin'),
  validate({ params: idParamSchema, body: updateUserSchema }),
  controller.update,
);
router.delete('/:id', requireRole('super_admin'), validate({ params: idParamSchema }), controller.remove);

export default router;
