// ─────────────────────────────────────────────────────────────────────────────
// Administration: permissions and approvals.
//
// Two things live here that the rest of the platform only had in outline.
//
// **Permissions.** `platform.ts` answers "may this role enter Assets at all" —
// a module grant, and the only question the API asked until now. That is not
// enough to say "a technician may edit an asset but not delete one", which is
// the ordinary shape of a real permission. So a grant is now a module *and* a
// set of actions within it, and `requirePermission` enforces the pair.
//
// **Approvals.** A workflow is configuration: which operation, in which part of
// the estate, needs whose sign-off and in what order. A *request* is the running
// instance of one against a specific transaction. Keeping them apart is what
// lets a workflow be edited without rewriting the history of everything it has
// already approved — the request carries its own copy of the steps it was opened
// with, so a decision made last month still reads the way it was made.
// ─────────────────────────────────────────────────────────────────────────────

import type { ModuleKey, RoleId } from './platform.js';

// ── Permissions ──────────────────────────────────────────────────────────────

/**
 * What a role may *do* inside a module it can enter.
 *
 * `manage` is deliberately not a synonym for the other five. It covers the
 * configuration of a module — its templates, its rules, its schedules — as
 * distinct from the records inside it, because "may raise a work order" and
 * "may rewrite the PM schedule every work order comes from" are different
 * powers that happen to live on the same screen.
 */
export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'manage'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** Every action, for the roles that hold a module outright. */
export const ALL_ACTIONS: PermissionAction[] = [...PERMISSION_ACTIONS];

/** Read-only: what most roles hold in a module they can see but not touch. */
export const VIEW_ONLY: PermissionAction[] = ['view'];

/**
 * The actions a role holds per module.
 *
 * Absent module = no access at all, which is the same answer the module gate
 * gave before this existed. An empty action list is *not* the same thing: it
 * means the module is reachable and nothing inside it is permitted, which is a
 * state an administrator can create and should therefore be representable.
 */
export type PermissionMatrix = Partial<Record<ModuleKey, PermissionAction[]>>;

export interface RolePermissions {
  roleId: RoleId;
  name: string;
  /** True for `super_admin`, whose grant is not narrowable — see roleGrant.service. */
  locked: boolean;
  permissions: PermissionMatrix;
}

/**
 * The default action set for a role that holds a module.
 *
 * Derived from the role's tier rather than enumerated per module, because a
 * table of six roles × eleven modules is a table nobody keeps correct. The
 * deployment overrides what it disagrees with; this is only the starting point.
 */
export function defaultActionsFor(roleId: RoleId): PermissionAction[] {
  switch (roleId) {
    case 'super_admin':
    case 'org_admin':
      return [...ALL_ACTIONS];
    case 'facility_manager':
    case 'maintenance_manager':
      return ['view', 'create', 'edit', 'approve'];
    case 'technician':
      return ['view', 'create', 'edit'];
    case 'security_officer':
      return ['view', 'create', 'edit'];
    case 'executive':
      return ['view'];
    default:
      return ['view'];
  }
}

// ── Approval workflows ───────────────────────────────────────────────────────

/**
 * The operations that can require sign-off.
 *
 * A closed list, and short on purpose: every member here is an operation this
 * codebase actually performs and can therefore actually hold. Adding a trigger
 * that no service consults would be exactly the "configuration that affects
 * nothing" this module is meant to stop being.
 */
export const APPROVAL_TRIGGERS = ['asset_transfer', 'asset_disposal', 'purchase_request'] as const;
export type ApprovalTrigger = (typeof APPROVAL_TRIGGERS)[number];

export const APPROVAL_TRIGGER_LABELS: Record<ApprovalTrigger, string> = {
  asset_transfer: 'Asset transfer',
  asset_disposal: 'Asset disposal',
  purchase_request: 'Purchase request',
};

/** Which triggers are wired to a real operation today. */
export const WIRED_TRIGGERS: ApprovalTrigger[] = ['asset_transfer', 'asset_disposal'];

export const WORKFLOW_STATUSES = ['Active', 'Inactive', 'Draft'] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

