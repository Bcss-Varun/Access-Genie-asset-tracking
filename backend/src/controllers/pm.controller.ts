import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/pm.service.js';
import { raiseDueMaintenance } from '../services/maintenanceAutomation.service.js';
import type { CreatePmScheduleInput, UpdatePmScheduleInput } from '../validators/pm.validator.js';

/** Preventive schedules. Changing one changes what gets raised, so all writes are audited. */

export const create = asyncHandler(async (req: Request, res: Response) => {
  const created = await service.createPmSchedule(req.body as CreatePmScheduleInput);
  recordAudit(req, { action: 'pm_schedule.create', target: created._id, category: 'Maintenance' });
  sendData(res, created, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const updated = await service.updatePmSchedule(id, req.body as UpdatePmScheduleInput);
  recordAudit(req, { action: 'pm_schedule.update', target: id, category: 'Maintenance' });
  sendData(res, updated);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await service.deletePmSchedule(id);
  recordAudit(req, { action: 'pm_schedule.delete', target: id, category: 'Maintenance' });
  res.status(204).end();
});

/** Run the automation now rather than waiting for the next scheduled pass. */
export const runAutomation = asyncHandler(async (req: Request, res: Response) => {
  const result = await raiseDueMaintenance();
  recordAudit(req, { action: 'maintenance.automation.run', target: 'estate', category: 'Maintenance', metadata: { ...result } });
  sendData(res, result);
});
