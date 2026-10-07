import type {
  ApprovalDecision,
  AssetStatus,
  BulkStageChangeResult,
  LifecycleBoardColumn,
  LifecycleKpis,
  LifecycleStage,
  RequestStageChangeInput,
  RoleId,
} from '@access-genie/shared';
import { LIFECYCLE_APPROVAL_REQUIRED, LIFECYCLE_FLOW, LIFECYCLE_ROLE_MATRIX, LIFECYCLE_STAGES } from '@access-genie/shared';
import { Activity, Asset, LifecycleTransition, PmSchedule, nextId, type AssetDoc, type LifecycleTransitionDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { notify, notifyRoles } from './notification.service.js';
import { openIfRequired, openRequestFor } from './approval.service.js';
import { assetClause, locationClause, type VisibleScope } from './tenancy.service.js';

/**
 * The lifecycle workflow engine — the one place `Asset.lifecycleStage` is
 * ever written. Shaped after `operations.service.ts`'s transfer flow: a
 * request is checked against a flow graph, gated stages open a `Pending`
 * row instead of applying, and approval enforces segregation of duties
 * (the approver may not be the requester).
 *
 * Every caller — the manual "Change Stage" dialog, a bulk action, or an
 * automation hook (registration, custody, work orders) — goes through
 * `applyLifecycleTransition()` at the bottom of a successful request. There
 * is no second place that writes the field.
 */

const HEALTH_ATTENTION_FLOOR = 45;
const WARRANTY_ATTENTION_DAYS = 30;

async function scopedAsset(scope: VisibleScope, assetId: string): Promise<AssetDoc> {
  const asset = await Asset.findOne({ _id: assetId, ...locationClause(scope) }).lean<AssetDoc>();
  if (!asset) throw ApiError.notFound('Asset');
  return asset;
}

function daysUntil(date: Date | undefined, now: Date): number | null {
  if (!date) return null;
  return Math.round((date.getTime() - now.getTime()) / 86_400_000);
}

/**
 * The registry status a stage implies, given the status the asset has now.
 *
 * `status` and `lifecycleStage` are separate fields, and nothing kept them in
 * step: an approved move into Maintenance left the registry, the dashboard
 * tiles and every status filter saying "Active", so the approval visibly did
 * nothing anywhere but the lifecycle board. Only the stages that have an
 * unambiguous status are mapped; a status somebody set for another reason
 * (Missing, Staging) is left alone.
 */
function statusForStage(toStage: LifecycleStage, current: AssetStatus): AssetStatus {
  if (toStage === 'Maintenance') return 'Maintenance';
  if (toStage === 'Retired' || toStage === 'Disposed') return 'End_Of_Life';
  if (current === 'Maintenance' && (toStage === 'Assigned / In Service' || toStage === 'Available' || toStage === 'Returned')) {
    return 'Active';
  }
  return current;
}

/** Low-level primitive: writes the stage, appends the timeline, notifies. */
export async function applyLifecycleTransition(
  assetId: string,
  toStage: LifecycleStage,
  opts: {
    actor: string;
    actorId?: string;
    reason: string;
    comments?: string;
    automated?: boolean;
    documentIds?: string[];
    /**
     * The `Pending` row this application settles. An approved request already
     * has its transition row — marked Approved by `decideStageChange` — and
     * writing a second, `Applied` one put the same move on the asset's
     * lifecycle timeline twice.
     */
    settles?: LifecycleTransitionDoc;
  },
): Promise<AssetDoc> {
  const asset = await Asset.findById(assetId);
  if (!asset) throw ApiError.notFound('Asset');

  const fromStage = asset.lifecycleStage;
  asset.lifecycleStage = toStage;
  asset.status = statusForStage(toStage, asset.status);
  await asset.save();

  await Activity.create({
    assetId,
    type: 'Lifecycle',
    description: opts.comments
      ? `Stage changed from ${fromStage} to ${toStage} — ${opts.reason} (${opts.comments})`
      : `Stage changed from ${fromStage} to ${toStage} — ${opts.reason}`,
    actor: opts.actor,
    timestamp: new Date(),
  });

  if (!opts.settles) {
    await LifecycleTransition.create({
      _id: await nextId('lifecycleTransition', 'LTX'),
      assetId,
      assetName: asset.name,
      fromStage,
      toStage,
      reason: opts.reason,
      comments: opts.comments,
      requester: opts.actor,
      requesterId: opts.actorId,
      status: 'Applied',
      approvals: [],
      documentIds: opts.documentIds ?? [],
      automated: opts.automated ?? false,
      requestedAt: new Date(),
      decidedAt: new Date(),
    });
  }

  await notify({
    scopeId: asset.location?.id,
    title: `${asset.name} → ${toStage}`,
    body: `${asset._id} moved from ${fromStage} to ${toStage}${opts.automated ? ' (automated)' : ` by ${opts.actor}`}.`,
    category: 'Lifecycle',
  });

  return asset.toObject();
}

/**
 * Request a stage change. Immediate for an ungated target; otherwise opens a
 * `Pending` row and leaves the asset's stage untouched until `decideStageChange`
 * approves it.
 */
export async function requestStageChange(
  scope: VisibleScope,
  assetId: string,
  input: RequestStageChangeInput,
  actor: string,
  role: RoleId,
  actorId?: string,
): Promise<{ status: 'Applied' | 'Pending'; asset?: AssetDoc; transition: LifecycleTransitionDoc }> {
  const asset = await scopedAsset(scope, assetId);

  const from = asset.lifecycleStage;
  const allowed = LIFECYCLE_FLOW[from] ?? [];
  if (!allowed.includes(input.toStage)) {
    throw ApiError.badRequest(
      allowed.length
        ? `An asset in ${from} can only move to: ${allowed.join(', ')}.`
        : `${from} is a terminal stage — it cannot change.`,
    );
  }

  if (!LIFECYCLE_ROLE_MATRIX.canRequestAny.includes(role)) {
    throw ApiError.forbidden('Your role cannot change an asset’s lifecycle stage.');
  }

  if (LIFECYCLE_APPROVAL_REQUIRED.includes(input.toStage)) {
    const eligible = LIFECYCLE_ROLE_MATRIX.canApprove[input.toStage] ?? [];
    const transition = await LifecycleTransition.create({
      _id: await nextId('lifecycleTransition', 'LTX'),
      assetId,
      assetName: asset.name,
      fromStage: from,
      toStage: input.toStage,
      reason: input.reason,
      comments: input.comments,
      requester: actor,
      requesterId: actorId,
      status: 'Pending',
      approvals: eligible.map((r) => ({ role: r, status: 'Pending' as const })),
      documentIds: input.documentIds ?? [],
      automated: false,
      requestedAt: new Date(),
    });

    // A disposal is the one stage change Administration can put behind a
    // configured approval chain (`asset_disposal`, listed as wired in
    // shared/governance.ts). Nothing used to open that request, so a disposal
    // workflow could be built, activated and then never fire. When one covers
    // this asset, the chain decides the request and Approvals settles it.
    if (input.toStage === 'Disposed' && actorId) {
      await openIfRequired({
        trigger: 'asset_disposal',
        subjectId: transition._id,
        subjectLabel: `${asset.name} → Disposed`,
        scopeId: asset.location?.id,
        requestedBy: actorId,
        requestedByName: actor,
      });
    }

    await notifyRoles(eligible, {
      scopeId: asset.location?.id,
      title: `Approval needed: ${asset.name} → ${input.toStage}`,
      body: `${actor} requested ${asset._id} move to ${input.toStage}. Reason: ${input.reason}`,
      category: 'Approval',
    });

    return { status: 'Pending', transition: transition.toObject() };
  }

  const updated = await applyLifecycleTransition(assetId, input.toStage, {
    actor,
    actorId,
    reason: input.reason,
    comments: input.comments,
    documentIds: input.documentIds,
  });
  const transition = await LifecycleTransition.findOne({ assetId, toStage: input.toStage })
    .sort({ requestedAt: -1 })
    .lean<LifecycleTransitionDoc>();

  return { status: 'Applied', asset: updated, transition: transition! };
}

/** Whether this caller is the person who raised the request. */
function isRequester(transition: Pick<LifecycleTransitionDoc, 'requester' | 'requesterId'>, actor: string, actorId?: string): boolean {
  // By id whenever the row has one. The name is only a fallback for rows
  // written before ids were stored — a display name is editable by its owner,
  // so comparing names let a requester rename themselves and self-approve.
  if (transition.requesterId) return transition.requesterId === actorId;
  return transition.requester === actor;
}

/** Record a decision on a pending row and, when approved, apply the stage. */
async function settle(
  transition: InstanceType<typeof LifecycleTransition>,
  decision: ApprovalDecision,
  actor: string,
  role: RoleId | undefined,
  scopeId: string | undefined,
): Promise<void> {
  transition.status = decision;
  transition.decidedAt = new Date();
  transition.approvals = transition.approvals.map((a) =>
    !role || a.role === role ? { ...a, status: decision, actor, at: new Date() } : a,
  );
  await transition.save();

  if (decision === 'Approved') {
    await applyLifecycleTransition(transition.assetId, transition.toStage, {
      actor,
      reason: `Approved: ${transition.reason}`,
      comments: transition.comments,
      documentIds: transition.documentIds,
      settles: transition.toObject(),
    });
  } else {
    await notify({
      scopeId,
      title: `Rejected: ${transition.assetName} → ${transition.toStage}`,
      body: `${actor} rejected the request from ${transition.requester}.`,
      category: 'Approval',
    });
  }
}

/**
 * Decide a `Pending` transition. Segregation of duties mirrors
 * `advanceTransfer`: the requester may not decide their own request. The
 * decider's role must additionally be one the target stage's approval list
 * names.
 */
export async function decideStageChange(
  scope: VisibleScope,
  transitionId: string,
  decision: ApprovalDecision,
  actor: string,
  role: RoleId,
  actorId?: string,
): Promise<LifecycleTransitionDoc> {
  const transition = await LifecycleTransition.findById(transitionId);
  if (!transition) throw ApiError.notFound('Lifecycle transition');
  const asset = await scopedAsset(scope, transition.assetId);
  if (transition.status !== 'Pending') {
    throw ApiError.badRequest(`This request is already ${transition.status.toLowerCase()}.`);
  }
  if (isRequester(transition, actor, actorId)) {
    throw ApiError.forbidden('A stage change cannot be approved by the person who requested it.');
  }

  const eligible = LIFECYCLE_ROLE_MATRIX.canApprove[transition.toStage] ?? [];
  if (!eligible.includes(role)) {
    throw ApiError.forbidden(`Only ${eligible.join(', ') || 'an administrator'} may decide this request.`);
  }

  // Same rule as transfers: a request held by a configured approval chain is
  // decided in Approvals, step by step, not around it from here.
  const governed = await openRequestFor('asset_disposal', transitionId);
  if (governed) {
    throw ApiError.conflict(
      `This request is governed by "${governed.workflowName}" and is awaiting approval step ` +
        `${governed.currentStep + 1} of ${governed.steps.length}. Decide it from Approvals.`,
    );
  }

  await settle(transition, decision, actor, role, asset.location?.id);
  return transition.toObject();
}

/**
 * Apply a settled `asset_disposal` approval to the transition it was holding.
 *
 * Called by the approvals controller once the chain finishes. Like the transfer
 * equivalent it logs rather than throws: the approval is already recorded, and
 * a request that was decided some other way in the meantime is a race, not a
 * reason to lose the decision.
 */
export async function applyDisposalApproval(transitionId: string, outcome: 'Approved' | 'Rejected', approver: string): Promise<void> {
  const transition = await LifecycleTransition.findById(transitionId);
  if (!transition || transition.status !== 'Pending') return;
  const asset = await Asset.findById(transition.assetId).lean();
  await settle(transition, outcome, approver, undefined, asset?.location?.id);
}

/** A pending stage change as the approvals queue shows it. */
export interface PendingStageChange extends LifecycleTransitionDoc {
  /** Whether *this* caller may decide it here, right now. */
  canDecide: boolean;
  /** Set when a configured approval chain holds it — decided from that request instead. */
  approvalRequestId?: string;
}

/**
 * Every pending stage change in the caller's estate.
 *
 * Gated stage changes opened a `Pending` row and notified the approvers, but
 * no screen listed them and nothing called the decide endpoint — so a request
 * for Maintenance or Retired could be raised and never settled. This is the
 * queue's read side; `canDecide` is worked out here, from the same rules
 * `decideStageChange` enforces, so the client never second-guesses them.
 */
export async function listPendingStageChanges(
  scope: VisibleScope,
  actor: string,
  role: RoleId,
  actorId?: string,
): Promise<PendingStageChange[]> {
  const rows = await LifecycleTransition.find({ ...(await assetClause(scope)), status: 'Pending' })
    .sort({ requestedAt: -1, _id: -1 })
    .limit(200)
    .lean<LifecycleTransitionDoc[]>();

  return Promise.all(
    rows.map(async (row) => {
      const governed = row.toStage === 'Disposed' ? await openRequestFor('asset_disposal', row._id) : null;
      const eligible = LIFECYCLE_ROLE_MATRIX.canApprove[row.toStage] ?? [];
      return {
        ...row,
        approvalRequestId: governed?._id,
        canDecide: !governed && eligible.includes(role) && !isRequester(row, actor, actorId),
      };
    }),
  );
}

export async function listTransitions(scope: VisibleScope, assetId: string): Promise<LifecycleTransitionDoc[]> {
  await scopedAsset(scope, assetId);
  return LifecycleTransition.find({ assetId }).sort({ requestedAt: -1 }).lean();
}

/** Apply one target stage across a selection. Partial success, same shape as `bulkUpdateAssets`. */
export async function bulkStageChange(
  scope: VisibleScope,
  ids: string[],
  input: RequestStageChangeInput,
  actor: string,
  role: RoleId,
  actorId?: string,
): Promise<BulkStageChangeResult> {
  const updated: string[] = [];
  const pendingApproval: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      const result = await requestStageChange(scope, id, input, actor, role, actorId);
      if (result.status === 'Applied') updated.push(id);
      else pendingApproval.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof ApiError ? err.message : 'Stage change failed' });
    }
  }

  return { updated, pendingApproval, failed };
}

