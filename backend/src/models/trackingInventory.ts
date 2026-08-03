import { model, Schema } from 'mongoose';
import {
  AUDIT_METHODS,
  AUDIT_STATES,
  EXCEPTION_KINDS,
  MOVEMENT_DIRECTIONS,
  MOVEMENT_STATES,
  RACK_SLOT_STATES,
  ROOM_KINDS,
  UNKNOWN_STATES,
  type AuditMethod,
  type AuditState,
  type ExceptionKind,
  type MovementDirection,
  type MovementState,
  type RackSlot,
  type RoomKind,
  type UnknownState,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

// Inventory tracking: answering "is everything where it should be?" — the rooms
// and racks that hold the estate, the audits that verify them, and the three
// kinds of finding an audit produces (an exception, an unexplained tag, or a
// legitimate movement).

// ── Rooms ────────────────────────────────────────────────────────────────────
export interface InventoryRoomDoc {
  _id: string; // RM-01
  name: string;
  facility: string;
  zoneId: string;
  kind: RoomKind;
  expected: number;
  detected: number;
  unexpected: number;
  missing: number;
  /** Detected against expected, 0–100. */
  accuracy: number;
  lastVerified: Date;
  custodian: string;
  rackCount: number;
  /** Whether the room re-verifies itself continuously from the radio estate. */
  autoVerify: boolean;
}

const inventoryRoomSchema = new Schema<InventoryRoomDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    facility: { type: String, required: true, ref: 'TrackedFacility', index: true },
    zoneId: { type: String, required: true, ref: 'TrackedZone', index: true },
    kind: { type: String, required: true, enum: ROOM_KINDS, index: true },
    expected: { type: Number, default: 0, min: 0 },
    detected: { type: Number, default: 0, min: 0 },
    unexpected: { type: Number, default: 0, min: 0 },
    missing: { type: Number, default: 0, min: 0 },
    accuracy: { type: Number, default: 100, min: 0, max: 100 },
    lastVerified: { type: Date, required: true },
    custodian: { type: String, default: '' },
    rackCount: { type: Number, default: 0, min: 0 },
    autoVerify: { type: Boolean, default: false },
  },
  { versionKey: false },
);

inventoryRoomSchema.plugin(baseSchemaPlugin);
export const InventoryRoom = model<InventoryRoomDoc>('InventoryRoom', inventoryRoomSchema);

// ── Racks ────────────────────────────────────────────────────────────────────
export interface RackDoc {
  _id: string; // RK-01
  name: string;
  roomId: string;
  heightU: number;
  slots: RackSlot[];
  status: 'Verified' | 'Variance' | 'Unverified';
  lastVerified: Date;
  /** Power and thermal context, so rack monitoring answers more than "is it there". */
  loadPct: number;
  inletTempC: number;
}

const rackSlotSchema = new Schema(
  {
    u: { type: Number, required: true, min: 1 }, // rack unit position, 1 = bottom
    state: { type: String, required: true, enum: RACK_SLOT_STATES, default: 'Empty' },
    // Populated for occupied slots. An `Unexpected` slot has a tag but no
    // asset — that mismatch is exactly what the audit is looking for.
    assetId: { type: String, ref: 'Asset' },
    assetName: String,
    tagId: String,
  },
  { _id: false },
);

const rackSchema = new Schema<RackDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    roomId: { type: String, required: true, ref: 'InventoryRoom', index: true },
    heightU: { type: Number, required: true, min: 1 },
    slots: { type: [rackSlotSchema], default: [] },
    status: { type: String, required: true, enum: ['Verified', 'Variance', 'Unverified'], default: 'Unverified', index: true },
    lastVerified: { type: Date, required: true },
    loadPct: { type: Number, default: 0, min: 0, max: 100 },
    inletTempC: { type: Number, default: 0 },
  },
  { versionKey: false },
);

rackSchema.plugin(baseSchemaPlugin);
export const Rack = model<RackDoc>('Rack', rackSchema);

// ── Audit sessions ───────────────────────────────────────────────────────────
export interface AuditSessionDoc {
  _id: string; // AUD-01
  name: string;
  scope: string;
  facility: string;
  state: AuditState;
  method: AuditMethod;
  expected: number;
  detected: number;
  unexpected: number;
  missing: number;
  /** 0–100. */
  progress: number;
  startedAt: Date;
  dueAt: Date;
  approvedAt?: Date;
  owner: string;
  approver: string;
  note: string;
}

const auditSessionSchema = new Schema<AuditSessionDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    scope: { type: String, required: true },
    facility: { type: String, required: true, index: true },
    state: { type: String, required: true, enum: AUDIT_STATES, default: 'Scheduled', index: true },
    method: { type: String, required: true, enum: AUDIT_METHODS, default: 'Assisted' },
    expected: { type: Number, default: 0, min: 0 },
    detected: { type: Number, default: 0, min: 0 },
    unexpected: { type: Number, default: 0, min: 0 },
    missing: { type: Number, default: 0, min: 0 },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    startedAt: { type: Date, required: true },
    dueAt: { type: Date, required: true, index: true },
    approvedAt: Date,
    owner: { type: String, default: '' },
    approver: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { versionKey: false },
);

