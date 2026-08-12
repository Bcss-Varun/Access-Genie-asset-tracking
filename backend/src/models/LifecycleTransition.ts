import { model, Schema } from 'mongoose';
import {
  APPROVAL_STATUSES,
  LIFECYCLE_STAGES,
  ROLE_IDS,
  TRANSITION_STATUSES,
  type ApprovalStatus,
  type LifecycleStage,
  type RoleId,
  type TransitionStatus,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * The lifecycle's audit trail — every stage change an asset has ever had,
 * `Applied` immediately or held `Pending` an approval. Rows are never updated
 * once `Applied`/`Rejected`; a `Pending` row is the only mutable state
 * (`decideStageChange` flips it to `Approved`+applies, or `Rejected`), which
 * is what makes this collection the audit log per §12 rather than just
 * another activity feed. Shaped after `Transfer` (`./operations.ts`) — same
 * request/decide/segregation-of-duties pattern, applied to stage instead of
 * location.
 */
export interface LifecycleApprovalSub {
  role: RoleId;
  status: ApprovalStatus;
  actor?: string;
  at?: Date;
}

export interface LifecycleTransitionDoc {
  _id: string; // LTX-...
  assetId: string;
  assetName: string;
  fromStage: LifecycleStage;
  toStage: LifecycleStage;
  reason: string;
  comments?: string;
  requester: string;
  status: TransitionStatus;
  approvals: LifecycleApprovalSub[];
  documentIds: string[];
  automated: boolean;
  requestedAt: Date;
  decidedAt?: Date;
}

const approvalSchema = new Schema<LifecycleApprovalSub>(
  {
    role: { type: String, required: true, enum: ROLE_IDS },
    status: { type: String, required: true, enum: APPROVAL_STATUSES, default: 'Pending' },
    actor: String,
    at: Date,
  },
  { _id: false },
);

const lifecycleTransitionSchema = new Schema<LifecycleTransitionDoc>(
  {
    _id: { type: String, required: true },
    assetId: { type: String, required: true, ref: 'Asset', index: true },
    assetName: { type: String, required: true },
    fromStage: { type: String, required: true, enum: LIFECYCLE_STAGES },
    toStage: { type: String, required: true, enum: LIFECYCLE_STAGES },
    reason: { type: String, required: true },
    comments: String,
    requester: { type: String, required: true },
    status: { type: String, required: true, enum: TRANSITION_STATUSES, default: 'Applied', index: true },
    approvals: { type: [approvalSchema], default: [] },
    documentIds: { type: [String], default: [] },
    automated: { type: Boolean, required: true, default: false },
    requestedAt: { type: Date, required: true, default: Date.now },
    decidedAt: Date,
  },
  { versionKey: false },
);

lifecycleTransitionSchema.plugin(baseSchemaPlugin);
// The asset's own lifecycle timeline — newest first, same access pattern as `Activity`.
lifecycleTransitionSchema.index({ assetId: 1, requestedAt: -1 });
// The "Assets requiring approval" KPI + the approvals queue already have their
// index from `status: { ..., index: true }` above — nothing further to add here.

export const LifecycleTransition = model<LifecycleTransitionDoc>('LifecycleTransition', lifecycleTransitionSchema);
