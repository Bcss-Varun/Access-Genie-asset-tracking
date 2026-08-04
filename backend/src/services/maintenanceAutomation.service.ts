import type { PmFrequency } from '@access-genie/shared';
import { Asset, PmSchedule, WorkOrder, nextId, type AssetDoc, type PmScheduleDoc } from '../models/index.js';
import { logger } from '../config/logger.js';

/**
 * Automated work orders.
 *
 * The platform could already *detect* that maintenance was due or that an asset
 * was degrading — Phase 2 raises both as insights — but detection that ends in
 * a dashboard tile is not maintenance. Somebody still has to notice the tile,
 * decide, and type the work order. This closes that gap: the conditions that
 * warrant work now produce the work.
 *
 * Two triggers, deliberately different in character:
 *
 *   **Scheduled** — a PM schedule falls due. Certain, calendar-driven, and the
 *   order is raised whether or not anything is wrong. This is the backbone of
 *   preventive maintenance and it must never be missed.
 *
 *   **Condition** — health crosses a floor. Uncertain, evidence-driven, and
 *   raised as `Predictive` so a planner can tell at a glance which orders came
 *   from a calendar and which came from the asset's actual state.
 *
 * The hard requirement for both is **no duplicates**. An automation that raises
 * the same order every ten minutes destroys the queue it is trying to fill, so
 * every path checks for an existing open order first, and the PM path rolls the
 * schedule forward in the same pass that raises the order.
 */

/** How far to advance a schedule once its occurrence has been raised. */
const INTERVAL_DAYS: Record<PmFrequency, number> = {
  Monthly: 30,
  Quarterly: 91,
  'Semi-Annual': 182,
  Annual: 365,
  // Driven by runtime hours rather than the calendar. Advanced by a nominal
  // month so it re-evaluates regularly instead of firing forever.
  'Usage-based': 30,
};

/** Health at or below which an asset earns a predictive order on its own. */
const CONDITION_HEALTH_FLOOR = 45;

function advance(from: Date, frequency: PmFrequency): Date {
  const next = new Date(from);
  next.setDate(next.getDate() + INTERVAL_DAYS[frequency]);
  return next;
}

/** Is there already an open order covering this work? */
async function hasOpenOrder(assetId: string, type: string, titlePrefix?: string): Promise<boolean> {
  const existing = await WorkOrder.findOne({
    assetId,
    type,
    status: { $ne: 'Completed' },
    ...(titlePrefix ? { title: new RegExp(`^${titlePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) } : {}),
  })
    .select('_id')
    .lean();
  return Boolean(existing);
}

export interface AutomationResult {
  pmRaised: number;
  conditionRaised: number;
  schedulesAdvanced: number;
}

/**
 * Raise the orders that are due, and advance the schedules that produced them.
 *
 * The schedule is advanced only when an order actually exists for the
 * occurrence — including when one was already open. Advancing unconditionally
 * would let a missed occurrence disappear silently, which is exactly the
 * failure preventive maintenance exists to prevent.
 */
export async function raiseDueMaintenance(): Promise<AutomationResult> {
  const now = new Date();
  const result: AutomationResult = { pmRaised: 0, conditionRaised: 0, schedulesAdvanced: 0 };

  // ── Scheduled ─────────────────────────────────────────────────────────────
  const due = await PmSchedule.find({ nextDue: { $lte: now } }).lean<PmScheduleDoc[]>();

  for (const pm of due) {
    const asset = await Asset.findById(pm.assetId).lean<AssetDoc>();
    // A schedule whose asset has been deleted is stale; leave it for an
    // operator rather than raising an order against nothing.
    if (!asset) continue;

    const titlePrefix = `${pm.title} —`;
    const alreadyOpen = await hasOpenOrder(pm.assetId, pm.type, titlePrefix);

    if (!alreadyOpen) {
      const dueDate = new Date(pm.nextDue);
      await WorkOrder.create({
        _id: await nextId('workOrder', 'WO'),
        title: `${titlePrefix} ${dueDate.toISOString().slice(0, 10)}`,
        assetId: pm.assetId,
        assetName: asset.name,
        status: 'New',
        priority: asset.criticality === 'Critical' ? 'High' : 'Medium',
        type: pm.type,
        assignedTo: pm.assignedTeam || 'Unassigned',
        dueDate,
        description:
          `Raised automatically from preventive schedule ${pm._id} (${pm.frequency}). ` +
          `Scheduled for ${dueDate.toISOString().slice(0, 10)}.`,
        estimatedHours: pm.estHours ?? 1,
        aiGenerated: true,
        checklist: [],
        parts: [],
        laborLog: [],
        comments: [],
        createdAt: now,
      });
      result.pmRaised++;
    }

    await PmSchedule.updateOne(
      { _id: pm._id },
      { $set: { lastDone: pm.lastDone ?? now, nextDue: advance(new Date(pm.nextDue), pm.frequency) } },
    );
    result.schedulesAdvanced++;
  }

  // ── Condition ─────────────────────────────────────────────────────────────
  // Health is already materialised by the metrics pass, so this is a plain
  // query rather than a recomputation.
  const degraded = await Asset.find({
    healthScore: { $lte: CONDITION_HEALTH_FLOOR },
    status: { $nin: ['End_Of_Life'] },
  }).lean<AssetDoc[]>();

  for (const asset of degraded) {
    const id = String(asset._id);
    if (await hasOpenOrder(id, 'Predictive')) continue;

    await WorkOrder.create({
      _id: await nextId('workOrder', 'WO'),
      title: `Condition check — health at ${asset.healthScore}`,
      assetId: id,
      assetName: asset.name,
      status: 'New',
      priority: asset.healthScore <= 30 ? 'Critical' : 'High',
      type: 'Predictive',
      assignedTo: 'Unassigned',
      // Condition-driven work is not calendar work: a week is short enough to
      // matter and long enough to plan around.
      dueDate: new Date(now.getTime() + 7 * 86_400_000),
      description:
        `Raised automatically because health fell to ${asset.healthScore}, at or below the ${CONDITION_HEALTH_FLOOR} floor. ` +
        'Inspect and confirm whether corrective work is needed.',
      estimatedHours: 2,
      aiGenerated: true,
      checklist: [
        { label: 'Inspect for the fault the score implies', done: false },
        { label: 'Confirm or dismiss the predicted failure', done: false },
        { label: 'Raise corrective work if confirmed', done: false },
      ],
      parts: [],
      laborLog: [],
      comments: [],
      createdAt: now,
    });
    result.conditionRaised++;
  }

  if (result.pmRaised || result.conditionRaised) {
    logger.info('Maintenance automation raised work', { ...result });
  }
  return result;
}