/** The Board View's per-column aggregates. */
export async function getLifecycleBoard(scope: VisibleScope): Promise<LifecycleBoardColumn[]> {
  const now = new Date();
  const attentionCutoff = new Date(now.getTime() + WARRANTY_ATTENTION_DAYS * 86_400_000);

  const rows = await Asset.aggregate<{
    _id: LifecycleStage;
    total: number;
    avgHealth: number;
    totalValue: number;
    criticalCount: number;
    requiringAttention: number;
  }>([
    { $match: locationClause(scope) },
    {
      $group: {
        _id: '$lifecycleStage',
        total: { $sum: 1 },
        avgHealth: { $avg: '$healthScore' },
        totalValue: { $sum: { $ifNull: ['$bookValue', 0] } },
        criticalCount: { $sum: { $cond: [{ $eq: ['$healthStatus', 'Critical'] }, 1, 0] } },
        requiringAttention: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $lt: ['$healthScore', HEALTH_ATTENTION_FLOOR] },
                  { $and: [{ $ne: ['$warrantyExpiry', null] }, { $lt: ['$warrantyExpiry', attentionCutoff] }] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const byStage = new Map(rows.map((r) => [r._id, r]));
  return LIFECYCLE_STAGES.map((stage) => {
    const r = byStage.get(stage);
    return {
      stage,
      total: r?.total ?? 0,
      requiringAttention: r?.requiringAttention ?? 0,
      avgHealth: Math.round(r?.avgHealth ?? 0),
      totalValue: Math.round(r?.totalValue ?? 0),
      criticalCount: r?.criticalCount ?? 0,
    };
  });
}

/** The enterprise KPI row (§7). */
export async function getLifecycleKpis(scope: VisibleScope): Promise<LifecycleKpis> {
  const now = new Date();
  const warrantyWindow = new Date(now.getTime() + WARRANTY_ATTENTION_DAYS * 86_400_000);

  const locations = locationClause(scope);
  const assets = await assetClause(scope);

  const [
    inService,
    maintenanceDue,
    warrantyExpiring,
    returned,
    retired,
    disposed,
    awaitingAssignment,
    requiringApproval,
    totals,
  ] = await Promise.all([
    Asset.countDocuments({ ...locations, lifecycleStage: 'Assigned / In Service' }),
    PmSchedule.countDocuments({ ...assets, nextDue: { $lte: now } }),
    Asset.countDocuments({ ...locations, warrantyExpiry: { $gte: now, $lte: warrantyWindow } }),
    Asset.countDocuments({ ...locations, lifecycleStage: 'Returned' }),
    Asset.countDocuments({ ...locations, lifecycleStage: 'Retired' }),
    Asset.countDocuments({ ...locations, lifecycleStage: 'Disposed' }),
    Asset.countDocuments({ ...locations, lifecycleStage: 'Available' }),
    LifecycleTransition.countDocuments({ ...assets, status: 'Pending' }),
    Asset.aggregate<{ _id: null; avgHealth: number; value: number; avgAgeMs: number }>([
      { $match: locations },
      {
        $group: {
          _id: null,
          avgHealth: { $avg: '$healthScore' },
          value: { $sum: { $ifNull: ['$bookValue', 0] } },
          avgAgeMs: { $avg: { $subtract: [now, '$purchaseDate'] } },
        },
      },
    ]),
  ]);

  const t = totals[0];
  return {
    inService,
    maintenanceDue,
    warrantyExpiring,
    returned,
    retired,
    disposed,
    awaitingAssignment,
    avgHealth: Math.round(t?.avgHealth ?? 0),
    avgAgeYears: Math.round(((t?.avgAgeMs ?? 0) / (365.25 * 86_400_000)) * 10) / 10,
    portfolioValue: Math.round(t?.value ?? 0),
    requiringApproval,
  };
}

// Re-exported so a caller only needs one module for "how many days until X".
export { daysUntil };

const IDLE_DAYS = 30;
const UNASSIGNED_DAYS = 14;

/**
 * §9 Notifications — the daily sweep. Per-transition notifications
 * (`applyLifecycleTransition`, approval requests) cover *events*; this
 * covers the ones nothing triggers — a warranty does not "happen", it just
 * gets closer. One digest per condition rather than one row per asset, so a
 * fleet with forty expiring warranties produces one notification to read,
 * not forty.
 */
export async function raiseLifecycleAlerts(): Promise<{
  warrantyExpiring: number;
  maintenanceDue: number;
  idle: number;
  unassigned: number;
}> {
  const now = new Date();
  const warrantyWindow = new Date(now.getTime() + WARRANTY_ATTENTION_DAYS * 86_400_000);
  const idleCutoff = new Date(now.getTime() - IDLE_DAYS * 86_400_000);
  const unassignedCutoff = new Date(now.getTime() - UNASSIGNED_DAYS * 86_400_000);

  const [warrantyExpiring, maintenanceDue, unassigned, inService] = await Promise.all([
    Asset.countDocuments({ warrantyExpiry: { $gte: now, $lte: warrantyWindow } }),
    PmSchedule.countDocuments({ nextDue: { $lte: now } }),
    Asset.countDocuments({ lifecycleStage: 'Available', updatedAt: { $lte: unassignedCutoff } }),
    Asset.find({ lifecycleStage: 'Assigned / In Service' }).select('_id').lean(),
  ]);

  // "Idle too long" has no field of its own — it is read off the timeline:
  // an in-service asset nothing has touched in IDLE_DAYS. A per-asset check
  // rather than one aggregation because the estate here is small enough that
  // clarity wins over a $lookup pipeline for the same answer.
  let idle = 0;
  for (const a of inService) {
    const recent = await Activity.exists({ assetId: a._id, timestamp: { $gte: idleCutoff } });
    if (!recent) idle += 1;
  }

  if (warrantyExpiring > 0) {
    await notify({
      platformOnly: true,
      category: 'Warranty',
      title: `${warrantyExpiring} asset${warrantyExpiring === 1 ? '' : 's'} with warranty expiring soon`,
      body: `Warranty runs out within ${WARRANTY_ATTENTION_DAYS} days on ${warrantyExpiring} asset${warrantyExpiring === 1 ? '' : 's'}.`,
    });
  }
  if (maintenanceDue > 0) {
    await notify({
      platformOnly: true,
      category: 'Maintenance',
      title: `${maintenanceDue} maintenance schedule${maintenanceDue === 1 ? '' : 's'} due`,
      body: `${maintenanceDue} preventive maintenance schedule${maintenanceDue === 1 ? '' : 's'} fell due.`,
    });
  }
  if (idle > 0) {
    await notify({
      platformOnly: true,
      category: 'Lifecycle',
      title: `${idle} in-service asset${idle === 1 ? '' : 's'} idle`,
      body: `No activity recorded in over ${IDLE_DAYS} days on ${idle} in-service asset${idle === 1 ? '' : 's'}.`,
    });
  }
  if (unassigned > 0) {
    await notify({
      platformOnly: true,
      category: 'Lifecycle',
      title: `${unassigned} asset${unassigned === 1 ? '' : 's'} awaiting assignment`,
      body: `${unassigned} asset${unassigned === 1 ? '' : 's'} have sat Available for over ${UNASSIGNED_DAYS} days with nobody assigned.`,
    });
  }

  return { warrantyExpiring, maintenanceDue, idle, unassigned };
}
