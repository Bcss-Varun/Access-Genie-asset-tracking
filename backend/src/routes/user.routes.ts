import { Router } from 'express';
import * as controller from '../controllers/user.controller.js';
import { requireModule, requireRole, validate } from '../middleware/index.js';
import { idParamSchema, listQuerySchema } from '../validators/common.js';
import { createUserSchema, roleGrantsSchema, updateUserSchema, userListQuerySchema } from '../validators/user.validator.js';

const router = Router();

router.use(requireModule('admin'));

router.get('/', validate({ query: userListQuerySchema }), controller.list);
router.get('/roles', validate({ query: listQuerySchema.partial() }), controller.roles);

// Changing what a role may reach is the most consequential write in the
// platform — it re-permissions everyone holding it — so it is bound to the two
// administrator roles rather than to the admin module grant.
router.patch(
  '/roles/:id',
  requireRole('super_admin', 'org_admin'),
  validate({ params: idParamSchema, body: roleGrantsSchema }),
  controller.updateRoleGrants,
);
// Action permissions are a separate write from the module grant: which screens
// a role may open, versus what it may do once inside one.
router.patch(
  '/roles/:id/permissions',
  requireRole('super_admin', 'org_admin'),
  validate({ params: idParamSchema }),
  controller.setRolePermissions,
);
router.post(
  '/roles/:id/reset',
  requireRole('super_admin', 'org_admin'),
  validate({ params: idParamSchema }),
  controller.resetRoleGrants,
);
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
