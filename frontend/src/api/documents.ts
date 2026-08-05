import type { DocType } from '@access-genie/shared';
import { apiDelete, apiGet, apiPost, http } from '@/api/client';
import { saveBlob } from '@/api/download';

/**
 * Documents attached to an asset.
 *
 * The file never becomes a string anywhere except on the wire: the browser
 * reads the real bytes off disk, they are base64'd for transport, and the
 * server decodes them straight back. Nothing here invents a name or a size —
 * both come from the `File` the user actually chose.
 */

export interface AssetDocument {
  id: string;
  assetId: string;
  name: string;
  type: DocType;
  sizeKb: number;
  uploadedAt: string;
  uploadedBy: string;
  mimeType: string;
}

/** Matches the server's cap, so an oversized file is refused before upload. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * `FileReader` gives back a data: URI. The payload after the comma is what the
 * server wants, though it accepts either — the strip is done here so the
 * request body is not a third larger than it needs to be.
 */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma > -1 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export const documentsApi = {
  forAsset: (assetId: string) => apiGet<AssetDocument[]>(`/asset-documents?assetId=${assetId}`),

  upload: async (assetId: string, file: File, type: DocType) => {
    const content = await readFileAsBase64(file);
    return apiPost<AssetDocument>('/asset-documents', {
      assetId,
      // The browser's own filename and MIME type, untouched.
      name: file.name,
      type,
      mimeType: file.type || 'application/octet-stream',
      content,
    });
  },

  remove: (id: string) => apiDelete<{ id: string }>(`/asset-documents/${id}`),

  /**
   * Fetch the stored bytes and hand them to the browser.
   *
   * A blob rather than a plain link, because the endpoint is authenticated and
   * an `<a href>` would arrive without the bearer token.
   */
  download: async (doc: Pick<AssetDocument, 'id' | 'name'>): Promise<void> => {
    const res = await http.get(`/asset-documents/${doc.id}/download`, { responseType: 'blob' });
    saveBlob(res.data as Blob, doc.name);
  },
};
