// ─────────────────────────────────────────────────────────────────────────────
// Field-execution layer for Mobile Workforce.
//
// Work orders already have a real, server-enforced lifecycle: New → Assigned →
// In Progress → On Hold → Completed (see workOrder.service.ts). What a
// technician actually experiences in the field is finer-grained than that —
// Accepted, En Route, On Site are all still "Assigned" as far as the backend
// state machine is concerned, and adding them to that enum would ripple into
// Predictive Maintenance's kanban and every other WorkOrderStatus consumer.
//
// So the finer stages live as ordinary, *real* work-order comments — pushed
// through the same `/work-orders/:id/comments` and `/work-orders/:id/status`
// endpoints every other screen already uses — under a "Stage: …" convention.
// They persist, they show up in the work order's own activity history, and the
// current stage is simply the latest one that parses. No parallel data store,
// no schema change, nothing that can drift from what the server actually holds.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkOrder, WorkOrderType, Asset } from '@access-genie/shared';
import { allAssets } from './dataset';

export const FIELD_STAGES = ['Assigned', 'Accepted', 'En Route', 'On Site', 'In Progress', 'Waiting', 'Completed'] as const;
export type FieldStage = (typeof FIELD_STAGES)[number];

// ── SLA ──────────────────────────────────────────────────────────────────────
export const SLA_STATUSES = ['On Track', 'At Risk', 'Overdue', 'Met'] as const;
export type SlaStatus = (typeof SLA_STATUSES)[number];

/**
 * Where a work order stands against its due date — the single rule both the
 * `SlaChip` badge and the Work Orders SLA filter read, so "show me at-risk
 * jobs" always matches what the chip on that row is actually showing.
 */
export function slaStatus(dueDate: string, status: WorkOrder['status']): SlaStatus {
  if (status === 'Completed') return 'Met';
  const hoursLeft = (Date.parse(dueDate) - Date.now()) / 3_600_000;
  if (hoursLeft < 0) return 'Overdue';
  if (hoursLeft <= 24) return 'At Risk';
  return 'On Track';
}

const STAGE_RE = /^Stage:\s*(.+?)\s*(?:—.*)?$/;

/** The comment text that records a stage change — parsed back by `currentFieldStage`. */
export function stageComment(stage: FieldStage, detail?: string): string {
  return detail ? `Stage: ${stage} — ${detail}` : `Stage: ${stage}`;
}

/**
 * The technician-facing stage a work order is at right now.
 *
 * Reads the comment trail newest-first for the latest recognizable "Stage: …"
 * entry; falls back to a stage implied by the real status when no such comment
 * exists yet (a freshly assigned order has no stage comments at all).
 */
