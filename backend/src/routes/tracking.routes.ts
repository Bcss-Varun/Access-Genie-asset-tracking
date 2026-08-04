import { Router } from 'express';
import * as controller from '../controllers/tracking.controller.js';
import * as observation from '../controllers/observation.controller.js';
import { observationBatchSchema, observationSchema } from '../validators/observation.validator.js';
import * as ops from '../controllers/trackingOps.controller.js';
import { requireModule, validate } from '../middleware/index.js';
import { idParamSchema } from '../validators/common.js';
import {
  createGeofenceSchema,
  createSensorSchema,
  sensorListQuerySchema,
  updateGeofenceSchema,
} from '../validators/tracking.validator.js';
import {
  alertTransitionSchema,
  bulkAlertTransitionSchema,
  campaignStateSchema,
  createMovementSchema,
  deviceBulkSchema,
  incidentStateSchema,
  openIncidentSchema,
  provisionDeviceSchema,
  startAuditSchema,
  toggleSchema,
  updateAuditSchema,
  updateMovementSchema,
} from '../validators/trackingOps.validator.js';

const router = Router();

router.use(requireModule('tracking'));

// ── Observation intake ───────────────────────────────────────────────────────
// How reality enters the platform: a reader, gateway, or phone reports that it
// saw a tag. Everything the tracking screens show is derived from this stream.
//
// Gated on `tracking` rather than `admin` — the callers are field hardware and
// the mobile app, not administrators — and deliberately separate from the
// device registry, which is about the readers themselves rather than what they
// have seen.
router.post('/observations', validate({ body: observationSchema }), observation.record);
router.post('/observations/batch', validate({ body: observationBatchSchema }), observation.recordBatch);
router.get('/observable-zones', observation.zones);

// ── Workspace ────────────────────────────────────────────────────────────────
// The whole tracking estate in one response — see trackingWorkspace.service.ts
// for why the six workspace screens share a single payload instead of
// assembling seventeen requests each.
router.get('/workspace', controller.workspace);
router.get('/alerts/count', controller.openAlertCount);

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

// ── Workspace actions ────────────────────────────────────────────────────────
// The write side of the six workspace screens. Everything below used to be a
// `setState` in the browser: acknowledging an alert, opening an incident,
// provisioning a device, booking an asset out and running an audit all vanished
// on reload, and were never visible to the colleague sharing the queue.

// Alerts — the bulk route is mounted before `/alerts/:id/...` so the literal
// path can never be captured as an id.
router.post('/alerts/bulk/transition', validate({ body: bulkAlertTransitionSchema }), ops.transitionAlerts);
router.post(
  '/alerts/:id/transition',
  validate({ params: idParamSchema, body: alertTransitionSchema }),
  ops.transitionAlert,
);

// Incidents
router.post('/incidents', validate({ body: openIncidentSchema }), ops.openIncident);
router.post(
  '/incidents/:id/state',
  validate({ params: idParamSchema, body: incidentStateSchema }),
  ops.setIncidentState,
);

// Automation rules
router.post(
  '/automation-rules/:id/toggle',
  validate({ params: idParamSchema, body: toggleSchema }),
  ops.toggleAutomationRule,
);

// Devices & firmware
router.post('/devices', validate({ body: provisionDeviceSchema }), ops.provisionDevice);
router.post('/devices/bulk', validate({ body: deviceBulkSchema }), ops.bulkUpdateDevices);
router.post(
  '/firmware-campaigns/:id/state',
  validate({ params: idParamSchema, body: campaignStateSchema }),
  ops.setCampaignState,
);

// Movements
router.post('/movements', validate({ body: createMovementSchema }), ops.createMovement);
router.patch(
  '/movements/:id',
  validate({ params: idParamSchema, body: updateMovementSchema }),
  ops.updateMovement,
);

// Audits
router.post('/audits', validate({ body: startAuditSchema }), ops.startAudit);
router.patch('/audits/:id', validate({ params: idParamSchema, body: updateAuditSchema }), ops.updateAudit);

export default router;
