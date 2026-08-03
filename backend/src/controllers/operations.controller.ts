import type { Request, Response } from 'express';
import type { TransferStatus } from '@access-genie/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/operations.service.js';

/** The signed-in user's name — the requester or approver on the record. */
function actorOf(req: Request): string {
  if (!req.auth) throw ApiError.unauthorized();
  return req.auth.user.name;
}

// ── Transfers ────────────────────────────────────────────────────────────────
export const listTransfers = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await service.listTransfers());
});

export const createTransfer = asyncHandler(async (req: Request, res: Response) => {
  const transfer = await service.createTransfer(req.body as service.CreateTransferInput, actorOf(req));
  recordAudit(req, { action: 'transfer.request', target: transfer._id, category: 'Asset' });
  sendData(res, transfer, 201);
});

export const advanceTransfer = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { status } = req.body as { status: TransferStatus };

  const transfer = await service.advanceTransfer(id, status, actorOf(req));
  recordAudit(req, { action: `transfer.${status.toLowerCase().replace(' ', '_')}`, target: id, category: 'Asset' });
  sendData(res, transfer);
});

// ── Reservations ─────────────────────────────────────────────────────────────
export const listReservations = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await service.listReservations());
});

export const createReservation = asyncHandler(async (req: Request, res: Response) => {
  const reservation = await service.createReservation(req.body as service.CreateReservationInput);
  recordAudit(req, { action: 'reservation.create', target: reservation._id, category: 'Asset' });
  sendData(res, reservation, 201);
});

export const cancelReservation = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const reservation = await service.cancelReservation(id);
  recordAudit(req, { action: 'reservation.cancel', target: id, category: 'Asset' });
  sendData(res, reservation);
});
