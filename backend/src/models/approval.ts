import { model, Schema } from 'mongoose';
import {
  APPROVAL_REQUEST_STATUSES,
  APPROVAL_STEP_DECISIONS,
  APPROVAL_TRIGGERS,
  ROLE_IDS,
  type ApprovalRequestStatus,
  type ApprovalStepDecision,
  type ApprovalTrigger,
  type RoleId,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * A live approval — the running instance of a workflow against one transaction.
 *
 * This is the record that makes Approval Workflows a feature rather than a
 * settings screen. A workflow says "an asset transfer out of this facility needs
 * the facility manager and then an org admin"; a request is *this* transfer,
 * waiting on *those* people, with what each of them decided and when.
 *
 * Three decisions are worth stating.
 *
 * **The steps are copied, not referenced.** A request holds its own array of
 * steps taken from the workflow at the moment it opened. Editing the workflow
 * afterwards changes what future requests demand and leaves settled ones exactly
 * as they were decided — which is the only reading of an approval history that
 * can be trusted. A request that resolved its steps through `workflowId` on
 * every read would silently rewrite the past every time an administrator added a
 * step.
 *
 * **`currentStep` is stored, not derived.** It could be computed as "the first
 * step without a decision", and that would be correct right up until a step is
 * skipped or a rejection settles the request early. Storing it makes the state
 * machine explicit and gives the pending-queue query an index to use.
 *
 * **History is append-only.** Decisions are never edited in place; a change of
 * mind is a new entry. An approval trail that can be overwritten is not a trail.
 */

export interface ApprovalRequestStepDoc {
  order: number;
  name: string;
  approverRole?: RoleId;
  approverUserId?: string;
  decision?: ApprovalStepDecision;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: Date;
  comment?: string;
}

export interface ApprovalHistoryDoc {
  at: Date;
  actorId: string;
  actorName: string;
  action: 'opened' | 'approved' | 'rejected' | 'cancelled';
  step?: number;
  comment?: string;
}

export interface ApprovalRequestDoc {
  _id: string; // APR-1
  workflowId: string;
  workflowName: string;
  trigger: ApprovalTrigger;
  subjectType: ApprovalTrigger;
  subjectId: string;
  subjectLabel: string;
  scopeId?: string;
  status: ApprovalRequestStatus;
  /** Index of the step awaiting a decision; -1 once the request is settled. */
  currentStep: number;
  steps: ApprovalRequestStepDoc[];
  history: ApprovalHistoryDoc[];
  requestedBy: string;
  requestedByName: string;
  requestedAt: Date;
  settledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const stepSchema = new Schema<ApprovalRequestStepDoc>(
  {
    order: { type: Number, required: true, min: 1 },
    name: { type: String, required: true },
    approverRole: { type: String, enum: ROLE_IDS },
    approverUserId: { type: String },
    decision: { type: String, enum: APPROVAL_STEP_DECISIONS },
    decidedBy: { type: String },
    decidedByName: { type: String },
    decidedAt: { type: Date },
    comment: { type: String, default: '' },
  },
  { _id: false },
);

const historySchema = new Schema<ApprovalHistoryDoc>(
  {
    at: { type: Date, required: true },
    actorId: { type: String, required: true },
    actorName: { type: String, required: true },
    action: { type: String, required: true, enum: ['opened', 'approved', 'rejected', 'cancelled'] },
    step: { type: Number },
    comment: { type: String, default: '' },
  },
  { _id: false },
);

const approvalRequestSchema = new Schema<ApprovalRequestDoc>(
  {
    _id: { type: String, required: true },
    workflowId: { type: String, required: true, index: true },
    workflowName: { type: String, required: true },
    trigger: { type: String, required: true, enum: APPROVAL_TRIGGERS, index: true },
    subjectType: { type: String, required: true, enum: APPROVAL_TRIGGERS },
    subjectId: { type: String, required: true, index: true },
    subjectLabel: { type: String, default: '' },
    scopeId: { type: String, index: true },
    status: { type: String, required: true, enum: APPROVAL_REQUEST_STATUSES, default: 'Pending', index: true },
    currentStep: { type: Number, required: true, default: 0 },
    steps: { type: [stepSchema], default: [] },
    history: { type: [historySchema], default: [] },
    requestedBy: { type: String, required: true },
    requestedByName: { type: String, default: '' },
    requestedAt: { type: Date, required: true },
    settledAt: { type: Date },
  },
  { versionKey: false, timestamps: true },
);

approvalRequestSchema.plugin(baseSchemaPlugin);

// The approvals inbox asks "what is pending, in my estate" on every visit, and
// the transfer flow asks "is there an open request for this subject" on every
// state change. Both get an index.
approvalRequestSchema.index({ status: 1, scopeId: 1 });
approvalRequestSchema.index({ subjectType: 1, subjectId: 1, status: 1 });

export const ApprovalRequest = model<ApprovalRequestDoc>('ApprovalRequest', approvalRequestSchema);
