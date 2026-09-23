import { assertAssetVisible, assertLocationVisible, assetClause, type VisibleScope } from './tenancy.service.js';
import { updateAsset } from './asset.service.js';
import type { TransferStatus } from '@access-genie/shared';
import {
  Asset,
  Reservation,
  ScopeNodeModel,
  TRANSFER_FLOW,
  Transfer,
  WorkOrder,
  nextId,
  type TransferDoc,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import { openIfRequired, openRequestFor, type Decider } from './approval.service.js';

async function transferDestination(scope: VisibleScope, to: string) {
  const [place, zone] = to.split(' · ');
  const matches = await ScopeNodeModel.find({ name: zone || place }).lean();
  const candidates = matches.filter(row => {
    if (!zone) return row.name === place;
    let cursor = scope.byId.get(row._id);
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor._id)) {
      seen.add(cursor._id);
      if (cursor.name === place) return true;
      cursor = cursor.parentId ? scope.byId.get(cursor.parentId) : undefined;
    }
    return false;
  });
  if (candidates.length !== 1) throw ApiError.badRequest('Choose an unambiguous destination from the location hierarchy.');
  const destination = candidates[0]!;
  assertLocationVisible(scope, destination._id, 'Destination');
  return { id: destination._id, name: place!, ...(zone ? { zone } : {}) };
}

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
  /** Who the asset should land with at the destination, if known up front. */
  newCustodian?: string;
  /** The technician expected to carry out the pickup/delivery. */
  handler?: string;
  /** The field job this movement supports, if any. */
  workOrderId?: string;
  /** Ties this record to the other assets raised in the same multi-asset request. */
  batchId?: string;
  requiredDate?: string;
  notes?: string;
}

