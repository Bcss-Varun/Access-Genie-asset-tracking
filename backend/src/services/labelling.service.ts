import { DEVICE_READY_STATES, type PrintJobState } from '@access-genie/shared';
import {
  Asset,
  LabelTemplate,
  OPEN_PRINT_JOB_STATES,
  PrintDevice,
  PrintJob,
  nextId,
  type LabelTemplateDoc,
  type PrintJobDoc,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { buildMeta } from '../utils/response.js';
import { parsePagination } from '../utils/query.js';
import type {
  CreatePrintJobInput,
  CreateTemplateInput,
  PrintJobQuery,
  UpdateTemplateInput,
} from '../validators/labelling.validator.js';

/**
 * Labelling.
 *
 * The rule that earns this its own service rather than the resource factory:
 * a print job is only accepted if the device can actually run the template's
 * medium. A QR template sent to an RFID encoder is a job that will sit in a
 * queue and fail later, in a place nobody is looking — so it is refused at
 * submission, where the person who can fix it is still on the screen.
 */

// ── Templates ────────────────────────────────────────────────────────────────
export async function createTemplate(input: CreateTemplateInput, actor: string): Promise<LabelTemplateDoc> {
  const created = await LabelTemplate.create({
    ...input,
    _id: await nextId('labelTemplate', 'TPL'),
    builtIn: false, // only the seeded set is built-in, and only it is undeletable
    updatedAt: new Date(),
    updatedBy: actor,
    usageCount: 0,
  });

  return created.toObject();
}

export async function updateTemplate(
  id: string,
  patch: UpdateTemplateInput,
  actor: string,
): Promise<LabelTemplateDoc> {
  const updated = await LabelTemplate.findByIdAndUpdate(
    id,
    { $set: { ...patch, updatedAt: new Date(), updatedBy: actor } },
    { new: true, runValidators: true },
  ).lean<LabelTemplateDoc>();

  if (!updated) throw ApiError.notFound('Label template');
  return updated;
}

export async function deleteTemplate(id: string): Promise<void> {
  const template = await LabelTemplate.findById(id).lean<LabelTemplateDoc>();
  if (!template) throw ApiError.notFound('Label template');

  // The seeded templates are the ones every screen falls back to; a copy of one
  // can be deleted, the original cannot.
  if (template.builtIn) {
    throw ApiError.conflict('Built-in templates cannot be deleted. Duplicate it and edit the copy instead.');
  }

  const inFlight = await PrintJob.countDocuments({ templateId: id, state: { $in: OPEN_PRINT_JOB_STATES } });
  if (inFlight > 0) {
    throw ApiError.conflict(`${inFlight} job${inFlight === 1 ? ' is' : 's are'} still queued against this template.`);
  }

  await LabelTemplate.deleteOne({ _id: id });
}

// ── Jobs ─────────────────────────────────────────────────────────────────────
export async function listJobs(query: PrintJobQuery) {
  const filter: Record<string, unknown> = {};
  if (query.state) filter.state = query.state;
  if (query.deviceId) filter.deviceId = query.deviceId;
  if (query.templateId) filter.templateId = query.templateId;
  if (query.open === 'true') filter.state = { $in: OPEN_PRINT_JOB_STATES };

  const pagination = parsePagination(query, ['createdAt', 'state', 'copies'], '-createdAt');

  const [items, total] = await Promise.all([
    PrintJob.find(filter).sort(pagination.sort).skip(pagination.skip).limit(pagination.limit).lean(),
    PrintJob.countDocuments(filter),
  ]);

  return { items, meta: buildMeta(pagination.page, pagination.limit, total) };
}

export async function createJob(input: CreatePrintJobInput, actor: string): Promise<PrintJobDoc> {
  const [template, device] = await Promise.all([
    LabelTemplate.findById(input.templateId).lean<LabelTemplateDoc>(),
    PrintDevice.findById(input.deviceId).lean(),
  ]);

  if (!template) throw ApiError.notFound('Label template');
  if (!device) throw ApiError.notFound('Print device');

  // A device that is offline or in error will not pick the job up at all.
  if (!DEVICE_READY_STATES.includes(device.state)) {
    throw ApiError.conflict(`${device.name} is ${device.state.toLowerCase()} and cannot accept jobs right now.`);
  }

  // The check that matters: a printer physically cannot produce a medium it
  // does not support, so the job would fail in the queue rather than here.
  if (!device.supports.includes(template.medium)) {
    throw ApiError.badRequest(
      `${device.name} cannot produce ${template.medium} labels. It supports: ${device.supports.join(', ')}.`,
    );
  }

  // Printing a label for an asset that does not exist produces a sticker that
  // scans to nothing.
  const found = await Asset.countDocuments({ _id: { $in: input.assetIds } });
  if (found !== input.assetIds.length) {
    throw ApiError.badRequest(`${input.assetIds.length - found} of the selected assets no longer exist.`);
  }

  const job = await PrintJob.create({
    _id: await nextId('printJob', 'JOB'),
    createdAt: new Date(),
    createdBy: actor,
    templateId: input.templateId,
    deviceId: input.deviceId,
    assetIds: input.assetIds,
    copies: input.copies,
    state: 'Queued' satisfies PrintJobState,
    printed: 0,
    encoded: 0,
    bound: 0,
  });

  await Promise.all([
    LabelTemplate.updateOne({ _id: template._id }, { $inc: { usageCount: input.assetIds.length * input.copies } }),
    PrintDevice.updateOne({ _id: device._id }, { $inc: { queueDepth: 1 } }),
  ]);

  return job.toObject();
}

export async function cancelJob(id: string): Promise<PrintJobDoc> {
  const job = await PrintJob.findById(id);
  if (!job) throw ApiError.notFound('Print job');

  if (!OPEN_PRINT_JOB_STATES.includes(job.state)) {
    throw ApiError.conflict(`This job is already ${job.state.toLowerCase()}.`);
  }

  job.state = 'Cancelled';
  job.completedAt = new Date();
  await job.save();

  await PrintDevice.updateOne({ _id: job.deviceId, queueDepth: { $gt: 0 } }, { $inc: { queueDepth: -1 } });
  return job.toObject();
}

export async function retryJob(id: string): Promise<PrintJobDoc> {
  const job = await PrintJob.findById(id);
  if (!job) throw ApiError.notFound('Print job');
  if (job.state !== 'Failed') throw ApiError.conflict('Only a failed job can be retried.');

  // Requeue from where it stopped rather than from zero: the labels already
  // printed are physically on assets, and reprinting them would double-bind
  // the tags they carry.
  job.state = 'Queued';
  job.failureReason = undefined;
  job.completedAt = undefined;
  await job.save();

  await PrintDevice.updateOne({ _id: job.deviceId }, { $inc: { queueDepth: 1 } });
  return job.toObject();
}
