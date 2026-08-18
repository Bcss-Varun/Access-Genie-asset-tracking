// ─────────────────────────────────────────────────────────────────────────────
// Inspections & Checklists — one module, two halves.
//
// A **template** is the reusable body of checks: an ordered list of typed
// checkpoints, plus the scope saying which assets and facilities it applies to.
// An **inspection** is one execution of a template against one asset: the
// checkpoints copied in as answerable responses, who did it, when, and what
// they found.
//
// The copy is the important part. An inspection snapshots its template's
// checkpoints at the moment it is raised and records `templateVersion`, so
// editing a template never rewrites the history of inspections already carried
// out. A compliance record that changes because somebody reworded a question
// six months later is not a record.
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetCategory } from './domain.js';

/**
 * What a checkpoint asks for.
 *
 * `Pass/Fail` and `Yes/No` are separate types rather than one boolean: they read
 * differently on a form and, more importantly, they fail differently — a "No"
 * is only a failure when the question was phrased so that yes is good, which is
 * what `failWhen` records.
 */
export const INSPECTION_QUESTION_TYPES = ['Pass/Fail', 'Yes/No', 'Number', 'Text', 'Note'] as const;
export type InspectionQuestionType = (typeof INSPECTION_QUESTION_TYPES)[number];

/** The classification a record is filtered by. */
export const INSPECTION_TYPES = ['Safety', 'Compliance', 'Condition', 'Operational', 'Preventive'] as const;
export type InspectionType = (typeof INSPECTION_TYPES)[number];

/**
 * A single check.
 *
 * `key` is stable within a template and is what a response refers back to —
 * renaming a checkpoint's `label` therefore does not orphan the answers already
 * recorded against it.
 */
export interface InspectionCheckpoint {
  key: string;
  label: string;
  type: InspectionQuestionType;
  /** A required checkpoint must be answered before the inspection can close. */
  required: boolean;
  helpText?: string;
  /** `Number` only — the acceptable band. Outside it is a failure. */
  min?: number;
  max?: number;
  unit?: string;
  /**
   * `Pass/Fail` and `Yes/No` only — which answer counts as a failure.
   *
   * Defaults to the obvious one (`Fail`, `No`), but "Is the guard damaged?" is
   * a question where *yes* is the bad answer, and a checklist that cannot
   * express that forces every question to be rewritten backwards.
   */
  failWhen?: 'Fail' | 'No' | 'Yes';
}

/**
 * Where a template applies.
 *
 * Empty everywhere means "any asset" — a general safety checklist should not
 * have to enumerate the estate. Any non-empty list narrows: an asset matches if
 * it is named directly, or its category is listed, or it sits under one of the
 * facilities.
 */
export interface InspectionScope {
  assetIds: string[];
  assetCategories: AssetCategory[];
  /** Scope-node ids — every asset beneath one of these matches. */
  facilityIds: string[];
}

