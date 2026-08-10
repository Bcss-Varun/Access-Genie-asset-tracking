import type { CustodyAction } from '@access-genie/shared';
import { Activity, Asset, CustodyRecord, type CustodyDoc } from '../models/index.js';
import { nextId } from '../models/Counter.js';
import { ApiError } from '../utils/ApiError.js';
import { applyLifecycleTransition } from './lifecycle.service.js';

/**
 * Check-in / check-out.
 *
 * Not a plain insert, which is why it is not built by the resource factory. A
 * custody event is the *reason* an asset's custodian changed, so writing one
 * without moving the asset leaves the chain and the record disagreeing — which
 * is precisely what the screen did while it kept the log in component state:
 * the asset's profile still named the previous holder.
 *
 * Three writes, in this order, so a failure never leaves a half-move:
 *   1. the append-only custody row (the evidence),
 *   2. the asset's custodian (the current answer),
 *   3. the activity feed (what the dashboards read).
 */

export interface CheckoutInput {
  assetId: string;
  holder: string;
  action: CustodyAction;
  /** Free-text note, kept on the activity entry rather than the custody row. */
  note?: string;
}

export async function recordCustody(input: CheckoutInput, actor: string): Promise<CustodyDoc> {
  const asset = await Asset.findById(input.assetId).lean();
  if (!asset) throw ApiError.notFound('Asset');

  const at = new Date();
  const _id = await nextId('custody', 'CUS');

  const record = await CustodyRecord.create({
    _id,
    assetId: asset._id,
    // Denormalized so the custody log reads correctly even if the asset is
    // later renamed — the chain records what was signed for at the time.
    assetName: asset.name,
    holder: input.holder,
    action: input.action,
    at,
    by: actor,
  });

  // Checking in returns the asset to the pool rather than to a person; every
  // other action puts it in someone's hands.
  const custodian = input.action === 'Checked In' ? 'Unassigned' : input.holder;
  await Asset.updateOne({ _id: asset._id }, { $set: { custodian } });

  await Activity.create({
    assetId: asset._id,
    type: 'Custody',
    description: input.note?.trim()
      ? `${input.action} — ${input.holder}. ${input.note.trim()}`
      : `${input.action} — ${input.holder}`,
    actor,
    timestamp: at,
  });

  // §6 Stage Automation: "Assigned to Employee → In Service". Only from the
  // two stages that mean "nobody has it yet" — an asset already mid-repair or
  // in transit is not yanked into service just because someone signed for it.
  if (custodian !== 'Unassigned' && (asset.lifecycleStage === 'Available' || asset.lifecycleStage === 'Returned')) {
    await applyLifecycleTransition(asset._id, 'Assigned / In Service', {
      actor,
      reason: `${input.action} — ${input.holder}`,
      automated: true,
    });
  }

  return record.toJSON() as CustodyDoc;
}
