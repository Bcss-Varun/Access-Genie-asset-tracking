import { Router } from 'express';
import { z } from 'zod';
import { RESERVATION_STATUSES, TRANSFER_STATUSES } from '@access-genie/shared';
import * as controller from '../controllers/operations.controller.js';
import { requireModule, validate } from '../middleware/index.js';
import { idParamSchema } from '../validators/common.js';

/**
 * Asset transfers and reservations — the two ways an asset moves without
 * changing what it is.
 */
const router = Router();

router.use(requireModule('operations', 'assets'));

// ── Transfers ────────────────────────────────────────────────────────────────
const createTransferSchema = z.object({
  assetId: z.string().trim().min(1),
  to: z.string().trim().min(2).max(160),
  reason: z.string().trim().min(3).max(400),
  newCustodian: z.string().trim().max(120).optional(),
  handler: z.string().trim().max(120).optional(),
  workOrderId: z.string().trim().max(40).optional(),
});

const advanceSchema = z.object({
  // 'Pending' is the opening state, never a destination.
  status: z.enum(TRANSFER_STATUSES).refine((s) => s !== 'Pending', 'A transfer cannot move back to Pending'),
});

router.get('/transfers', controller.listTransfers);
router.post('/transfers', validate({ body: createTransferSchema }), controller.createTransfer);
router.post(
  '/transfers/:id/status',
  validate({ params: idParamSchema, body: advanceSchema }),
  controller.advanceTransfer,
);

// ── Reservations ─────────────────────────────────────────────────────────────
const createReservationSchema = z.object({
  assetId: z.string().trim().min(1),
  reservedBy: z.string().trim().min(2).max(120),
  startDay: z.coerce.number().int().min(0).max(6),
  endDay: z.coerce.number().int().min(0).max(6),
  startLabel: z.string().trim().min(1).max(40),
  endLabel: z.string().trim().min(1).max(40),
  purpose: z.string().trim().max(200).optional(),
});

router.get('/reservations', controller.listReservations);
router.post('/reservations', validate({ body: createReservationSchema }), controller.createReservation);
router.post('/reservations/:id/cancel', validate({ params: idParamSchema }), controller.cancelReservation);

export const RESERVATION_STATUS_VALUES = RESERVATION_STATUSES;

export default router;
