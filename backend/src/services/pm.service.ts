import { assertAssetVisible, assetClause, type VisibleScope } from './tenancy.service.js';
import { Asset, PmSchedule, nextId, type PmScheduleDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import type { CreatePmScheduleInput, UpdatePmScheduleInput } from '../validators/pm.validator.js';

/** Preventive schedules — the calendar behind automated maintenance. */

export async function createPmSchedule(input: CreatePmScheduleInput, scope: VisibleScope): Promise<PmScheduleDoc> {
  await assertAssetVisible(scope, input.assetId);
  const asset = await Asset.findById(input.assetId).lean();
  if (!asset) throw ApiError.badRequest(`Asset ${input.assetId} does not exist`);

  const created = await PmSchedule.create({
    ...input,
    _id: await nextId('pmSchedule', 'PM'),
    assetName: asset.name,
    nextDue: new Date(input.nextDue),
    // No lastDone timestamp until there is recorded completion evidence.
    // compliancePct remains a legacy field; UI derives history from work orders.
    compliancePct: 100,
  });

  return created.toObject();
}

export async function updatePmSchedule(id: string, patch: UpdatePmScheduleInput, scope: VisibleScope): Promise<PmScheduleDoc> {
  const updated = await PmSchedule.findOneAndUpdate(
    { _id: id, ...await assetClause(scope) },
    { $set: { ...patch, ...(patch.nextDue ? { nextDue: new Date(patch.nextDue) } : {}) } },
    { new: true, runValidators: true },
  ).lean<PmScheduleDoc>();

  if (!updated) throw ApiError.notFound('PM schedule');
  return updated;
}

export async function deletePmSchedule(id: string, scope: VisibleScope): Promise<void> {
  const removed = await PmSchedule.findOneAndDelete({ _id: id, ...await assetClause(scope) }).lean();
  if (!removed) throw ApiError.notFound('PM schedule');
}
