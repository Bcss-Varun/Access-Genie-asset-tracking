import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/technician.service.js';
import type { CreateTechnicianInput, UpdateTechnicianInput } from '../validators/technician.validator.js';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await service.listTechnicians());
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const technician = await service.createTechnician(req.body as CreateTechnicianInput);
  recordAudit(req, { action: 'technician.create', target: technician._id, category: 'Workforce' });
  sendData(res, technician, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const technician = await service.updateTechnician(id, req.body as UpdateTechnicianInput);
  recordAudit(req, { action: 'technician.update', target: id, category: 'Workforce' });
  sendData(res, technician);
});
