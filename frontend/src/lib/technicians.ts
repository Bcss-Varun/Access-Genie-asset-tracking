// ─────────────────────────────────────────────────────────────────────────────
// The field workforce roster.
//
// Work orders have always carried their technician as a plain name string in
// `assignedTo` (see workOrders.json) — there is no separate Technician
// collection, and adding one would mean a new backend model, migration and API
// surface just to hang a job title and a skill list off a name the system
// already has. So the roster is data the same way `getTelemetrySeries` is: a
// small, deterministic set keyed off what already exists, not a fetch.
//
// The two technicians who appear in the seeded work orders (Arjun Menon,
// Deepak Nair) are included as themselves; the rest of the roster fills out a
// realistic field team across the org's other facilities. Assigning a work
// order to any of them is a normal `assignedTo` write — nothing here is a
// foreign key the backend has to know about.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkOrder } from '@access-genie/shared';
import { allWorkOrders, getAssetById } from './dataset';
import { currentFieldStage, type FieldStage } from './field-ops';

export type Skill =
  | 'Networking'
  | 'Server Hardware'
  | 'Storage Systems'
  | 'Electrical & Power'
  | 'Mobile Devices'
  | 'Security Systems'
  | 'AV Equipment'
  | 'HVAC';

export const SKILLS: Skill[] = [
  'Networking', 'Server Hardware', 'Storage Systems', 'Electrical & Power',
  'Mobile Devices', 'Security Systems', 'AV Equipment', 'HVAC',
];

export type Shift = 'Day (08:00–16:00)' | 'Evening (14:00–22:00)' | 'Night (22:00–06:00)';

/** Technician-queue status shown on Workforce Overview and the dispatch roster. */
export type TechnicianStatus = 'Available' | 'Assigned' | 'En Route' | 'On Site' | 'On Job' | 'Waiting' | 'Completed' | 'Offline';

export interface TechnicianProfile {
  id: string;
  name: string;
  initials: string;
  title: string;
  skills: Skill[];
  homeFacility: string;
  shift: Shift;
  phone: string;
}

function initialsOf(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '—';
}

/** The curated roster, before initials are filled in — see `ROSTER` below. */
const ROSTER_BASE: Omit<TechnicianProfile, 'initials'>[] = [
  { id: 'TECH-01', name: 'Arjun Menon', title: 'Senior Field Technician — Data Center Ops', skills: ['Server Hardware', 'Networking', 'Electrical & Power'], homeFacility: 'Chennai Data Center', shift: 'Day (08:00–16:00)', phone: '+91 98410 22317' },
  { id: 'TECH-02', name: 'Deepak Nair', title: 'Field Technician', skills: ['Mobile Devices', 'Electrical & Power', 'Storage Systems'], homeFacility: 'Hyderabad Central Warehouse', shift: 'Day (08:00–16:00)', phone: '+91 90080 41156' },
  { id: 'TECH-03', name: 'Rahul Kumar', title: 'Field Technician — Networking', skills: ['Networking', 'Security Systems'], homeFacility: 'Bengaluru HQ', shift: 'Day (08:00–16:00)', phone: '+91 98867 30291' },
  { id: 'TECH-04', name: 'Priya Nathan', title: 'Field Technician — End-User Devices', skills: ['Mobile Devices', 'AV Equipment'], homeFacility: 'Bengaluru HQ', shift: 'Evening (14:00–22:00)', phone: '+91 99001 87732' },
  { id: 'TECH-05', name: 'Suresh Pillai', title: 'Field Technician — Facilities', skills: ['Electrical & Power', 'HVAC'], homeFacility: 'Mumbai Regional Hub', shift: 'Day (08:00–16:00)', phone: '+91 98200 55461' },
  { id: 'TECH-06', name: 'Meera Krishnan', title: 'Field Technician — Storage & Servers', skills: ['Storage Systems', 'Server Hardware'], homeFacility: 'Chennai Data Center', shift: 'Evening (14:00–22:00)', phone: '+91 97400 12988' },
  { id: 'TECH-07', name: 'Farhan Sheikh', title: 'Field Technician — Security', skills: ['Security Systems', 'Networking'], homeFacility: 'Delhi NCR Office', shift: 'Day (08:00–16:00)', phone: '+91 98111 67723' },
  { id: 'TECH-08', name: 'Lakshmi Narayan', title: 'Field Technician — End-User Devices', skills: ['Mobile Devices', 'AV Equipment'], homeFacility: 'Pune Distribution Centre', shift: 'Night (22:00–06:00)', phone: '+91 98221 40976' },
  { id: 'TECH-09', name: 'Vikram Shetty', title: 'Field Technician — Infrastructure', skills: ['Server Hardware', 'Electrical & Power'], homeFacility: 'Noida Operations Centre', shift: 'Evening (14:00–22:00)', phone: '+91 99580 23814' },
  { id: 'TECH-10', name: 'Kavya Iyer', title: 'Field Technician — Facilities', skills: ['HVAC', 'Storage Systems'], homeFacility: 'Ahmedabad Depot', shift: 'Day (08:00–16:00)', phone: '+91 90040 66215' },
];

