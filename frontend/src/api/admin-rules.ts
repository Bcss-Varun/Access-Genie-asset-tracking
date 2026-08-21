import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  ApprovalRequestStatus,
  ApprovalRequestView,
  NotificationRule,
  NotificationRuleLogEntry,
  NumberingRule,
} from '@access-genie/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';

/**
 * Administration rules — numbering and notifications.
 *
 * Both screens are thin over these calls on purpose. Every ID the platform
 * issues is minted server-side, and every notification is decided server-side,
 * so there is nothing here for the client to compute — including the previews,
 * which come back from the API precisely so the screen cannot disagree with what
 * the generator will actually produce.
 */

export const NUMBERING_KEY = ['admin', 'numbering'] as const;
export const NOTIFICATION_RULES_KEY = ['admin', 'notification-rules'] as const;

// ── Numbering ────────────────────────────────────────────────────────────────

export interface NumberingPayload {
  name: string;
  entity: NumberingRule['entity'];
  prefix: string;
  pattern: string;
  startAt: number;
  sequenceScope: NumberingRule['sequenceScope'];
  categories: string[];
  scopeId?: string;
  status: 'active' | 'inactive';
}

export function useNumberingRules(): UseQueryResult<NumberingRule[]> {
  return useQuery({
    queryKey: NUMBERING_KEY,
    queryFn: () => apiGet<NumberingRule[]>('/numbering-rules'),
    staleTime: 30_000,
  });
}

export const numberingApi = {
  create: (body: NumberingPayload) => apiPost<NumberingRule>('/numbering-rules', body),
  update: (id: string, body: Partial<NumberingPayload>) => apiPatch<NumberingRule>(`/numbering-rules/${id}`, body),
  remove: (id: string) => apiDelete(`/numbering-rules/${id}`),
  /** Three sample IDs for an unsaved pattern. Never consumes a sequence number. */
  preview: (body: {
    prefix: string;
    pattern: string;
    startAt: number;
    sequenceScope: NumberingRule['sequenceScope'];
    category?: string;
    scopeId?: string;
  }) => apiPost<{ samples: string[] }>('/numbering-rules/preview', body),
};

// ── Notification rules ───────────────────────────────────────────────────────

export interface NotificationRulePayload {
  name: string;
  event: NotificationRule['event'];
  conditions: NotificationRule['conditions'];
  channels: NotificationRule['channels'];
  recipients: NotificationRule['recipients'];
  throttleMinutes: number;
  quietHours: NotificationRule['quietHours'];
  escalation: NotificationRule['escalation'];
  scopeId?: string;
  status: 'active' | 'inactive';
}

export function useNotificationRules(): UseQueryResult<NotificationRule[]> {
  return useQuery({
    queryKey: NOTIFICATION_RULES_KEY,
    queryFn: () => apiGet<NotificationRule[]>('/notification-rules'),
    staleTime: 30_000,
  });
}

/** The delivery log — what each rule actually did, including what it suppressed. */
export function useNotificationLog(ruleId?: string): UseQueryResult<NotificationRuleLogEntry[]> {
  return useQuery({
    queryKey: [...NOTIFICATION_RULES_KEY, 'log', ruleId ?? 'all'],
    queryFn: () =>
      apiGet<NotificationRuleLogEntry[]>('/notification-rules/log', ruleId ? { ruleId } : undefined),
    staleTime: 15_000,
  });
}

export const notificationRulesApi = {
  create: (body: NotificationRulePayload) => apiPost<NotificationRule>('/notification-rules', body),
  update: (id: string, body: Partial<NotificationRulePayload>) =>
    apiPatch<NotificationRule>(`/notification-rules/${id}`, body),
  remove: (id: string) => apiDelete(`/notification-rules/${id}`),
  preview: (id: string) => apiGet<{ title: string; body: string }>(`/notification-rules/${id}/preview`),
  /** Delivers to the real recipients now, bypassing throttle and quiet hours. */
  test: (id: string) =>
    apiPost<{ ruleId: string; outcome: string; recipients: string[] }>(`/notification-rules/${id}/test`, {}),
};

// ── Approvals ────────────────────────────────────────────────────────────────

export const APPROVALS_KEY = ['approvals'] as const;

/**
 * The approvals queue.
 *
 * `mine` narrows to requests the signed-in caller can decide *right now* — the
 * server works that out from the current step's approver and the caller's own
 * scope, so the screen never has to reimplement who may sign what off.
 */
export function useApprovals(mine: boolean, status?: ApprovalRequestStatus): UseQueryResult<ApprovalRequestView[]> {
  return useQuery({
    queryKey: [...APPROVALS_KEY, mine ? 'mine' : 'all', status ?? 'any'],
    queryFn: () =>
      apiGet<ApprovalRequestView[]>('/approvals', {
        ...(mine ? { mine: 'true' } : {}),
        ...(status ? { status } : {}),
      }),
    staleTime: 15_000,
  });
}

export const approvalsApi = {
  decide: (id: string, decision: 'Approved' | 'Rejected', comment: string) =>
    apiPost<ApprovalRequestView>(`/approvals/${id}/decide`, { decision, comment }),
  cancel: (id: string, reason: string) => apiPost<ApprovalRequestView>(`/approvals/${id}/cancel`, { reason }),
};
