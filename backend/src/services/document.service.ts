import { Activity, Asset, AssetDocument, type AssetDocDoc } from '../models/index.js';
import { nextId } from '../models/Counter.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import type { UploadDocumentInput } from '../validators/document.validator.js';

/**
 * Documents attached to an asset.
 *
 * Uploading one is an event in the asset's life, not just a row: an invoice
 * arriving is what closes the commercial gate during registration, and a
 * certificate arriving is what a compliance reviewer looks for. So each upload
 * also appends to the asset's timeline, the same way custody and maintenance do.
 */

/** Everything but the bytes — what a list or the dataset should ever return. */
const METADATA = '-content';

export async function uploadDocument(input: UploadDocumentInput, actor: string): Promise<AssetDocDoc> {
  const asset = await Asset.findById(input.assetId).lean();
  if (!asset) throw ApiError.notFound('Asset');

  const bytes = Buffer.from(input.content, 'base64');
  if (bytes.length === 0) throw ApiError.badRequest('That file is empty');

  const _id = await nextId('assetDocument', 'DOC');
  const uploadedAt = new Date();

  await AssetDocument.create({
    _id,
    assetId: asset._id,
    name: input.name,
    type: input.type,
    // Recorded from the real byte count rather than whatever the client
    // claimed, so the size shown on screen is the size actually stored.
    sizeKb: Math.max(1, Math.round(bytes.length / 1024)),
    uploadedAt,
    uploadedBy: actor,
    mimeType: input.mimeType,
    content: input.content,
  });

  /**
   * The timeline entry must not be able to fail the upload.
   *
   * The file is already stored by this point. Throwing here would tell the user
   * their upload failed while the document sits in the collection, and their
   * natural response — upload it again — is what turns one stored file into
   * two. The entry is secondary evidence of a write that already happened, so a
   * failure is logged loudly and swallowed, exactly as `recordAudit` does.
   */
  try {
    await Activity.create({
      assetId: asset._id,
      // `Audit` rather than a documents-specific type: attaching an invoice or a
      // certificate is exactly the documentary evidence the compliance timeline
      // exists to show, and the vocabulary already has a bucket for that.
      type: 'Audit',
      description: `${input.type} attached — ${input.name}`,
      actor,
      timestamp: uploadedAt,
    });
  } catch (err: unknown) {
    logger.error('Document stored but its timeline entry failed', {
      documentId: _id,
      assetId: asset._id,
      err: String(err),
    });
  }

  const saved = await AssetDocument.findById(_id).select(METADATA).lean();
  return saved as AssetDocDoc;
}

/** The bytes, for a download. Separate from the metadata read on purpose. */
export async function documentContent(
  id: string,
): Promise<{ name: string; mimeType: string; body: Buffer }> {
  const doc = await AssetDocument.findById(id).select('+content').lean();
  if (!doc) throw ApiError.notFound('Document');
  if (!doc.content) {
    // A row seeded before uploads stored bytes. Saying so is better than
    // returning an empty file that looks like a corrupt download.
    throw ApiError.notFound('This document has no stored file');
  }
  return {
    name: doc.name,
    mimeType: doc.mimeType || 'application/octet-stream',
    body: Buffer.from(doc.content, 'base64'),
  };
}

export async function deleteDocument(id: string, actor: string): Promise<void> {
  const doc = await AssetDocument.findById(id).select(METADATA).lean();
  if (!doc) throw ApiError.notFound('Document');

  await AssetDocument.deleteOne({ _id: id });

  await Activity.create({
    assetId: doc.assetId,
    type: 'Audit',
    description: `${doc.type} removed — ${doc.name}`,
    actor,
    timestamp: new Date(),
  });
}
