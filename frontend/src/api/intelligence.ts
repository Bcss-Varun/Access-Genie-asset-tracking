import type { AssetHealth } from '@access-genie/shared';
import { apiGet, apiPost } from '@/api/client';

/**
 * The derived scores, and why they are what they are.
 *
 * `drivers` is the whole point of this endpoint: health, utilization and risk
 * are computed rather than entered, and a computed number nobody can question
 * is a number nobody trusts. The Explain buttons across the app read this.
 */
export interface AssetExplanation {
  assetId: string;
  healthScore: number;
  healthStatus: AssetHealth;
  utilization: number;
  riskScore: number;
  drivers: string[];
}

export interface RecomputeResult {
  metrics: Record<string, number>;
  insights: Record<string, number>;
}

export const intelligenceApi = {
  explain: (assetId: string) => apiGet<AssetExplanation>(`/intelligence/explain/${assetId}`),
  recompute: () => apiPost<RecomputeResult>('/intelligence/recompute'),
};
