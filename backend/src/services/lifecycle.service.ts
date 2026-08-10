import type {
  ApprovalDecision,
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

function daysUntil(date: Date | undefined, now: Date): number | null {
  if (!date) return null;
  return Math.round((date.getTime() - now.getTime()) / 86_400_000);
}

/** Low-level primitive: writes the stage, appends the timeline, notifies. */
export async function applyLifecycleTransition(
  assetId: string,
  toStage: LifecycleStage,
  opts: { actor: string; reason: string; comments?: string; automated?: boolean; documentIds?: string[] },
): Promise<AssetDoc> {
  const asset = await Asset.findById(assetId);
  if (!asset) throw ApiError.notFound('Asset');

  const fromStage = asset.lifecycleStage;
  asset.lifecycleStage = toStage;
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

  await LifecycleTransition.create({
    _id: await nextId('lifecycleTransition', 'LTX'),
    assetId,
    assetName: asset.name,
    fromStage,
    toStage,
    reason: opts.reason,
    comments: opts.comments,
    requester: opts.actor,
    status: 'Applied',
    approvals: [],
    documentIds: opts.documentIds ?? [],
    automated: opts.automated ?? false,
    requestedAt: new Date(),
    decidedAt: new Date(),
  });

  await notify({
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
  assetId: string,
  input: RequestStageChangeInput,
  actor: string,
  role: RoleId,
): Promise<{ status: 'Applied' | 'Pending'; asset?: AssetDoc; transition: LifecycleTransitionDoc }> {
  const asset = await Asset.findById(assetId).lean<AssetDoc>();
  if (!asset) throw ApiError.notFound('Asset');

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
      status: 'Pending',
      approvals: eligible.map((r) => ({ role: r, status: 'Pending' as const })),
      documentIds: input.documentIds ?? [],
      automated: false,
      requestedAt: new Date(),
    });

    await notifyRoles(eligible, {
      title: `Approval needed: ${asset.name} → ${input.toStage}`,
      body: `${actor} requested ${asset._id} move to ${input.toStage}. Reason: ${input.reason}`,
      category: 'Approval',
    });

    return { status: 'Pending', transition: transition.toObject() };
  }

  const updated = await applyLifecycleTransition(assetId, input.toStage, {
    actor,
    reason: input.reason,
    comments: input.comments,
    documentIds: input.documentIds,
  });
  const transition = await LifecycleTransition.findOne({ assetId, toStage: input.toStage })
    .sort({ requestedAt: -1 })
    .lean<LifecycleTransitionDoc>();

  return { status: 'Applied', asset: updated, transition: transition! };
}

/**
 * Decide a `Pending` transition. Segregation of duties mirrors
 * `advanceTransfer`: the requester may not decide their own request. The
 * decider's role must additionally be one the target stage's approval list
 * names.
 */
export async function decideStageChange(
  transitionId: string,
  decision: ApprovalDecision,
  actor: string,
  role: RoleId,
): Promise<LifecycleTransitionDoc> {
  const transition = await LifecycleTransition.findById(transitionId);
  if (!transition) throw ApiError.notFound('Lifecycle transition');
  if (transition.status !== 'Pending') {
    throw ApiError.badRequest(`This request is already ${transition.status.toLowerCase()}.`);
  }
  if (actor === transition.requester) {
    throw ApiError.forbidden('A stage change cannot be approved by the person who requested it.');
  }

  const eligible = LIFECYCLE_ROLE_MATRIX.canApprove[transition.toStage] ?? [];
  if (!eligible.includes(role)) {
    throw ApiError.forbidden(`Only ${eligible.join(', ') || 'an administrator'} may decide this request.`);
  }

  transition.status = decision;
  transition.decidedAt = new Date();
  transition.approvals = transition.approvals.map((a) =>
    a.role === role ? { ...a, status: decision, actor, at: new Date() } : a,
  );
  await transition.save();

  if (decision === 'Approved') {
    await applyLifecycleTransition(transition.assetId, transition.toStage, {
      actor,
      reason: `Approved: ${transition.reason}`,
      comments: transition.comments,
      documentIds: transition.documentIds,
    });
  } else {
    await notify({
      title: `Rejected: ${transition.assetName} → ${transition.toStage}`,
      body: `${actor} rejected the request from ${transition.requester}.`,
      category: 'Approval',
    });
  }

  return transition.toObject();
}