auditSessionSchema.plugin(baseSchemaPlugin);
export const AuditSession = model<AuditSessionDoc>('AuditSession', auditSessionSchema);

// ── Exceptions ───────────────────────────────────────────────────────────────
/** A finding an audit or the live estate produced that a human has to close. */
export interface InventoryExceptionDoc {
  _id: string; // EXC-01
  kind: ExceptionKind;
  assetId?: string;
  assetName?: string;
  tagId?: string;
  room: string;
  expectedRoom?: string;
  facility: string;
  detectedAt: Date;
  /** How long it has been open — the number that drives escalation. */
  ageHours: number;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  state: 'Open' | 'Assigned' | 'Resolved';
  owner?: string;
  valueInr: number;
  recommendation: string;
}

const inventoryExceptionSchema = new Schema<InventoryExceptionDoc>(
  {
    _id: { type: String, required: true },
    kind: { type: String, required: true, enum: EXCEPTION_KINDS, index: true },
    assetId: { type: String, ref: 'Asset', index: true, sparse: true },
    assetName: String,
    tagId: String,
    room: { type: String, required: true },
    expectedRoom: String,
    facility: { type: String, required: true, index: true },
    detectedAt: { type: Date, required: true, index: true },
    ageHours: { type: Number, default: 0, min: 0 },
    severity: { type: String, required: true, enum: ['Critical', 'High', 'Medium', 'Low'], index: true },
    state: { type: String, required: true, enum: ['Open', 'Assigned', 'Resolved'], default: 'Open', index: true },
    owner: String,
    valueInr: { type: Number, default: 0, min: 0 },
    recommendation: { type: String, default: '' },
  },
  { versionKey: false },
);

inventoryExceptionSchema.plugin(baseSchemaPlugin);
export const InventoryException = model<InventoryExceptionDoc>('InventoryException', inventoryExceptionSchema);

// ── Unknown detections ───────────────────────────────────────────────────────
/** A tag the estate can hear but cannot name — either an untracked asset or a visitor. */
export interface UnknownDetectionDoc {
  _id: string; // UNK-01
  tagId: string;
  firstSeen: Date;
  lastSeen: Date;
  zone: string;
  facility: string;
  seenCount: number;
  state: UnknownState;
  /** Best guess at what this is, and how confident the match is (0–100). */
  suggestion: string;
  suggestionConfidence: number;
  reason: string;
}

const unknownDetectionSchema = new Schema<UnknownDetectionDoc>(
  {
    _id: { type: String, required: true },
    tagId: { type: String, required: true, index: true },
    firstSeen: { type: Date, required: true },
    lastSeen: { type: Date, required: true, index: true },
    zone: { type: String, default: '' },
    facility: { type: String, required: true, index: true },
    seenCount: { type: Number, default: 1, min: 0 },
    state: { type: String, required: true, enum: UNKNOWN_STATES, default: 'New', index: true },
    suggestion: { type: String, default: '' },
    suggestionConfidence: { type: Number, default: 0, min: 0, max: 100 },
    reason: { type: String, default: '' },
  },
  { versionKey: false },
);

unknownDetectionSchema.plugin(baseSchemaPlugin);
export const UnknownDetection = model<UnknownDetectionDoc>('UnknownDetection', unknownDetectionSchema);

// ── Movements ────────────────────────────────────────────────────────────────
/** An authorised check-out/check-in — the legitimate reason an asset left its room. */
export interface MovementTxnDoc {
  _id: string; // MOV-01
  assetId: string;
  assetName: string;
  direction: MovementDirection;
  person: string;
  department: string;
  at: Date;
  /** Absent for a check-*in*, which is the return itself. */
  dueBack?: Date;
  returnedAt?: Date;
  purpose: string;
  location: string;
  state: MovementState;
  /** Whether the estate confirmed the movement, or a human simply asserted it. */
  verified: boolean;
  approver?: string;
}

const movementTxnSchema = new Schema<MovementTxnDoc>(
  {
    _id: { type: String, required: true },
    assetId: { type: String, required: true, ref: 'Asset', index: true },
    assetName: { type: String, required: true },
    direction: { type: String, required: true, enum: MOVEMENT_DIRECTIONS, index: true },
    person: { type: String, required: true },
    department: { type: String, default: '' },
    at: { type: Date, required: true, index: true },
    dueBack: { type: Date, index: true },
    returnedAt: Date,
    purpose: { type: String, default: '' },
    location: { type: String, default: '' },
    state: { type: String, required: true, enum: MOVEMENT_STATES, index: true },
    verified: { type: Boolean, default: false },
    approver: String,
  },
  { versionKey: false },
);

movementTxnSchema.plugin(baseSchemaPlugin);
export const MovementTxn = model<MovementTxnDoc>('MovementTxn', movementTxnSchema);