export async function createTransfer(
  input: CreateTransferInput,
  requester: Decider,
  scope: VisibleScope,
): Promise<TransferDoc> {
  await assertAssetVisible(scope, input.assetId);
  const asset = await Asset.findById(input.assetId).lean();
  if (!asset) throw ApiError.notFound('Asset');

  await transferDestination(scope, input.to);
  const from = [asset.location?.name, asset.location?.zone].filter(Boolean).join(' · ');
  if (from === input.to) throw ApiError.badRequest('The asset is already there.');

  const open = await Transfer.countDocuments({
    assetId: input.assetId,
    status: { $in: ['Pending', 'Approved', 'Picked Up', 'In Transit', 'Received'] },
  });
  if (open > 0) throw ApiError.conflict('This asset already has a transfer in progress.');

  const transfer = await Transfer.create({
    _id: await nextId('transfer', 'TR'),
    assetId: asset._id,
    assetName: asset.name,
    from: from || 'Unassigned',
    to: input.to,
    requester: requester.name,
    approver: '',
    status: 'Pending',
    requestedAt: new Date(),
    reason: input.reason,
    custodian: asset.custodian ?? 'Unassigned',
    newCustodian: input.newCustodian ?? '',
    handler: input.handler ?? '',
    workOrderId: input.workOrderId ?? undefined,
    batchId: input.batchId ?? undefined,
    requiredDate: input.requiredDate ? new Date(input.requiredDate) : undefined,
    notes: input.notes ?? '',
  });

  // If a workflow governs transfers here, this raises the real approval request
  // that has to be settled before the transfer can move. When none does, the
  // transfer behaves exactly as it did before approvals existed.
  await openIfRequired({
    trigger: 'asset_transfer',
    subjectId: transfer._id,
    subjectLabel: `${asset.name} → ${input.to}`,
    scopeId: asset.location?.id,
    requestedBy: requester.id,
    requestedByName: requester.name,
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
  scope: VisibleScope,
): Promise<TransferDoc> {
  const transfer = await Transfer.findById(id);
  if (!transfer) throw ApiError.notFound('Transfer');
  await assertAssetVisible(scope, transfer.assetId, 'Transfer');
  const destination = status === 'Received' ? await transferDestination(scope, transfer.to) : undefined;

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

  // A transfer under an open approval request is decided in Approvals, not here.
  // Without this the workflow would be advisory — anyone with the transfer
  // screen could approve around the chain, which is the exact failure mode of a
  // workflow feature that only stores configuration.
  if (status === 'Approved' || status === 'Rejected') {
    const pending = await openRequestFor('asset_transfer', id);
    if (pending) {
      throw ApiError.conflict(
        `This transfer is governed by "${pending.workflowName}" and is awaiting approval step ` +
          `${pending.currentStep + 1} of ${pending.steps.length}. Decide it from Approvals.`,
      );
    }
  }

  transfer.status = status;
  if (status === 'Approved' || status === 'Rejected') {
    transfer.approver = actor;
    transfer.approvedAt = new Date();
  }
  if (status === 'Completed') {
    transfer.completedAt = new Date();
  }
  if (status === 'Picked Up') {
    transfer.pickedUpAt = new Date();
    transfer.handler = transfer.handler || actor;
  }
  if (status === 'Received') {
    transfer.receivedAt = new Date();
    // The move is also a custody change — whoever it was headed to now has it.
    const landsWith = transfer.newCustodian || transfer.requester;
    transfer.custodian = landsWith;

    await updateAsset(scope, transfer.assetId, { location: destination!, custodian: landsWith }, actor);

  }

  await transfer.save();
  return transfer.toObject();
}

export async function listTransfers(scope: VisibleScope) {
  return Transfer.find(await assetClause(scope)).sort({ requestedAt: -1 }).lean();
}

/**
 * Apply a settled approval to the transaction it was gating.
 *
 * Called by the approvals controller once a request reaches `Approved` or
 * `Rejected`. It bypasses `advanceTransfer`'s "decided in Approvals" guard on
 * purpose — that guard exists to stop somebody stepping *around* the chain, and
 * this is the chain having finished.
 *
 * Failures here are logged rather than thrown. The approval itself is already
 * recorded and must not be rolled back because the downstream record refused a
 * transition; a transfer that was cancelled while its approval was in flight is
 * an ordinary race, not a reason to lose the decision.
 */
export async function applyApprovalOutcome(
  subjectId: string,
  outcome: 'Approved' | 'Rejected',
  approver: string,
): Promise<void> {
  const transfer = await Transfer.findById(subjectId);
  if (!transfer) return;

  const allowed = TRANSFER_FLOW[transfer.status];
  if (!allowed.includes(outcome)) {
    logger.warn('Approval settled but the transfer cannot take that transition', {
      transferId: subjectId,
      from: transfer.status,
      to: outcome,
    });
    return;
  }

  transfer.status = outcome;
  transfer.approver = approver;
  transfer.approvedAt = new Date();
  await transfer.save();
}

// ── Reservations ─────────────────────────────────────────────────────────────
export interface CreateReservationInput {
  assetId: string;
  reservedBy: string;
  startDay: number;
  endDay: number;
  startLabel: string;
  endLabel: string;
  purpose?: string;
}

export async function createReservation(input: CreateReservationInput, scope: VisibleScope) {
  await assertAssetVisible(scope, input.assetId);
  const asset = await Asset.findById(input.assetId).lean();
  if (!asset) throw ApiError.notFound('Asset');
  if (input.endDay < input.startDay) throw ApiError.badRequest('A booking cannot end before it starts.');

  // An asset out for repair, or already committed to an active field job, is
  // not free to book — whatever the calendar looks like.
  if (asset.status === 'Maintenance') {
    throw ApiError.conflict(`${asset.name} is under maintenance and cannot be reserved.`);
  }
  const activeJob = await WorkOrder.findOne({ assetId: input.assetId, status: 'In Progress' }).lean();
  if (activeJob) {
    throw ApiError.conflict(`${asset.name} is already committed to an active work order (${activeJob._id}).`);
  }

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
    purpose: input.purpose ?? '',
    status: 'Confirmed',
  });

  return created.toObject();
}

export async function cancelReservation(id: string, scope: VisibleScope) {
  const reservation = await Reservation.findById(id);
  if (!reservation) throw ApiError.notFound('Reservation');
  await assertAssetVisible(scope, reservation.assetId, 'Reservation');
  if (reservation.status === 'Returned') throw ApiError.conflict('That booking has already been returned.');

  reservation.status = 'Cancelled';
  await reservation.save();
  return reservation.toObject();
}

export async function listReservations(scope: VisibleScope) {
  return Reservation.find(await assetClause(scope)).sort({ startDay: 1 }).lean();
}
