import { Asset, PmSchedule, nextId, type PmScheduleDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import type { CreatePmScheduleInput, UpdatePmScheduleInput } from '../validators/pm.validator.js';

/** Preventive schedules — the calendar behind automated maintenance. */

export async function createPmSchedule(input: CreatePmScheduleInput): Promise<PmScheduleDoc> {
  const asset = await Asset.findById(input.assetId).lean();
  if (!asset) throw ApiError.badRequest(`Asset ${input.assetId} does not exist`);

  const created = await PmSchedule.create({
    ...input,
    _id: await nextId('pmSchedule', 'PM'),
    assetName: asset.name,
    nextDue: new Date(input.nextDue),
    // Never carried out yet — the first occurrence is the one about to be
    // raised, so compliance starts at 100 rather than at a fabricated history.
    lastDone: new Date(),
    compliancePct: 100,
  });

  return created.toObject();
}

export async function updatePmSchedule(id: string, patch: UpdatePmScheduleInput): Promise<PmScheduleDoc> {
  const updated = await PmSchedule.findByIdAndUpdate(
    id,
    { $set: { ...patch, ...(patch.nextDue ? { nextDue: new Date(patch.nextDue) } : {}) } },
    { new: true, runValidators: true },
  ).lean<PmScheduleDoc>();

  if (!updated) throw ApiError.notFound('PM schedule');
  return updated;
}

export async function deletePmSchedule(id: string): Promise<void> {
  const removed = await PmSchedule.findByIdAndDelete(id).lean();
  if (!removed) throw ApiError.notFound('PM schedule');
}
