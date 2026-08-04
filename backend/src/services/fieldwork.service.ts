import { Asset, Inspection, WorkOrder, type AssetDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { recordObservation } from './observation.service.js';
import { presenceStateFor } from './observation.service.js';
import { AssetPresence } from '../models/index.js';

/**
 * The field queue — what one person actually has to do today.
 *
 * Mobile Workforce read the work-order collection and nothing else, which is
 * only part of a technician's day: inspections are due, and they are a
 * different collection with a different shape. Somebody in a warehouse should
 * not have to check two screens and merge them in their head.
 *
 * So this is one list, across sources, ordered by when it is due and how much
 * it matters — because the honest answer to "what do I do next" is a single
 * item, not two tabs.
 */

export type TaskKind = 'work-order' | 'inspection';

export interface FieldTask {
  id: string;
  kind: TaskKind;
  title: string;
  assetId: string;
  assetName: string;
  status: string;
  priority: string;
  dueDate: string;
  /** Negative when overdue — the sort key, and what the UI colours by. */
  daysUntilDue: number;
  assignedTo: string;
  /** Where the asset was last actually seen, so a technician can find it. */
  lastSeenZone?: string;
  lastSeenState?: string;
}

const PRIORITY_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/**
 * Everything assigned to one person, or everything unassigned if no one is named.
 *
 * Unassigned work is included deliberately when a technician asks for their own
 * queue: an unassigned critical job is the single most likely thing to be
 * missed, and hiding it until a planner touches it is how it gets missed.
 */
export async function fieldQueue(assignee?: string): Promise<FieldTask[]> {
  const assignedFilter = assignee
    ? { $or: [{ assignedTo: assignee }, { assignedTo: { $in: ['', 'Unassigned'] } }] }
    : {};

  const [orders, inspections, presence] = await Promise.all([
    WorkOrder.find({ status: { $ne: 'Completed' }, ...assignedFilter }).lean(),
    Inspection.find({
      status: { $in: ['Scheduled', 'In Progress'] },
      ...(assignee ? { $or: [{ inspector: assignee }, { inspector: { $in: ['', 'Unassigned'] } }] } : {}),
    }).lean(),
    AssetPresence.find().select('_id zone lastSeen').lean(),
  ]);

  const presenceById = new Map(presence.map((p) => [p._id, p]));
  const now = Date.now();
  const days = (d: Date) => Math.round((new Date(d).getTime() - now) / 86_400_000);

  const decorate = (assetId: string) => {
    const p = presenceById.get(assetId);
    return p
      ? { lastSeenZone: p.zone, lastSeenState: presenceStateFor(new Date(p.lastSeen), now) }
      : {};
  };

  const tasks: FieldTask[] = [
    ...orders.map((w) => ({
      id: w._id,
      kind: 'work-order' as const,
      title: w.title,
      assetId: w.assetId,
      assetName: w.assetName,
      status: w.status,
      priority: w.priority,
      dueDate: new Date(w.dueDate).toISOString(),
      daysUntilDue: days(w.dueDate),
      assignedTo: w.assignedTo,
      ...decorate(w.assetId),
    })),
    ...inspections.map((i) => ({
      id: i._id,
      kind: 'inspection' as const,
      title: i.title,
      assetId: i.assetId,
      assetName: i.assetName,
      status: i.status,
      // Inspections carry no priority of their own; they rank as ordinary work
      // rather than being sorted to the bottom for lacking a field.
      priority: 'Medium',
      dueDate: new Date(i.dueDate).toISOString(),
      daysUntilDue: days(i.dueDate),
      assignedTo: i.inspector,
      ...decorate(i.assetId),
    })),
  ];

  // Overdue first, then by priority, then by how soon it falls due.
  return tasks.sort((a, b) => {
    const aLate = a.daysUntilDue < 0;
    const bLate = b.daysUntilDue < 0;
    if (aLate !== bLate) return aLate ? -1 : 1;
    const rank = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (rank !== 0) return rank;
    return a.daysUntilDue - b.daysUntilDue;
  });
}

export interface ScanResult {
  asset: {
    id: string;
    name: string;
    serialNumber: string;
    category: string;
    status: string;
    custodian: string;
    location: string;
    healthScore: number;
    riskScore: number;
  };
  presence?: { zone: string; state: string; lastSeen: string };
  openTasks: FieldTask[];
  /** What this person can do with it right now, given its state. */
  actions: { key: string; label: string; hint: string }[];
}

/**
 * Scan-to-act: what a technician gets when they point a phone at a label.
 *
 * The scan is recorded as an observation before anything is returned. Someone
 * physically holding an asset is the highest-confidence sighting the system
 * will ever get, and throwing it away because the person was "only looking
 * something up" wastes the best data in the building.
 *
 * The actions are computed from state rather than listed statically, so the
 * screen never offers something that would be refused — no "check in" on an
 * asset nobody has out.
 */
export async function scanAsset(assetId: string, actor: string, zone?: string): Promise<ScanResult> {
  const asset = await Asset.findById(assetId).lean<AssetDoc>();
  if (!asset) throw ApiError.notFound('Asset');

  await recordObservation({
    assetId,
    source: 'qr',
    actor,
    ...(zone ? { zone } : {}),
  });

  const [presence, tasks] = await Promise.all([
    AssetPresence.findById(assetId).lean(),
    fieldQueue(),
  ]);

  const openTasks = tasks.filter((t) => t.assetId === assetId);
  const checkedOut = presence?.custody === 'Checked Out';

  const nextTask = openTasks[0];
  const actions = [
    checkedOut
      ? { key: 'check-in', label: 'Check in', hint: `Return it from ${presence?.custodian ?? 'its holder'}` }
      : { key: 'check-out', label: 'Check out', hint: 'Take custody of this asset' },
    nextTask
      ? {
          key: 'start-task',
          label: `Start ${nextTask.kind === 'inspection' ? 'inspection' : 'work order'}`,
          hint: nextTask.title,
        }
      : { key: 'raise-issue', label: 'Report a problem', hint: 'Raise a corrective work order against it' },
    { key: 'report-location', label: 'Confirm location', hint: 'Record where it actually is' },
  ];

  return {
    asset: {
      id: String(asset._id),
      name: asset.name,
      serialNumber: asset.serialNumber,
      category: asset.category,
      status: asset.status,
      custodian: asset.custodian ?? 'Unassigned',
      location: asset.location?.name ?? 'Unassigned',
      healthScore: asset.healthScore ?? 0,
      riskScore: asset.riskScore ?? 0,
    },
    ...(presence
      ? {
          presence: {
            zone: presence.zone,
            state: presenceStateFor(new Date(presence.lastSeen)),
            lastSeen: new Date(presence.lastSeen).toISOString(),
          },
        }
      : {}),
    openTasks,
    actions,
  };
}
