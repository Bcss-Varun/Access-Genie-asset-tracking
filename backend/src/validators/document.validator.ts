import { z } from 'zod';
import { DOC_TYPES } from '@access-genie/shared';

/**
 * Uploading a document.
 *
 * The client reads the file with `FileReader` and sends the base64 payload, so
 * everything here describes a file that genuinely exists on someone's disk —
 * the name, size and MIME type are the browser's, not ours. Nothing invents a
 * filename.
 */

/**
 * 5MB of real bytes.
 *
 * A BSON document stops at 16MB and base64 costs a third on top, so this leaves
 * comfortable headroom. It is checked against the *decoded* length rather than
 * the string's, because base64 of a 6MB file is 8MB of characters and the
 * message a user needs to read is about their file, not our encoding.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const base64Payload = z
  .string()
  .min(1, 'The file is empty')
  // Accepts a bare payload or a full data: URI, since FileReader produces the
  // latter and stripping it client-side is an easy step to forget.
  .transform((value) => {
    const comma = value.indexOf(',');
    return value.startsWith('data:') && comma > -1 ? value.slice(comma + 1) : value;
  })
  .refine((value) => /^[A-Za-z0-9+/]*={0,2}$/.test(value.replace(/\s/g, '')), {
    message: 'File content must be base64',
  })
  .refine((value) => Math.floor((value.replace(/\s/g, '').length * 3) / 4) <= MAX_UPLOAD_BYTES, {
    message: `Files are limited to ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`,
  });

export const uploadDocumentSchema = z.object({
  assetId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  type: z.enum(DOC_TYPES),
  // Advisory only — it decides which application opens the download. It is
  // never used to decide whether the file is safe to store.
  mimeType: z.string().trim().max(120).default('application/octet-stream'),
  content: base64Payload,
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