// The workflow's own shape — `WorkflowStep` and `ApprovalWorkflow` — lives in
// `registry.ts`, which is where the screens already import it from. Defining a
// second copy here would give the same idea two names and let them drift.

// ── Approval requests ────────────────────────────────────────────────────────

export const APPROVAL_REQUEST_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'] as const;
export type ApprovalRequestStatus = (typeof APPROVAL_REQUEST_STATUSES)[number];

/**
 * Named `ApprovalStepDecision` rather than `ApprovalDecision`: the lifecycle
 * module already exports that name for the stage-gate idea, and two different
 * shapes under one name in the shared barrel is a build error at best and the
 * wrong import at worst.
 */
export const APPROVAL_STEP_DECISIONS = ['Approved', 'Rejected'] as const;
export type ApprovalStepDecision = (typeof APPROVAL_STEP_DECISIONS)[number];

/**
 * A step of a live request: the configuration copied in, plus what happened.
 *
 * The copy is the point. Editing a workflow must not retroactively change what
 * a past approval required, and a request that read its steps from the workflow
 * on every render would do exactly that.
 */
export interface ApprovalRequestStep {
  order: number;
  name: string;
  approverRole?: RoleId;
  approverUserId?: string;
  decision?: ApprovalStepDecision;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  comment?: string;
}

/** One entry of the immutable history — every decision, in the order made. */
export interface ApprovalHistoryEntry {
  at: string;
  actorId: string;
  actorName: string;
  action: 'opened' | 'approved' | 'rejected' | 'cancelled';
  step?: number;
  comment?: string;
}

export interface ApprovalRequest {
  id: string;
  workflowId: string;
  workflowName: string;
  trigger: ApprovalTrigger;
  /** The record awaiting sign-off — a transfer id, an asset id. */
  subjectType: ApprovalTrigger;
  subjectId: string;
  subjectLabel: string;
  /** Where the subject sits, for scoping the approver's queue. */
  scopeId?: string;
  status: ApprovalRequestStatus;
  /** Index into `steps` of the step awaiting a decision; -1 once settled. */
  currentStep: number;
  steps: ApprovalRequestStep[];
  history: ApprovalHistoryEntry[];
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  settledAt?: string;
}

/** Everything the approvals inbox needs to decide whether to show an action. */
export interface ApprovalRequestView extends ApprovalRequest {
  /** True when the signed-in caller may decide the current step. */
  canDecide: boolean;
}

// ── Numbering & ID rules ─────────────────────────────────────────────────────

/**
 * The records whose IDs an administrator may shape.
 *
 * Only entities this codebase actually mints IDs for. Purchase requests and
 * purchase orders are in the brief but not in the product — procurement was
 * withdrawn along with Inventory & Parts — so they are absent rather than
 * present-and-inert, for the same reason `WIRED_TRIGGERS` exists above.
 */
export const NUMBERED_ENTITIES = ['asset', 'workOrder', 'transfer', 'inspection'] as const;
export type NumberedEntity = (typeof NUMBERED_ENTITIES)[number];

export const NUMBERED_ENTITY_LABELS: Record<NumberedEntity, string> = {
  asset: 'Assets / asset tags',
  workOrder: 'Work orders',
  transfer: 'Asset transfers',
  inspection: 'Inspections',
};

/**
 * What the sequence counts within.
 *
 * `global` is one run of numbers for the whole rule. `facility` and `category`
 * give each site or each category its own run, which is what makes
 * `LAP-HYD-00001` and `LAP-PUN-00001` both legitimate first numbers rather than
 * a collision.
 */
export const SEQUENCE_SCOPES = ['global', 'facility', 'category'] as const;
export type SequenceScope = (typeof SEQUENCE_SCOPES)[number];

/**
 * Tokens a pattern may contain. Anything else in the pattern is a literal.
 *
 *   {PREFIX}    the rule's prefix
 *   {CATEGORY}  a short code from the record's category
 *   {FACILITY}  a short code from the facility the record sits in
 *   {YYYY} {YY} {MM}   the date the ID is minted
 *   {SEQ} {SEQ:n}      the sequence, optionally zero-padded to n digits
 */
