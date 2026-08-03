import type { AssetClass } from '@access-genie/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';

/**
 * Asset classes — the configuration behind every registration.
 *
 * Reads come with the dataset (the class list is needed by nearly every asset
 * screen); this module is the write path, plus a direct read for the editor.
 */
export const assetClassesApi = {
  list: () => apiGet<AssetClass[]>('/asset-classes'),
  get: (id: string) => apiGet<AssetClass>(`/asset-classes/${id}`),
  create: (input: Record<string, unknown>) => apiPost<AssetClass>('/asset-classes', input),
  update: (id: string, input: Record<string, unknown>) => apiPatch<AssetClass>(`/asset-classes/${id}`, input),
  remove: (id: string) => apiDelete(`/asset-classes/${id}`),
};