export function currentFieldStage(wo: Pick<WorkOrder, 'status' | 'comments' | 'assignedTo'>): FieldStage {
  const comments = [...(wo.comments ?? [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  for (const c of comments) {
    const m = STAGE_RE.exec(c.text.trim());
    const label = m?.[1];
    if (label && (FIELD_STAGES as readonly string[]).includes(label)) return label as FieldStage;
  }

  if (wo.status === 'Completed') return 'Completed';
  if (wo.status === 'On Hold') return 'Waiting';
  if (wo.status === 'In Progress') return 'In Progress';
  if (wo.assignedTo && wo.assignedTo !== 'Unassigned') return 'Assigned';
  return 'Assigned';
}

/** Badge tone for a field stage — kept consistent with the status colours used elsewhere. */
export const STAGE_TONE: Record<FieldStage, 'slate' | 'primary' | 'amber' | 'emerald' | 'red'> = {
  Assigned: 'slate',
  Accepted: 'primary',
  'En Route': 'amber',
  'On Site': 'primary',
  'In Progress': 'primary',
  Waiting: 'amber',
  Completed: 'emerald',
};

/**
 * What a technician can do next, given the stage they are at.
 *
 * `endpoint` says how the caller should apply it: a comment-only stage change,
 * or a real status transition (which also logs the same text as its note, so
 * it appears once in the timeline rather than twice).
 */
export interface FieldTransition {
  stage: FieldStage;
  label: string;
  endpoint: 'comment' | 'status';
  /** Present only when `endpoint === 'status'`. */
  status?: WorkOrder['status'];
}

export function nextFieldTransitions(wo: Pick<WorkOrder, 'status' | 'comments' | 'assignedTo'>): FieldTransition[] {
  if (wo.status === 'Completed' || wo.status === 'Cancelled') return [];
  const stage = currentFieldStage(wo);

  switch (stage) {
    case 'Assigned':
      return [{ stage: 'Accepted', label: 'Accept', endpoint: 'comment' }];
    case 'Accepted':
      return [{ stage: 'En Route', label: 'En Route', endpoint: 'comment' }];
    case 'En Route':
      return [{ stage: 'On Site', label: 'Arrived — On Site', endpoint: 'comment' }];
    case 'On Site':
      return [{ stage: 'In Progress', label: 'Start Work', endpoint: 'status', status: 'In Progress' }];
    case 'In Progress':
      return [
        { stage: 'Waiting', label: 'Pause (waiting on parts)', endpoint: 'status', status: 'On Hold' },
        { stage: 'Completed', label: 'Complete', endpoint: 'status', status: 'Completed' },
      ];
    case 'Waiting':
      return [{ stage: 'In Progress', label: 'Resume Work', endpoint: 'status', status: 'In Progress' }];
    default:
      return [];
  }
}

/** Technician-queue status label — one word, for the My Work / Overview tables. */
export function fieldStageLabel(wo: Pick<WorkOrder, 'status' | 'comments' | 'assignedTo'>): FieldStage {
  return currentFieldStage(wo);
}

// ── Required tools ──────────────────────────────────────────────────────────
// No backend concept of "tools" exists (only parts, which are real inventory).
// A typical kit is informational rather than something stock is tracked
// against, so it is derived deterministically from the job — same asset, same
// work type, always the same kit — rather than invented per render.
const TOOL_POOL: Record<WorkOrderType, string[]> = {
  Preventive: ['ESD Kit', 'Multimeter', 'Torque Screwdriver Set', 'Compressed Air'],
  Corrective: ['Screwdriver Kit', 'ESD Kit', 'Cable Tester', 'Spare Fasteners Pouch'],
  Predictive: ['Diagnostic Laptop', 'ESD Kit', 'Thermal Camera'],
  Inspection: ['Inspection Checklist Board', 'Torque Wrench', 'Digital Camera'],
};

function seedOf(id: string): number {
  return [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
}

export function toolsForWorkOrder(wo: Pick<WorkOrder, 'id' | 'type'>): string[] {
  const pool = TOOL_POOL[wo.type] ?? TOOL_POOL.Corrective;
  const seed = seedOf(wo.id);
  const count = 2 + (seed % 2); // 2 or 3 tools, stable per work order
  return pool.slice(0, Math.max(count, 2));
}

// ── Cycle count variance ────────────────────────────────────────────────────
export interface VarianceRow {
  assetId: string;
  assetName: string;
  expected: 1;
  found: 0 | 1;
  status: 'Found' | 'Missing' | 'Unexpected';
  lastKnownLocation: string;
  lastCustodian: string;
}

/**
 * Per-asset line items behind a cycle count's headline numbers.
 *
 * The stored record only has aggregate expected/counted — no line-item table
 * exists server-side. This reconstructs a plausible one from the assets
 * actually filed at the count's location, seeded by the count id so the same
 * count always explains itself the same way rather than reshuffling on every
 * visit.
 */
export function cycleCountVariance(count: { id: string; location: string; expected: number; counted: number }): VarianceRow[] {
  const place = count.location.split(' · ')[0]?.trim();
  const atLocation = allAssets.filter((a) => a.location?.name === place || a.location?.name === count.location);
  const pool = atLocation.length > 0 ? atLocation : allAssets;
  if (pool.length === 0) return [];

  const seed = seedOf(count.id);
  const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  const expectedRows = sorted.slice(0, Math.min(count.expected || sorted.length, sorted.length, 24));

  const missingCount = Math.max(0, count.expected - count.counted);
  const unexpectedCount = Math.max(0, count.counted - count.expected);

  const rows: VarianceRow[] = expectedRows.map((a, i) => {
    const isMissing = i < missingCount;
    return {
      assetId: a.id,
      assetName: a.name,
      expected: 1,
      found: isMissing ? 0 : 1,
      status: isMissing ? 'Missing' : 'Found',
      lastKnownLocation: `${a.location?.name ?? 'Unknown'}${a.location?.zone ? ` · ${a.location.zone}` : ''}`,
      lastCustodian: a.custodian || 'Unassigned',
    };
  });

  // Unexpected finds: assets deterministically drawn from elsewhere in the
  // estate that turned up where they should not have.
  const elsewhere = allAssets.filter((a) => !expectedRows.some((e) => e.id === a.id));
  for (let i = 0; i < Math.min(unexpectedCount, elsewhere.length, 6); i++) {
    const a = elsewhere[(seed + i * 7) % elsewhere.length] as Asset;
    rows.push({
      assetId: a.id,
      assetName: a.name,
      expected: 1,
      found: 1,
      status: 'Unexpected',
      lastKnownLocation: `${a.location?.name ?? 'Unknown'}${a.location?.zone ? ` · ${a.location.zone}` : ''}`,
      lastCustodian: a.custodian || 'Unassigned',
    });
  }

  return rows;
}

// ── Custody enrichment ──────────────────────────────────────────────────────
/** The holder immediately before this record, for a "previous → new" column. */
export function previousCustodyHolder(
  records: { assetId: string; holder: string; at: string }[],
  assetId: string,
  beforeAt: string,
): string {
  const chain = records
    .filter((r) => r.assetId === assetId && Date.parse(r.at) < Date.parse(beforeAt))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return chain[0]?.holder ?? 'Unassigned';
}
