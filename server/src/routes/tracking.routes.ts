import { Router } from 'express';
import * as controller from '../controllers/tracking.controller.js';
import { requireModule, validate } from '../middleware/index.js';
import { idParamSchema } from '../validators/common.js';
import {
  createGeofenceSchema,
  createSensorSchema,
  sensorListQuerySchema,
  updateGeofenceSchema,
} from '../validators/tracking.validator.js';

const router = Router();

router.use(requireModule('tracking'));

// ── Live map & movement ──────────────────────────────────────────────────────
router.get('/live', controller.live);
router.get('/movement/:id', validate({ params: idParamSchema }), controller.movement);

// ── Devices & gateways ───────────────────────────────────────────────────────
router.get('/sensors', validate({ query: sensorListQuerySchema }), controller.listSensors);
router.get('/sensors/:id', validate({ params: idParamSchema }), controller.getSensor);
router.post('/sensors', validate({ body: createSensorSchema }), controller.createSensor);
router.delete('/sensors/:id', validate({ params: idParamSchema }), controller.deleteSensor);

router.get('/gateways', controller.listGateways);

// ── Geofences ────────────────────────────────────────────────────────────────
router.get('/geofences', controller.listGeofences);
router.post('/geofences', validate({ body: createGeofenceSchema }), controller.createGeofence);
router.patch('/geofences/:id', validate({ params: idParamSchema, body: updateGeofenceSchema }), controller.updateGeofence);
router.delete('/geofences/:id', validate({ params: idParamSchema }), controller.deleteGeofence);

export default router;
