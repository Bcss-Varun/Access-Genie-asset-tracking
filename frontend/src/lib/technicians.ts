// ─────────────────────────────────────────────────────────────────────────────
// The field workforce master.
//
// The roster itself is a real, backend-persisted collection — see
// `backend/src/models/Technician.ts` — scoped by the org switcher exactly the
// way assets are (same `location.id` field, same filter). It arrives through
// the same `/dataset` payload as everything else (`allTechnicians`, see
// `dataset.ts`), so a technician added, edited or put on leave from anywhere
// in the application is visible here on the very next hydrate — there is no
// separate copy for Mobile Workforce to drift out of sync with.
//
// What lives in *this* file is the derived layer on top of that record:
// status, current job, workload, skill match — none of it stored, all of it
// computed from the roster plus whatever `allWorkOrders` says right now. See
// `techniciansWithLiveState` below.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScopeNode, ShiftLabel, Technician, WorkOrder } from '@access-genie/shared';
import { TECHNICIAN_SKILLS } from '@access-genie/shared';
import { allTechnicians, allWorkOrders, getAssetById } from './dataset';
import { currentFieldStage, type FieldStage } from './field-ops';
import { flattenScope } from './rbac';

export type Skill = (typeof TECHNICIAN_SKILLS)[number];
export const SKILLS: Skill[] = [...TECHNICIAN_SKILLS];

