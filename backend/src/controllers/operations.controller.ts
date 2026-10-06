import { requireScope } from '../middleware/scope.js';
import type { Request, Response } from 'express';
import type { TransferStatus } from '@access-genie/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/audit.service.js';
import * as service from '../services/operations.service.js';
import type { Decider } from '../services/approval.service.js';

/**
 * The full identity. Records display the name; authority is decided on the id
 * (a transfer's approver must not be its requester) and, in the approval
 * engine, on the role and home scope.
 */
function deciderOf(req: Request): Decider {
  if (!req.auth) throw ApiError.unauthorized();
  return {
    id: req.auth.user.id,
    name: req.auth.user.name,
    roleId: req.auth.roleId,
    homeScopeId: req.auth.user.homeScopeId,
  };
}

// ── Transfers ────────────────────────────────────────────────────────────────
export const listTransfers = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await service.listTransfers(requireScope(req)));
});

export const createTransfer = asyncHandler(async (req: Request, res: Response) => {
  const transfer = await service.createTransfer(req.body as service.CreateTransferInput, deciderOf(req), requireScope(req));
  recordAudit(req, { action: 'transfer.request', target: transfer._id, category: 'Asset' });
  sendData(res, transfer, 201);
});

export const advanceTransfer = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { status } = req.body as { status: TransferStatus };

  const transfer = await service.advanceTransfer(id, status, deciderOf(req), requireScope(req));
  recordAudit(req, { action: `transfer.${status.toLowerCase().replace(' ', '_')}`, target: id, category: 'Asset' });
  sendData(res, transfer);
});

// ── Reservations ─────────────────────────────────────────────────────────────
export const listReservations = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await service.listReservations(requireScope(req)));
});

export const createReservation = asyncHandler(async (req: Request, res: Response) => {
  const reservation = await service.createReservation(req.body as service.CreateReservationInput, requireScope(req));
  recordAudit(req, { action: 'reservation.create', target: reservation._id, category: 'Asset' });
  sendData(res, reservation, 201);
});

export const cancelReservation = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const reservation = await service.cancelReservation(id, requireScope(req));
  recordAudit(req, { action: 'reservation.cancel', target: id, category: 'Asset' });
  sendData(res, reservation);
});