export interface InspectionTemplate {
  id: string;
  name: string;
  description: string;
  type: InspectionType;
  category: string;
  icon: string;
  checkpoints: InspectionCheckpoint[];
  scope: InspectionScope;
  estimatedMinutes: number;
  /** Retired templates cannot be scheduled from, but their history stays readable. */
  active: boolean;
  /** Bumped whenever the checkpoints change; stamped onto each inspection raised. */
  version: number;
  /** Inspections raised from this template. Joined on read, never stored. */
  usageCount?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Execution ────────────────────────────────────────────────────────────────

export const INSPECTION_STATUSES = ['Scheduled', 'In Progress', 'Passed', 'Failed'] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const INSPECTION_RESULTS = ['Pass', 'Fail', 'N/A', 'Pending'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

/** Statuses that mean the inspection has not been carried out yet. */
export const OPEN_INSPECTION_STATUSES: InspectionStatus[] = ['Scheduled', 'In Progress'];

/**
 * Which statuses may follow which.
 *
 * Shared with the client so a screen offers exactly the moves the API accepts.
 * `Passed` and `Failed` are terminal: re-inspecting is a new inspection, which
 * is the only way the history stays a history.
 */
export const INSPECTION_TRANSITIONS: Record<InspectionStatus, InspectionStatus[]> = {
  Scheduled: ['In Progress'],
  'In Progress': ['Passed', 'Failed'],
  Passed: [],
  Failed: [],
};

/**
 * One answered checkpoint.
 *
 * Carries its own `label` and `type` rather than pointing at the template for
 * them — see the note at the top of this file about why an executed inspection
 * must not change when its template does.
 *
 * `value` is the raw answer as given; `result` is the graded outcome the server
 * derives from it. Storing both is what lets "24.5 °C" be shown next to the
 * fact that it failed a 0–20 band.
 */
export interface InspectionResponse {
  key: string;
  label: string;
  type: InspectionQuestionType;
  required: boolean;
  helpText?: string;
  min?: number;
  max?: number;
  unit?: string;
  failWhen?: 'Fail' | 'No' | 'Yes';
  /** Graded by the server from `value`. Never sent by a client. */
  result: InspectionResult;
  /** `Pass`/`Yes`/a number/free text, or null while unanswered. */
  value: string | number | boolean | null;
  note?: string;
  /** What is wrong. Required by the server on a failed checkpoint. */
  finding?: string;
}

/** Where an inspection sits in the organisation. Derived from the asset on read. */
export interface InspectionPlacement {
  facilityId: string | null;
  facilityName: string;
  organizationId: string | null;
  organizationName: string;
  locationId: string | null;
  locationName: string;
}

export interface InspectionStatusEvent {
  from: InspectionStatus | null;
  to: InspectionStatus;
  at: string;
  actor: string;
  note?: string;
}

export interface Inspection {
  id: string;
  title: string;
  /** Absent only on records raised before templates existed. */
  templateId?: string;
  templateName: string;
  templateVersion?: number;
  type: InspectionType;
  assetId: string;
  assetName: string;
  status: InspectionStatus;
  /** When it is due to be carried out. */
  scheduledFor: string;
  /** The person or team it is booked to. */
  assignedTo: string;
  /** Who actually carried it out — stamped when it is completed. */
  performedBy?: string;
  startedAt?: string;
  completedAt?: string;
  responses: InspectionResponse[];
  /** Free-text summary written by the inspector. */
  notes: string;
  /** Counts across `responses`, computed on write so lists need no client math. */
  summary: { total: number; passed: number; failed: number; na: number; pending: number };
  /** Corrective work orders raised from this inspection's failures. */
  workOrderIds: string[];
  history: InspectionStatusEvent[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  placement?: InspectionPlacement;
}

// ── Read contracts ───────────────────────────────────────────────────────────

export interface InspectionStats {
  scheduled: number;
  inProgress: number;
  passed: number;
  failed: number;
  /** Not yet carried out and past its scheduled date. Overlaps the two above. */
  overdue: number;
  total: number;
}

/** Filter-bar options, built from the records that exist. */
export interface InspectionFacets {
  facilities: { id: string; name: string; count: number }[];
  assignees: { name: string; count: number; kind: 'technician' | 'user' | 'historic' }[];
  templates: { id: string; name: string; count: number }[];
  types: { type: InspectionType; count: number }[];
  statuses: { status: InspectionStatus; count: number }[];
}

/**
 * A failed checkpoint offered as the basis for a corrective work order.
 *
 * The API returns these rather than having the client reconstruct them from
 * `responses`, so "which failures still need work raising" is answered in one
 * place — including whether an order already exists for it.
 */
export interface InspectionFailure {
  key: string;
  label: string;
  finding: string;
  value: string | number | boolean | null;
  note?: string;
  /** Set once a corrective work order has been raised for this checkpoint. */
  workOrderId?: string;
}