/** Start/end as a 24h decimal hour — 9.5 = 09:30. Night wraps past midnight (22 → 7). */
export interface ShiftWindow {
  label: ShiftLabel;
  start: number;
  end: number;
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** The real region each facility sits under — see the org's scope tree (Administration ▸ Org & Structure). */
const FACILITY_REGION: Record<string, string> = {
  'Hyderabad Central Warehouse': 'South India',
  'Bengaluru HQ': 'South India',
  'Chennai Data Center': 'South India',
  'Mumbai Regional Hub': 'North & West India',
  'Delhi NCR Office': 'North & West India',
  'Pune Distribution Centre': 'West India',
  'Ahmedabad Depot': 'West India',
  'Noida Operations Centre': 'North India',
};

export const regionOf = (facility: string): string => FACILITY_REGION[facility] ?? 'Unmapped';
export const FACILITIES = Object.keys(FACILITY_REGION);

/**
 * Which facility names a selected scope node covers — the roster's own
 * narrowing to match the org/region/facility switcher in the top bar, for the
 * one place that still needs it client-side: a facility clicked in a table
 * row before the dataset has been re-fetched at that scope.
 */
export function facilitiesUnder(scope: ScopeNode): Set<string> | null {
  if (scope.level === 'group') return null;
  if (scope.level === 'facility') return new Set([scope.name]);
  const names = flattenScope(scope)
    .filter(({ node }) => node.level === 'facility')
    .map(({ node }) => node.name);
  return new Set(names);
}

/** The scope node for a facility by name, for "click a facility row → drill down". */
export function scopeNodeForFacility(name: string, tree?: ScopeNode): ScopeNode | undefined {
  return flattenScope(tree).find(({ node }) => node.level === 'facility' && node.name === name)?.node;
}

/** Technician-queue status shown on the Workforce Dashboard and the dispatch roster. */
export type TechnicianStatus = 'Available' | 'Assigned' | 'On Job' | 'En Route' | 'Off Shift' | 'Unavailable';

/**
 * The roster record, reshaped for the UI: `homeFacility`/`locationId` split
 * out of `location`, and `initials` derived rather than stored — nothing here
 * a screen needs to invent, only fields the backend record does not carry
 * because they are presentational.
 */
export interface TechnicianProfile {
  id: string;
  name: string;
  initials: string;
  title: string;
  department: string;
  skills: Skill[];
  homeFacility: string;
  locationId: string;
  shift: ShiftWindow;
  workingDays: string[];
  email: string;
  phone: string;
  active: boolean;
  onLeaveUntil?: string;
}

function initialsOf(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '—';
}

function toProfile(t: Technician): TechnicianProfile {
  return {
    id: t.id,
    name: t.name,
    initials: initialsOf(t.name),
    title: t.title,
    department: t.department,
    skills: t.skills as Skill[],
    homeFacility: t.location.name,
    locationId: t.location.id,
    shift: t.shift,
    workingDays: t.workingDays,
    email: t.email,
    phone: t.phone,
    active: t.active,
    onLeaveUntil: t.onLeaveUntil,
  };
}

/**
 * The live roster, reshaped for the UI. Reads `allTechnicians` at call time —
 * call this inside a component or another function, never at module scope
 * (see dataset.ts's rule), so it always reflects the most recent hydrate.
 */
export function technicianRoster(source: Technician[] = allTechnicians): TechnicianProfile[] {
  return source.map(toProfile);
}

export const rosterNames = (source: Technician[] = allTechnicians): string[] => source.map((t) => t.name);
export const technicianByName = (name: string, source: Technician[] = allTechnicians): TechnicianProfile | undefined => {
  const t = source.find((x) => x.name === name);
  return t ? toProfile(t) : undefined;
};

function seedOf(id: string): number {
  return [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
}

/** Whether `now` falls inside a technician's configured shift and working days. */
export function isOnShift(tech: Pick<TechnicianProfile, 'shift' | 'workingDays'>, now: Date = new Date()): boolean {
  if (!tech.workingDays.includes(DAY_ABBR[now.getDay()] as string)) return false;
  const hour = now.getHours() + now.getMinutes() / 60;
  const { start, end } = tech.shift;
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

const STAGE_TO_STATUS: Record<FieldStage, TechnicianStatus | null> = {
  Assigned: 'Assigned',
  Accepted: 'Assigned',
  'En Route': 'En Route',
  'On Site': 'On Job',
  'In Progress': 'On Job',
  Waiting: 'On Job',
  // A just-completed job leaves no active assignment — status falls through
  // to the schedule/leave check below, same as having no job at all.
  Completed: null,
};

export interface LiveTechnician extends TechnicianProfile {
  region: string;
  status: TechnicianStatus;
  currentWorkOrder?: WorkOrder;
  currentFieldStage?: FieldStage;
  currentFacility: string;
  openWorkOrders: WorkOrder[];
  workloadHours: number;
  dueToday: number;
  /** Open hours booked against an 8-hour day — what "highly utilized" is measured against. */
  utilizationPct: number;
}

/**
 * The roster enriched with whatever it is doing right now.
 *
 * Status is derived, not stored — see the module doc. A technician is:
 *   Unavailable  → inactive or on leave, full stop.
 *   Assigned / En Route / On Job → whatever their current work order's field
 *     stage says (see lib/field-ops.ts), regardless of the clock: a job
 *     running past shift end is still a job, not "off shift".
 *   Available / Off Shift → no active job, split on whether `now` falls
 *     inside their configured shift and working days.
 *
 * Recomputed on every call rather than cached — see dataset.ts's rule about
 * never deriving from live bindings at module scope. `allWorkOrders` changes
 * under a technician the moment Scheduling reassigns a job, and both it and
 * the roster itself (`allTechnicians`) have to be seen on the very next
 * render, not the render after a remount.
 */
const DAY_CAPACITY_HOURS = 8;

export function techniciansWithLiveState(
  workOrders: WorkOrder[] = allWorkOrders,
  now: Date = new Date(),
  roster: Technician[] = allTechnicians,
): LiveTechnician[] {
  const today = now.toISOString().slice(0, 10);

  return technicianRoster(roster).map((tech) => {
    const openWorkOrders = workOrders.filter((w) => w.assignedTo === tech.name && w.status !== 'Completed' && w.status !== 'Cancelled');
    const current = openWorkOrders.find((w) => w.status === 'In Progress') ?? openWorkOrders[0];
    const stage = current ? currentFieldStage(current) : undefined;
    const fromStage = stage ? STAGE_TO_STATUS[stage] : null;

    const onLeave = !!tech.onLeaveUntil && tech.onLeaveUntil >= today;
    const status: TechnicianStatus =
      !tech.active || onLeave
        ? 'Unavailable'
        : fromStage
          ? fromStage
          : isOnShift(tech, now)
            ? 'Available'
            : 'Off Shift';

    const asset = current ? getAssetById(current.assetId) : undefined;
    const currentFacility = asset?.location?.name ?? tech.homeFacility;
    const workloadHours = openWorkOrders.reduce((sum, w) => sum + w.estimatedHours, 0);
    const dueToday = openWorkOrders.filter((w) => w.dueDate.slice(0, 10) === today).length;

    return {
      ...tech,
      region: regionOf(tech.homeFacility),
      status,
      currentWorkOrder: current,
      currentFieldStage: stage,
      currentFacility,
      openWorkOrders,
      workloadHours,
      dueToday,
      utilizationPct: Math.round((workloadHours / DAY_CAPACITY_HOURS) * 100),
    };
  });
}

export const TECH_STATUS_TONE: Record<TechnicianStatus, 'slate' | 'primary' | 'amber' | 'emerald' | 'red'> = {
  Available: 'emerald',
  Assigned: 'primary',
  'On Job': 'primary',
  'En Route': 'amber',
  'Off Shift': 'slate',
  Unavailable: 'red',
};

/** How well a technician's skills match a required skill — the basis for Scheduling & Dispatch's ranking. */
export function skillMatchPct(tech: Pick<TechnicianProfile, 'skills'>, requiredSkill: string | undefined): number {
  if (!requiredSkill) return 50; // no requirement stated — every technician is an equally-unranked candidate
  if (tech.skills.includes(requiredSkill as Skill)) return 100;
  // Adjacent skills still count for something — a networking tech can often
  // help with security systems, an electrical tech with HVAC, and so on.
  const ADJACENT: Partial<Record<Skill, Skill[]>> = {
    Networking: ['Security Systems'],
    'Security Systems': ['Networking'],
    'Electrical & Power': ['HVAC'],
    HVAC: ['Electrical & Power'],
    'Server Hardware': ['Storage Systems'],
    'Storage Systems': ['Server Hardware'],
    'Mobile Devices': ['AV Equipment'],
    'AV Equipment': ['Mobile Devices'],
  };
  const adjacent = ADJACENT[requiredSkill as Skill] ?? [];
  if (tech.skills.some((s) => adjacent.includes(s))) return 60;
  return 25;
}

export { initialsOf, seedOf };
