import { model, Schema } from 'mongoose';
import {
  RESERVATION_STATUSES,
  TRANSFER_STATUSES,
  type ReservationStatus,
  type TransferStatus,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

// The two operational workflows that move an asset without changing what it is:
// a transfer relocates it permanently, a reservation books it temporarily.
// MovementTxn is the third and different thing — a check-out that is expected
// back, recorded by the estate rather than requested by a person.

// ── Transfers ────────────────────────────────────────────────────────────────
/**
 * A request to relocate an asset.
 *
 * `requester` and `approver` are separate fields and enforced to be different
 * people: an asset moving between facilities on one person's say-so is exactly
 * the control weakness an auditor looks for.
 */
export interface TransferDoc {
  _id: string; // TR-4001
  assetId: string;
  assetName: string;
  from: string;
  to: string;
  requester: string;
  approver: string;
  status: TransferStatus;
  requestedAt: Date;
  approvedAt?: Date;
  receivedAt?: Date;
  reason: string;
}

const transferSchema = new Schema<TransferDoc>(
  {
    _id: { type: String, required: true },
    assetId: { type: String, required: true, ref: 'Asset', index: true },
    assetName: { type: String, required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    requester: { type: String, required: true },
    approver: { type: String, default: '' },
    status: { type: String, required: true, enum: TRANSFER_STATUSES, default: 'Pending', index: true },
    requestedAt: { type: Date, required: true, index: true },
    approvedAt: Date,
    receivedAt: Date,
    reason: { type: String, default: '' },
  },
  { versionKey: false },
);

transferSchema.plugin(baseSchemaPlugin);
transferSchema.index({ assetName: 'text', reason: 'text' }, { name: 'transfer_search' });

/** Forward-only. A received transfer is history, not a record to reopen. */
export const TRANSFER_FLOW: Record<TransferStatus, TransferStatus[]> = {
  Pending: ['Approved', 'Rejected'],
  Approved: ['In Transit'],
  'In Transit': ['Received'],
  Received: [],
  Rejected: [],
};

export const Transfer = model<TransferDoc>('Transfer', transferSchema);

// ── Reservations ─────────────────────────────────────────────────────────────
/** A booking that holds an asset for someone over a window. */
export interface ReservationDoc {
  _id: string; // RES-7001
  assetId: string;
  assetName: string;
  reservedBy: string;
  /** Day offsets within the displayed week, 0 = Monday. */
  startDay: number;
  endDay: number;
  startLabel: string;
  endLabel: string;
  status: ReservationStatus;
  createdAt: Date;
  updatedAt: Date;
}

const reservationSchema = new Schema<ReservationDoc>(
  {
    _id: { type: String, required: true },
    assetId: { type: String, required: true, ref: 'Asset', index: true },
    assetName: { type: String, required: true },
    reservedBy: { type: String, required: true },
    startDay: { type: Number, required: true, min: 0, max: 6 },
    endDay: { type: Number, required: true, min: 0, max: 6 },
    startLabel: { type: String, required: true },
    endLabel: { type: String, required: true },
    status: { type: String, required: true, enum: RESERVATION_STATUSES, default: 'Pending', index: true },
  },
  { timestamps: true },
);

reservationSchema.plugin(baseSchemaPlugin);
export const Reservation = model<ReservationDoc>('Reservation', reservationSchema);
