import type {
  ApprovalDecision,
  BulkStageChangeInput,
  BulkStageChangeResult,
  LifecycleBoardColumn,
  LifecycleKpis,
  LifecycleTransition,
  RequestStageChangeInput,
} from '@access-genie/shared';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/api/client';

/** The shape `POST /assets/:id/lifecycle/transition` returns — immediate or held for approval. */
export interface TransitionResult {
  status: 'Applied' | 'Pending';
  transition: LifecycleTransition;
}

/**
 * The lifecycle workflow. Every write here goes through the server's flow
 * graph and approval gate (`shared/src/domain.ts` `LIFECYCLE_FLOW`,
 * `shared/src/lifecycle.ts` `LIFECYCLE_ROLE_MATRIX`) — there is no client-side
 * shortcut, by design (§2 of the module spec: no more direct stage writes).
 */
/** A pending stage change as the approvals queue receives it. */
export interface PendingStageChange extends LifecycleTransition {
  requesterId?: string;
  /** Decided by the server from the role matrix, the requester and any approval chain. */
  canDecide: boolean;
  /** Set when a configured approval workflow holds the request — decide it there. */
  approvalRequestId?: string;
}

export const lifecycleApi = {
  board: () => apiGet<LifecycleBoardColumn[]>('/assets/lifecycle/board'),
  pending: () => apiGet<PendingStageChange[]>('/assets/lifecycle/pending'),
  kpis: () => apiGet<LifecycleKpis>('/assets/lifecycle/kpis'),
  history: (assetId: string) => apiGet<LifecycleTransition[]>(`/assets/${assetId}/lifecycle`),

  requestStageChange: (assetId: string, input: RequestStageChangeInput) =>
    apiPost<TransitionResult>(`/assets/${assetId}/lifecycle/transition`, input),

  decide: (transitionId: string, decision: ApprovalDecision) =>
    apiPost<LifecycleTransition>(`/assets/lifecycle/transitions/${transitionId}/decide`, { decision }),

  bulkStageChange: (input: BulkStageChangeInput) =>
    apiPost<BulkStageChangeResult>('/assets/lifecycle/bulk-transition', input),
};

export const PENDING_STAGE_CHANGES_KEY = ['lifecycle', 'pending'] as const;

/** Every pending stage change the signed-in user can see, newest first. */
export function usePendingStageChanges(): UseQueryResult<PendingStageChange[]> {
  return useQuery({ queryKey: PENDING_STAGE_CHANGES_KEY, queryFn: lifecycleApi.pending, staleTime: 15_000 });
}
