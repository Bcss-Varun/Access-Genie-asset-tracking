import type { CertStatus } from '@access-genie/shared';
import {
  Asset,
  Certification,
  CycleCount,
  Inspection,
  nextId,
  type CertificationDoc,
  type CycleCountDoc,
  type InspectionDoc,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { markEstateChanged } from './derivation.scheduler.js';
import type {
  CreateCertificationInput,
  CreateCycleCountInput,
  CreateInspectionInput,
  UpdateCertificationInput,
  UpdateCycleCountInput,
  UpdateInspectionInput,
} from '../validators/compliance.validator.js';

/**
 * Compliance records.
 *
 * Inspections, certifications and cycle counts were all read-only. The screens
 * could show a compliance programme and no part of it could be run: nothing
 * could be scheduled, carried out, renewed or reconciled.
 *
 * Two rules are enforced here rather than left to the caller, because both are
 * the kind of thing that quietly turns a compliance record into a fiction:
 * certification status is *derived* from its dates rather than typed, and a
 * cycle count computes its own variance from what was actually counted.
 */

/** Resolve the asset a record hangs off, so the denormalised name stays true. */
async function assetOrFail(assetId: string) {
  const asset = await Asset.findById(assetId).lean();
  if (!asset) throw ApiError.badRequest(`Asset ${assetId} does not exist`);
  return asset;
}

// ── Inspections ──────────────────────────────────────────────────────────────

export async function createInspection(input: CreateInspectionInput): Promise<InspectionDoc> {
  const asset = await assetOrFail(input.assetId);
  const created = await Inspection.create({
    ...input,
    _id: await nextId('inspection', 'INS'),
    assetName: asset.name,
    dueDate: new Date(input.dueDate),
  });
  return created.toObject();
}

export async function updateInspection(id: string, patch: UpdateInspectionInput): Promise<InspectionDoc> {
  const updated = await Inspection.findByIdAndUpdate(
    id,
    { $set: { ...patch, ...(patch.dueDate ? { dueDate: new Date(patch.dueDate) } : {}) } },
    { new: true, runValidators: true },
  ).lean<InspectionDoc>();

  if (!updated) throw ApiError.notFound('Inspection');
  // A failed inspection is evidence about the asset's condition.
  if (patch.status === 'Failed') markEstateChanged('inspection-failed');
  return updated;
}

export async function deleteInspection(id: string): Promise<void> {
  const removed = await Inspection.findByIdAndDelete(id).lean();
  if (!removed) throw ApiError.notFound('Inspection');
}

// ── Certifications ───────────────────────────────────────────────────────────

/**
 * Status follows the dates, always.
 *
 * Typing "Valid" onto an expired certificate is exactly the failure a
 * compliance register exists to prevent, so the field is computed on every
 * write rather than accepted from the caller.
 */
function certStatusFor(expiresAt: Date, now = Date.now()): CertStatus {
  const daysLeft = Math.ceil((expiresAt.getTime() - now) / 86_400_000);
  if (daysLeft < 0) return 'Expired';
  if (daysLeft <= 30) return 'Expiring';
  return 'Valid';
}

export async function createCertification(input: CreateCertificationInput): Promise<CertificationDoc> {
  const asset = await assetOrFail(input.assetId);
  const expiresAt = new Date(input.expiresAt);

  const created = await Certification.create({
    ...input,
    _id: await nextId('certification', 'CERT'),
    assetName: asset.name,
    issuedAt: new Date(input.issuedAt),
    expiresAt,
    status: certStatusFor(expiresAt),
  });
  return created.toObject();
}

export async function updateCertification(id: string, patch: UpdateCertificationInput): Promise<CertificationDoc> {
  const cert = await Certification.findById(id);
  if (!cert) throw ApiError.notFound('Certification');

  Object.assign(cert, patch);
  if (patch.issuedAt) cert.issuedAt = new Date(patch.issuedAt);
  if (patch.expiresAt) cert.expiresAt = new Date(patch.expiresAt);
  cert.status = certStatusFor(cert.expiresAt);

  await cert.save();
  return cert.toObject();
}

export async function deleteCertification(id: string): Promise<void> {
  const removed = await Certification.findByIdAndDelete(id).lean();
  if (!removed) throw ApiError.notFound('Certification');
}

/** Re-derive every certificate's status. Dates pass without anything happening. */
export async function refreshCertificationStatuses(): Promise<number> {
  const certs = await Certification.find().lean<CertificationDoc[]>();
  const now = Date.now();
  const ops = certs
    .map((c) => ({ c, next: certStatusFor(new Date(c.expiresAt), now) }))
    .filter(({ c, next }) => c.status !== next)
    .map(({ c, next }) => ({ updateOne: { filter: { _id: c._id }, update: { $set: { status: next } } } }));

  if (ops.length > 0) await Certification.bulkWrite(ops);
  return ops.length;
}

// ── Cycle counts ─────────────────────────────────────────────────────────────

export async function createCycleCount(input: CreateCycleCountInput): Promise<CycleCountDoc> {
  const created = await CycleCount.create({
    ...input,
    _id: await nextId('cycleCount', 'CC'),
    date: new Date(input.date),
  });
  return created.toObject();
}

/**
 * Record what was found.
 *
 * The outcome is derived from the numbers: a count that matches reconciles, one
 * that does not is a variance. Letting the caller declare "Reconciled" over a
 * mismatch would make the register agree with itself and disagree with the
 * shelf.
 */
export async function updateCycleCount(id: string, patch: UpdateCycleCountInput): Promise<CycleCountDoc> {
  const count = await CycleCount.findById(id);
  if (!count) throw ApiError.notFound('Cycle count');

  Object.assign(count, patch, patch.date ? { date: new Date(patch.date) } : {});

  // Only once someone has actually counted — a scheduled count is not a variance.
  if (patch.counted !== undefined && patch.status !== 'Scheduled') {
    count.status = count.counted === count.expected ? 'Reconciled' : 'Variance';
  }

  await count.save();
  return count.toObject();
}

export async function deleteCycleCount(id: string): Promise<void> {
  const removed = await CycleCount.findByIdAndDelete(id).lean();
  if (!removed) throw ApiError.notFound('Cycle count');
}
