import { Router } from 'express';
import * as controller from '../controllers/technician.controller.js';
import { requireModule, validate } from '../middleware/index.js';
import { idParamSchema } from '../validators/common.js';
import { createTechnicianSchema, updateTechnicianSchema } from '../validators/technician.validator.js';

/**
 * The Mobile Workforce roster. Reads sit alongside `operations`/`maintenance`
 * — Scheduling & Dispatch and Work Orders both need the roster to assign
 * against — writes are restricted to the roles that actually manage the
 * workforce.
 */
const router = Router();

router.use(requireModule('operations', 'maintenance'));

router.get('/technicians', controller.list);
router.post('/technicians', validate({ body: createTechnicianSchema }), controller.create);
router.patch('/technicians/:id', validate({ params: idParamSchema, body: updateTechnicianSchema }), controller.update);

export default router;