/** The curated roster. Order is display order on the dispatch board. */
export const ROSTER: TechnicianProfile[] = ROSTER_BASE.map((t) => ({ ...t, initials: initialsOf(t.name) }));

export const rosterNames = (): string[] => ROSTER.map((t) => t.name);
export const technicianByName = (name: string): TechnicianProfile | undefined => ROSTER.find((t) => t.name === name);

function seedOf(id: string): number {
  return [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
}

const STAGE_TO_STATUS: Record<FieldStage, TechnicianStatus> = {
  Assigned: 'Assigned',
  Accepted: 'Assigned',
  'En Route': 'En Route',
  'On Site': 'On Site',
  'In Progress': 'On Job',
  Waiting: 'Waiting',
  Completed: 'Completed',
};

export interface LiveTechnician extends TechnicianProfile {
  status: TechnicianStatus;
  currentWorkOrder?: WorkOrder;
  currentFieldStage?: FieldStage;
  currentFacility: string;
  openWorkOrders: WorkOrder[];
  workloadHours: number;
  dueToday: number;
}

/**
 * The roster enriched with whatever it is doing right now.
 *
 * Recomputed on every call rather than cached — see dataset.ts's rule about
 * never deriving from live bindings at module scope. `allWorkOrders` changes
 * under a technician the moment Scheduling reassigns a job, and this has to
 * see that on the very next render.
 */
export function techniciansWithLiveState(source: WorkOrder[] = allWorkOrders): LiveTechnician[] {
  const today = new Date().toISOString().slice(0, 10);

  return ROSTER.map((tech) => {
    const openWorkOrders = source.filter((w) => w.assignedTo === tech.name && w.status !== 'Completed');
    const current = openWorkOrders.find((w) => w.status === 'In Progress') ?? openWorkOrders[0];
    const stage = current ? currentFieldStage(current) : undefined;

    const seed = seedOf(tech.id);
    const status: TechnicianStatus = current
      ? STAGE_TO_STATUS[stage as FieldStage]
      : seed % 4 === 0
        ? 'Offline'
        : 'Available';

    const asset = current ? getAssetById(current.assetId) : undefined;
    const currentFacility = asset?.location?.name ?? tech.homeFacility;
    const workloadHours = openWorkOrders.reduce((sum, w) => sum + w.estimatedHours, 0);
    const dueToday = openWorkOrders.filter((w) => w.dueDate.slice(0, 10) === today).length;

    return {
      ...tech,
      status,
      currentWorkOrder: current,
      currentFieldStage: stage,
      currentFacility,
      openWorkOrders,
      workloadHours,
      dueToday,
    };
  });
}

export const TECH_STATUS_TONE: Record<TechnicianStatus, 'slate' | 'primary' | 'amber' | 'emerald' | 'red'> = {
  Available: 'emerald',
  Assigned: 'primary',
  'En Route': 'amber',
  'On Site': 'primary',
  'On Job': 'primary',
  Waiting: 'amber',
  Completed: 'emerald',
  Offline: 'slate',
};

export { initialsOf };
