import type { ScopeLevel, ScopeNode } from '@access-genie/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';

/**
 * The location hierarchy — Org ▸ Region ▸ Facility ▸ Building ▸ Floor ▸ Zone.
 *
 * The tree itself arrives with the dataset (every screen that shows where
 * something is needs it, and the scope picker is part of the chrome), so this
 * module is the write path. After any write the dataset is re-read, which is
 * what makes a facility added here immediately pickable in the registration
 * flow — see `locationOptions()`, which flattens the same tree.
 */
export interface CreateScopeInput {
  name: string;
  level: ScopeLevel;
  /** Required for everything except the org root. */
  parentId?: string;
}

export const scopeApi = {
  list: () => apiGet<ScopeNode[]>('/scope'),
  tree: () => apiGet<ScopeNode | null>('/scope/tree'),
  create: (input: CreateScopeInput) => apiPost<ScopeNode>('/scope', input as unknown as Record<string, unknown>),
  rename: (id: string, name: string) => apiPatch<ScopeNode>(`/scope/${id}`, { name }),
  remove: (id: string) => apiDelete(`/scope/${id}`),
};

/** What each level is called in the interface, and what it looks like. */
export const LEVEL_LABEL: Record<ScopeLevel, string> = {
  org: 'Organization',
  region: 'Region',
  facility: 'Facility',
  building: 'Building',
  floor: 'Floor',
  zone: 'Zone',
};

export const LEVEL_ICON: Record<ScopeLevel, string> = {
  org: '🏛️',
  region: '🌎',
  facility: '🏭',
  building: '🏢',
  floor: '🪜',
  zone: '📍',
};

/**
 * What may be created inside a node of a given level — the same table the API
 * enforces with, so the interface never offers an option the server refuses.
 */
export const ALLOWED_CHILDREN: Record<ScopeLevel, ScopeLevel[]> = {
  org: ['region', 'facility'],
  region: ['facility'],
  facility: ['building', 'zone'],
  building: ['floor', 'zone'],
  floor: ['zone'],
  zone: [],
};
