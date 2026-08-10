// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle workflow contract — the governed state machine over
// `Asset.lifecycleStage` (see `LIFECYCLE_STAGES`/`LIFECYCLE_FLOW` in
// `./domain`). Every value `lifecycleStage` has ever held is backed by one of
// the rows this file describes; there is no other write path.
//
// As with `domain.ts`/`registry.ts`, these are the *wire* shapes — the
// Mongoose model in `backend/src/models/LifecycleTransition.ts` mirrors them.
// ─────────────────────────────────────────────────────────────────────────────

import type { LifecycleStage } from './domain.js';
import type { RoleId } from './platform.js';

export const TRANSITION_STATUSES = ['Applied', 'Pending', 'Approved', 'Rejected'] as const;
export type TransitionStatus = (typeof TRANSITION_STATUSES)[number];

export const APPROVAL_STATUSES = ['Pending', 'Approved', 'Rejected'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface LifecycleApproval {
  role: RoleId;
  status: ApprovalStatus;
  actor?: string;
  at?: string;
}

/**
 * One row, one transition — applied or requested. Never updated after
 * `Applied`/`Rejected`; a `Pending` row is the only mutable state (it becomes
 * `Approved`+applied or `Rejected`), which is what makes this the audit trail
 * per §12 rather than just another feed.
 */
export interface LifecycleTransition {
  id: string;
  assetId: string;
  assetName: string;
  fromStage: LifecycleStage;
  toStage: LifecycleStage;
  reason: string;
  comments?: string;
  requester: string;
  status: TransitionStatus;
  approvals: LifecycleApproval[];
  documentIds: string[];
  /** System-raised (work order opened/closed, custody assigned, registration) vs. a person choosing Change Stage. */
  automated: boolean;
  requestedAt: string;
  decidedAt?: string;
}

export interface RequestStageChangeInput {
  toStage: LifecycleStage;
  reason: string;
  comments?: string;
  documentIds?: string[];
}

export interface BulkStageChangeInput extends RequestStageChangeInput {
  ids: string[];
}

export interface BulkStageChangeResult {
  updated: string[];
  pendingApproval: string[];
  failed: { id: string; reason: string }[];
}

export type ApprovalDecision = 'Approved' | 'Rejected';

/**
 * Who may request a transition into a given stage, and who may decide a
 * `Pending` one, keyed by the platform's existing `RoleId`s.
 *
 * The spec this maps to names six operational roles (IT Administrator, Asset
 * Manager, Maintenance Engineer, Department Manager, Finance, Auditor) that
 * do not exist as distinct `RoleId`s — introducing them would touch
 * auth/seeding/user-admin app-wide for a module-level workflow. This matrix
 * is the documented mapping instead:
 *
 *   IT Administrator    → org_admin / super_admin — every transition.
 *   Asset Manager        → facility_manager — assigns, requests most stages.
 *   Maintenance Engineer → technician / maintenance_manager — moves into Maintenance.
 *   Department Manager   → facility_manager — approves Assignment (Available → Assigned).
 *   Finance               → executive — approves Disposal.
 *   Auditor                → security_officer — read-only; absent from every `can*` list below.
 */
export const LIFECYCLE_ROLE_MATRIX: {
  canRequestAny: RoleId[];
  canApprove: Partial<Record<LifecycleStage, RoleId[]>>;
} = {
  canRequestAny: ['super_admin', 'org_admin', 'facility_manager', 'maintenance_manager', 'technician'],
  canApprove: {
    Maintenance: ['super_admin', 'org_admin', 'maintenance_manager'],
    Retired: ['super_admin', 'org_admin', 'facility_manager'],
    Disposed: ['super_admin', 'org_admin', 'executive'],
  },
};

/** Per-stage aggregate the Board View renders as a column header. */
export interface LifecycleBoardColumn {
  stage: LifecycleStage;
  total: number;
  requiringAttention: number;
  avgHealth: number;
  totalValue: number;
  criticalCount: number;
}

/** The enterprise KPI row (§7) — replaces the four client-computed tiles. */
export interface LifecycleKpis {
  inService: number;
  maintenanceDue: number;
  warrantyExpiring: number;
  returned: number;
  retired: number;
  disposed: number;
  awaitingAssignment: number;
  avgHealth: number;
  avgAgeYears: number;
  portfolioValue: number;
  requiringApproval: number;
}
