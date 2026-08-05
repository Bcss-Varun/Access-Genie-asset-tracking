import type { Request, Response } from 'express';
import { validatedQuery } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData, sendList } from '../utils/response.js';
import * as trackingService from '../services/tracking.service.js';
import * as workspaceService from '../services/trackingWorkspace.service.js';
import { recordAudit } from '../services/audit.service.js';
import { ApiError } from '../utils/ApiError.js';
import { Gateway, Sensor, nextId } from '../models/index.js';
import type { CreateGeofenceInput, CreateSensorInput, SensorListQuery } from '../validators/tracking.validator.js';

// ── Workspace ────────────────────────────────────────────────────────────────
export const workspace = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await workspaceService.getTrackingWorkspace());
});

/** Just the badge number, for the chrome — far cheaper than the whole workspace. */
export const openAlertCount = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, { open: await workspaceService.countOpenTrackingAlerts() });
});

// ── Live map ─────────────────────────────────────────────────────────────────
export const live = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await trackingService.getLiveMap());
});

export const movement = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await trackingService.getMovementTrail(req.params.id as string));
});

// ── Devices ──────────────────────────────────────────────────────────────────
export const listSensors = asyncHandler(async (_req: Request, res: Response) => {
  const query = validatedQuery<SensorListQuery>(res);
  const { items, meta } = await trackingService.listSensors(query);
  sendList(res, items, meta);
});

export const getSensor = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await trackingService.getSensor(req.params.id as string));
});

export const createSensor = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.auth?.user.name ?? 'system';
  const sensor = await trackingService.createSensor(req.body as CreateSensorInput, actor);

  recordAudit(req, { action: 'device.register', target: sensor._id, category: 'Tracking' });
  sendData(res, sensor, 201);
});

export const deleteSensor = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await trackingService.deleteSensor(id);

  recordAudit(req, { action: 'device.decommission', target: id, category: 'Tracking' });
  res.status(204).send();
});

// ── Gateways ─────────────────────────────────────────────────────────────────
export const listGateways = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await Gateway.find().sort({ name: 1 }).lean());
});

export const createGateway = asyncHandler(async (req: Request, res: Response) => {
  const _id = await nextId('gateway', 'GW');
  const gateway = await Gateway.create({ ...req.body, _id, lastSeen: new Date() });
  recordAudit(req, {
    action: 'gateway.create',
    target: _id,
    category: 'Tracking',
    metadata: { kind: gateway.kind, location: gateway.location },
  });
  sendData(res, gateway.toJSON(), 201);
});

export const updateGateway = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const gateway = await Gateway.findByIdAndUpdate(id, { $set: req.body }, { new: true, runValidators: true });
  if (!gateway) throw ApiError.notFound('Gateway');
  recordAudit(req, { action: 'gateway.update', target: id, category: 'Tracking' });
  sendData(res, gateway.toJSON());
});

export const deleteGateway = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  // Sensors report *through* a gateway. Removing one while devices still point
  // at it would leave them referring to infrastructure that is gone, and
  // `createSensor` rejects exactly that — so deletion has to refuse it too,
  // rather than creating records the create path would never have allowed.
  const attached = await Sensor.countDocuments({ gatewayId: id });
  if (attached > 0) {
    throw ApiError.conflict(
      attached === 1
        ? 'A sensor still reports through this gateway. Move or remove it first.'
        : `${attached} sensors still report through this gateway. Move or remove them first.`,
    );
  }

  const removed = await Gateway.findByIdAndDelete(id).lean();
  if (!removed) throw ApiError.notFound('Gateway');
  recordAudit(req, { action: 'gateway.delete', target: id, category: 'Tracking' });
  res.status(204).end();
});

// ── Geofences ────────────────────────────────────────────────────────────────
export const listGeofences = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await trackingService.listGeofences());
});

export const createGeofence = asyncHandler(async (req: Request, res: Response) => {
  const geofence = await trackingService.createGeofence(req.body as CreateGeofenceInput);
  recordAudit(req, { action: 'geofence.create', target: geofence._id, category: 'Tracking' });
  sendData(res, geofence, 201);
});

export const updateGeofence = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const geofence = await trackingService.updateGeofence(id, req.body as Partial<CreateGeofenceInput>);

  recordAudit(req, { action: 'geofence.update', target: id, category: 'Tracking' });
  sendData(res, geofence);
});

export const deleteGeofence = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await trackingService.deleteGeofence(id);

  recordAudit(req, { action: 'geofence.delete', target: id, category: 'Tracking' });
  res.status(204).send();
});