export const PATTERN_TOKENS = ['{PREFIX}', '{CATEGORY}', '{FACILITY}', '{YYYY}', '{YY}', '{MM}', '{SEQ}'] as const;

export interface NumberingRule {
  id: string;
  name: string;
  entity: NumberedEntity;
  prefix: string;
  /** e.g. `{PREFIX}-{FACILITY}-{SEQ:5}` → `LAP-HYD-00001`. */
  pattern: string;
  startAt: number;
  sequenceScope: SequenceScope;
  /** Limits the rule to these asset categories; empty means all. */
  categories: string[];
  /** Limits the rule to a branch of the location tree; absent means everywhere. */
  scopeId?: string;
  scopeName?: string;
  status: 'active' | 'inactive';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** What the next ID would look like — rendered by the server, never guessed. */
  preview: string;
  /** How many IDs this rule has already minted, per sequence. */
  issued: number;
}

// ── Notification rules ───────────────────────────────────────────────────────

/**
 * The events the application actually raises.
 *
 * Every member is emitted by a real code path — see `notificationRule.service`'s
 * `fireEvent` call sites. A rule can only be built on an event the system emits,
 * because the alternative is a screen offering triggers that never fire.
 */
export const NOTIFICATION_EVENTS = [
  'approval.requested',
  'approval.decided',
  'transfer.requested',
  'asset.status_changed',
  'work_order.overdue',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEvent, string> = {
  'approval.requested': 'Approval requested',
  'approval.decided': 'Approval decided',
  'transfer.requested': 'Transfer requested',
  'asset.status_changed': 'Asset status changed',
  'work_order.overdue': 'Work order overdue',
};

export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'webhook'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** How a recipient is chosen: by role, by named user, or by the actor involved. */
export const RECIPIENT_KINDS = ['role', 'user', 'requester'] as const;
export type RecipientKind = (typeof RECIPIENT_KINDS)[number];

export interface NotificationRecipient {
  kind: RecipientKind;
  /** A RoleId for `role`, a user id for `user`, unused for `requester`. */
  value?: string;
}

/**
 * A condition on the event's payload.
 *
 * Deliberately a small, closed comparison set over named fields rather than an
 * expression language: a rule an administrator can write wrongly in ways nobody
 * can debug is worse than one that only expresses simple things.
 */
export const CONDITION_OPERATORS = ['eq', 'neq', 'in', 'gt', 'lt'] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export interface NotificationCondition {
  field: string;
  op: ConditionOperator;
  value: string | number | string[];
}

/** Hours during which nothing is delivered; sending resumes afterwards. */
export interface QuietHours {
  enabled: boolean;
  /** 24h local time, `HH:MM`. A window may wrap midnight. */
  start: string;
  end: string;
}

export interface NotificationEscalation {
  enabled: boolean;
  /** Hours to wait before escalating an unacknowledged notification. */
  afterHours: number;
  toRole?: RoleId;
}

export interface NotificationRule {
  id: string;
  name: string;
  event: NotificationEvent;
  conditions: NotificationCondition[];
  channels: NotificationChannel[];
  recipients: NotificationRecipient[];
  /** Minimum minutes between two sends of this rule to the same recipient. 0 = no throttle. */
  throttleMinutes: number;
  quietHours: QuietHours;
  escalation: NotificationEscalation;
  scopeId?: string;
  scopeName?: string;
  status: 'active' | 'inactive';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Real counters, not estimates — see the rule log. */
  sentCount: number;
  lastFiredAt?: string;
}

/** One line of the delivery log: what this rule did, and to whom. */
export interface NotificationRuleLogEntry {
  id: string;
  ruleId: string;
  ruleName: string;
  event: NotificationEvent;
  at: string;
  subjectId?: string;
  recipients: string[];
  channels: NotificationChannel[];
  outcome: 'sent' | 'throttled' | 'quiet_hours' | 'no_recipients' | 'test';
  detail?: string;
}
