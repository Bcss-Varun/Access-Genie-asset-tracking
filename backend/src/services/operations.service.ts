import type { TransferStatus } from '@access-genie/shared';
import {
  Asset,
  Reservation,
  ScopeNodeModel,
  TRANSFER_FLOW,
  Transfer,
  nextId,
  type ScopeNodeDoc,
  type TransferDoc,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';

/**
 * Transfers and reservations.
 *
 * The rule worth having a service for is segregation of duties: whoever asked
 * for an asset to be moved cannot be the one who approves it. That is the whole
 * point of a transfer request — without it, the request is paperwork around a
 * decision one person already made.
 */

export interface CreateTransferInput {
  assetId: string;
  to: string;
  reason: string;
}

export async function createTransfer(input: CreateTransferInput, requester: string): Promise<TransferDoc> {
  const asset = await Asset.findById(input.assetId).lean();
  if (!asset) throw ApiError.notFound('Asset');

  const from = [asset.location?.name, asset.location?.zone].filter(Boolean).join(' · ');
  if (from === input.to) throw ApiError.badRequest('The asset is already there.');

  const open = await Transfer.countDocuments({
    assetId: input.assetId,
    status: { $in: ['Pending', 'Approved', 'In Transit'] },
  });
  if (open > 0) throw ApiError.conflict('This asset already has a transfer in progress.');

  const transfer = await Transfer.create({
    _id: await nextId('transfer', 'TR'),
    assetId: asset._id,
    assetName: asset.name,
    from: from || 'Unassigned',
    to: input.to,
    requester,
    approver: '',
    status: 'Pending',
    requestedAt: new Date(),
    reason: input.reason,
  });

  return transfer.toObject();
}

/**
 * Advance a transfer.
 *
 * Transitions are checked against `TRANSFER_FLOW` rather than trusted from the
 * client, and approval additionally refuses the requester — the control only
 * means something if it is enforced here.
 */
export async function advanceTransfer(
  id: string,
  status: TransferStatus,
  actor: string,
): Promise<TransferDoc> {
  const transfer = await Transfer.findById(id);
  if (!transfer) throw ApiError.notFound('Transfer');

  const allowed = TRANSFER_FLOW[transfer.status];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(
      allowed.length
        ? `A ${transfer.status.toLowerCase()} transfer can only move to: ${allowed.join(', ')}.`
        : `This transfer is ${transfer.status.toLowerCase()} and cannot change.`,
    );
  }

  if ((status === 'Approved' || status === 'Rejected') && actor === transfer.requester) {
    throw ApiError.forbidden('A transfer cannot be approved by the person who requested it.');
  }

  transfer.status = status;
  if (status === 'Approved' || status === 'Rejected') {
    transfer.approver = actor;
    transfer.approvedAt = new Date();
  }
  if (status === 'Received') {
    transfer.receivedAt = new Date();

    /**
     * The move is the point of the request: complete it on the asset itself, or
     * the transfer says "Received" while the registry still shows the old place.
     *
     * `location.id` has to move with `location.name`. Writing the name alone —
     * which is what this did — left the asset displaying its new home while
     * still carrying the id of its old one, and `location.id` is what scope
     * filtering and each role's visibility are resolved against. The result was
     * an asset that looked moved on every screen and was still, as far as
     * access control was concerned, in the facility it had left.
     */
    const [place, zone] = transfer.to.split(' · ');
    const destination = await ScopeNodeModel.findOne({ name: place }).lean<ScopeNodeDoc>();

    await Asset.updateOne(
      { _id: transfer.assetId },
      {
        $set: {
          'location.name': place,
          // Only when the destination is a real node. A free-text destination
          // that matches nothing is still recorded as the displayed name, but
          // it must not silently reassign the asset to some other scope.
          ...(destination ? { 'location.id': destination._id } : {}),
          ...(zone ? { 'location.zone': zone } : {}),
        },
      },
    );

    if (!destination) {
      logger.warn('Transfer received to a destination that is not a scope node', {
        transfer: transfer._id,
        to: transfer.to,
      });
    }
  }

  await transfer.save();
  return transfer.toObject();
}

export async function listTransfers() {
  return Transfer.find().sort({ requestedAt: -1 }).lean();
}

// ── Reservations ─────────────────────────────────────────────────────────────
export interface CreateReservationInput {
  assetId: string;
  reservedBy: string;
  startDay: number;
  endDay: number;
  startLabel: string;
  endLabel: string;
}

export async function createReservation(input: CreateReservationInput) {
  const asset = await Asset.findById(input.assetId).lean();
  if (!asset) throw ApiError.notFound('Asset');
  if (input.endDay < input.startDay) throw ApiError.badRequest('A booking cannot end before it starts.');

  // Double-booking is the failure this screen exists to prevent, so it is
  // checked rather than left to whoever looks at the calendar.
  const clash = await Reservation.findOne({
    assetId: input.assetId,
    status: { $in: ['Pending', 'Confirmed', 'In Use'] },
    startDay: { $lte: input.endDay },
    endDay: { $gte: input.startDay },
  }).lean();

  if (clash) {
    throw ApiError.conflict(`${asset.name} is already reserved by ${clash.reservedBy} over that window.`);
  }

  const created = await Reservation.create({
    _id: await nextId('reservation', 'RES'),
    assetId: asset._id,
    assetName: asset.name,
    reservedBy: input.reservedBy,
    startDay: input.startDay,
    endDay: input.endDay,
    startLabel: input.startLabel,
    endLabel: input.endLabel,
    status: 'Confirmed',
  });

  return created.toObject();
}

export async function cancelReservation(id: string) {
  const reservation = await Reservation.findById(id);
  if (!reservation) throw ApiError.notFound('Reservation');
  if (reservation.status === 'Returned') throw ApiError.conflict('That booking has already been returned.');

  reservation.status = 'Cancelled';
  await reservation.save();
  return reservation.toObject();
}

export async function listReservations() {
  return Reservation.find().sort({ startDay: 1 }).lean();
}