export async function listTransitions(assetId: string): Promise<LifecycleTransitionDoc[]> {
  return LifecycleTransition.find({ assetId }).sort({ requestedAt: -1 }).lean();
}

/** Apply one target stage across a selection. Partial success, same shape as `bulkUpdateAssets`. */
export async function bulkStageChange(
  ids: string[],
  input: RequestStageChangeInput,
  actor: string,
  role: RoleId,
): Promise<BulkStageChangeResult> {
  const updated: string[] = [];
  const pendingApproval: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      const result = await requestStageChange(id, input, actor, role);
      if (result.status === 'Applied') updated.push(id);
      else pendingApproval.push(id);
    } catch (err) {
      failed.push({ id, reason: err instanceof ApiError ? err.message : 'Stage change failed' });
    }
  }

  return { updated, pendingApproval, failed };
}

/** The Board View's per-column aggregates. */
export async function getLifecycleBoard(): Promise<LifecycleBoardColumn[]> {
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
export async function getLifecycleKpis(): Promise<LifecycleKpis> {
  const now = new Date();
  const warrantyWindow = new Date(now.getTime() + WARRANTY_ATTENTION_DAYS * 86_400_000);

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
    Asset.countDocuments({ lifecycleStage: 'Assigned / In Service' }),
    PmSchedule.countDocuments({ nextDue: { $lte: now } }),
    Asset.countDocuments({ warrantyExpiry: { $gte: now, $lte: warrantyWindow } }),
    Asset.countDocuments({ lifecycleStage: 'Returned' }),
    Asset.countDocuments({ lifecycleStage: 'Retired' }),
    Asset.countDocuments({ lifecycleStage: 'Disposed' }),
    Asset.countDocuments({ lifecycleStage: 'Available' }),
    LifecycleTransition.countDocuments({ status: 'Pending' }),
    Asset.aggregate<{ _id: null; avgHealth: number; value: number; avgAgeMs: number }>([
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
      category: 'Warranty',
      title: `${warrantyExpiring} asset${warrantyExpiring === 1 ? '' : 's'} with warranty expiring soon`,
      body: `Warranty runs out within ${WARRANTY_ATTENTION_DAYS} days on ${warrantyExpiring} asset${warrantyExpiring === 1 ? '' : 's'}.`,
    });
  }
  if (maintenanceDue > 0) {
    await notify({
      category: 'Maintenance',
      title: `${maintenanceDue} maintenance schedule${maintenanceDue === 1 ? '' : 's'} due`,
      body: `${maintenanceDue} preventive maintenance schedule${maintenanceDue === 1 ? '' : 's'} fell due.`,
    });
  }
  if (idle > 0) {
    await notify({
      category: 'Lifecycle',
      title: `${idle} in-service asset${idle === 1 ? '' : 's'} idle`,
      body: `No activity recorded in over ${IDLE_DAYS} days on ${idle} in-service asset${idle === 1 ? '' : 's'}.`,
    });
  }
  if (unassigned > 0) {
    await notify({
      category: 'Lifecycle',
      title: `${unassigned} asset${unassigned === 1 ? '' : 's'} awaiting assignment`,
      body: `${unassigned} asset${unassigned === 1 ? '' : 's'} have sat Available for over ${UNASSIGNED_DAYS} days with nobody assigned.`,
    });
  }

  return { warrantyExpiring, maintenanceDue, idle, unassigned };
}
