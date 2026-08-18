import type { PipelineStage } from 'mongoose';
import {
  ACTIVE_WORK_ORDER_TYPES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_SOURCES,
  WORK_ORDER_SOURCE_LABELS,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TRANSITIONS,
  WORK_ORDER_TYPES,
  isActiveWorkOrderSource,
  type ApiMeta,
  type WorkOrderBoard,
  type WorkOrderFacets,
  type WorkOrderPlacement,
  type WorkOrderPriority,
  type WorkOrderSource,
  type WorkOrderStatus,
  type WorkOrderType,
} from '@access-genie/shared';
import {
  Activity,
  Asset,
  ScopeNodeModel,
  Technician,
  User,
  WorkOrder,
  nextId,
  type ScopeNodeDoc,
  type WorkOrderDoc,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { assertLocationVisible, type VisibleScope } from './tenancy.service.js';
import { markEstateChanged } from './derivation.scheduler.js';
import { applyLifecycleTransition } from './lifecycle.service.js';
import { descendantIds } from './scopeFilter.service.js';
import { buildMeta } from '../utils/response.js';
import { escapeRegex, parsePagination } from '../utils/query.js';
import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrderBoardQuery,
  WorkOrderListQuery,
} from '../validators/workOrder.validator.js';

/**
 * Work orders — the executed side of maintenance.
 *
 * Every read here goes through one pipeline builder, `matchStages`, and that is
 * the point: the board, the list, the facets and the stats are four shapes of
 * the same query, so a filter cannot mean one thing on the board and another in
 * the list. They were previously separate `find()` calls with separate filter
 * logic, which is how a board and a list showing "the same" data drift apart.
 *
 * **Placement is derived, never stored.** A work order has no facility of its
 * own; it has an asset, and the asset records where it is. Copying the facility
 * onto the order would freeze it — move the asset and every historic order
 * would still name the old facility, with nothing to detect the drift. The
 * asset is joined on read and the scope tree resolves the facility above it.
 *
 * **Predictive raising is parked.** Nothing in this file writes `Predictive` or
 * sets `aiGenerated`; the validators refuse both on the way in. Records that
 * already carry them still read, list and filter — see
 * `ACTIVE_WORK_ORDER_SOURCES` for why that split is enforced on writes only.
 */

const SORTABLE = ['dueDate', 'scheduledDate', 'priority', 'status', 'createdAt', 'updatedAt', 'estimatedHours', 'title'];

/** A work order is "open" until it is completed or cancelled. */
export const OPEN_WO_STATUSES: WorkOrderStatus[] = ['New', 'Assigned', 'In Progress', 'On Hold'];

/** What "no technician" is stored as. Empty strings are normalised to this. */
const UNASSIGNED = 'Unassigned';

// ─────────────────────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A CSV parameter narrowed to the members of an enum it actually names.
 *
 * Unrecognised members are dropped rather than refused, and a parameter naming
 * nothing valid becomes `undefined` — which reads as "no filter", not "match
 * none". A bookmark from a build where a status was spelled differently should
 * still render a list.
 *
 * Note this validates against the **full** vocabulary, not the active subset:
 * `?source=Predictive Maintenance` has to keep working, or the records carrying
 * that parked value become unreachable.
 */
function csvEnum<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] | undefined {
  if (!raw) return undefined;
  const wanted = new Set(raw.split(',').map((part) => part.trim()));
  const matched = allowed.filter((value) => wanted.has(value));
  return matched.length > 0 ? matched : undefined;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

const ASSET_COLLECTION = Asset.collection.name;

/**
 * Every scope id beneath the requested facility.
 *
 * An asset records the single node it sits in — a rack on a floor — so
 * filtering by a facility means matching the whole subtree, not the facility's
 * own id. A parentless node (the group, or a lone organisation) covers
 * everything, so it resolves to no filter rather than to a set that would
 * wrongly exclude assets whose location is missing.
 */
async function facilitySubtree(facilityId: string): Promise<string[] | null> {
  const rows = await ScopeNodeModel.find().lean<ScopeNodeDoc[]>();
  const node = rows.find((r) => r._id === facilityId);
  if (!node) throw ApiError.notFound('Facility');
  if (!node.parentId) return null;
  return [...descendantIds(rows, facilityId)];
}

/**
 * The stages every work-order read shares: filter, join the asset, filter again
 * on what the join revealed.
 *
 * Work-order fields are matched **before** the `$lookup` so the join runs over
 * as few documents as possible; the facility filter has to come after it,
 * because the facility lives on the asset.
 */
async function matchStages(scope: VisibleScope, query: Partial<WorkOrderListQuery>): Promise<PipelineStage[]> {
  const stages: PipelineStage[] = [];
  const match: Record<string, unknown> = {};

  const status = csvEnum(query.status, WORK_ORDER_STATUSES);
  if (status) match.status = { $in: status };

  const priority = csvEnum(query.priority, WORK_ORDER_PRIORITIES);
  if (priority) match.priority = { $in: priority };

  const type = csvEnum(query.type, WORK_ORDER_TYPES);
  if (type) match.type = { $in: type };

  const source = csvEnum(query.source, WORK_ORDER_SOURCES);
  if (source) {
    // `Manual` also covers records written before `source` existed: they are
    // hand-raised orders with the field simply absent, and excluding them from
    // a Manual filter would hide real work.
    match.$and = [
      {
        $or: source.includes('Manual')
          ? [{ source: { $in: source } }, { source: { $exists: false } }, { source: null }]
          : [{ source: { $in: source } }],
      },
    ];
  }

  if (query.assetId) match.assetId = query.assetId;

  if (query.unassigned === 'true') match.assignedTo = UNASSIGNED;
  else if (query.assignedTo) match.assignedTo = query.assignedTo;

  // Overdue is "past due and still open" — a completed order that was late is
  // history, not backlog, and putting it in the overdue queue would mean the
  // number never goes down.
  if (query.overdue === 'true') {
    match.dueDate = { $lt: new Date() };
    match.status = { $in: status ? status.filter((s) => OPEN_WO_STATUSES.includes(s)) : OPEN_WO_STATUSES };
  } else {
    const dueFrom = parseDate(query.dueFrom);
    const dueTo = parseDate(query.dueTo);
    if (dueFrom || dueTo) {
      match.dueDate = { ...(dueFrom ? { $gte: dueFrom } : {}), ...(dueTo ? { $lte: dueTo } : {}) };
    }
  }

  const scheduledFrom = parseDate(query.scheduledFrom);
  const scheduledTo = parseDate(query.scheduledTo);
  if (scheduledFrom || scheduledTo) {
    match.scheduledDate = {
      ...(scheduledFrom ? { $gte: scheduledFrom } : {}),
      ...(scheduledTo ? { $lte: scheduledTo } : {}),
    };
  }

  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    match.$or = [{ title: rx }, { description: rx }, { assetName: rx }, { _id: rx }, { assignedTo: rx }];
  }

  if (Object.keys(match).length > 0) stages.push({ $match: match });

  stages.push(
    { $lookup: { from: ASSET_COLLECTION, localField: 'assetId', foreignField: '_id', as: '__asset' } },
    // Preserved rather than dropped: a work order whose asset was deleted is
    // still outstanding work, and hiding it would make the backlog read low.
    { $unwind: { path: '$__asset', preserveNullAndEmptyArrays: true } },
  );

  /*
   * Tenant isolation, applied immediately after the join.
   *
   * A work order carries no location of its own — it has an asset, and the
   * asset sits somewhere in the tree — so this is the first stage at which the
   * estate can be enforced. It is ANDed on top of whatever the caller filtered
   * by, so no query parameter can widen past it.
   */
  if (!scope.coversAll) {
    stages.push({ $match: { '__asset.location.id': { $in: [...scope.ids] } } });
  }

  if (query.facility) {
    const ids = await facilitySubtree(query.facility);
    if (ids) stages.push({ $match: { '__asset.location.id': { $in: ids } } });
  }

  stages.push({ $addFields: { __priorityRank: PRIORITY_RANK_EXPR, __statusRank: STATUS_RANK_EXPR } });

  return stages;
}

/*
 * Priority and status sort by meaning, not by spelling.
 *
 * Both are stored as strings, and a plain `$sort` on either orders them
 * alphabetically: descending priority put "Medium" above "Critical", which is
 * the exact opposite of what someone sorting a maintenance queue by priority is
 * asking for. Status is worse — its natural order is the workflow (New →
 * Assigned → In Progress → …), which has no alphabetical relationship at all.
 *
 * The rank is computed in the pipeline rather than stored, because it is
 * derived: a stored copy is one more field that can disagree with the value it
 * was derived from.
 */
const PRIORITY_RANK_EXPR = {
  $switch: {
    branches: WORK_ORDER_PRIORITIES.map((priority, index) => ({ case: { $eq: ['$priority', priority] }, then: index })),
    default: -1,
  },
};

const STATUS_RANK_EXPR = {
  $switch: {
    branches: WORK_ORDER_STATUSES.map((status, index) => ({ case: { $eq: ['$status', status] }, then: index })),
    default: -1,
  },
};

/** Map a sortable field onto the expression that actually orders it correctly. */
const SORT_FIELD_ALIASES: Record<string, string> = {
  priority: '__priorityRank',
  status: '__statusRank',
};

function sortStage(sort: Record<string, 1 | -1 | import('mongoose').SortOrder>): Record<string, 1 | -1> {
  const out: Record<string, 1 | -1> = {};
  for (const [field, direction] of Object.entries(sort)) {
    out[SORT_FIELD_ALIASES[field] ?? field] = direction === -1 || direction === 'desc' ? -1 : 1;
  }
  // `_id` breaks ties so paging is stable: without it, two orders sharing a due
  // date can swap places between page 1 and page 2 and one is never seen.
  out._id = 1;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Placement
// ─────────────────────────────────────────────────────────────────────────────

interface Hierarchy {
  byId: Map<string, ScopeNodeDoc>;
}

async function loadHierarchy(): Promise<Hierarchy> {
  const rows = await ScopeNodeModel.find().lean<ScopeNodeDoc[]>();
  return { byId: new Map(rows.map((r) => [r._id, r])) };
}

function nearestAncestor(byId: Map<string, ScopeNodeDoc>, start: string, level: string): ScopeNodeDoc | null {
  const seen = new Set<string>();
  let node = byId.get(start);
  while (node && !seen.has(node._id)) {
    seen.add(node._id); // a cycle in the adjacency list would otherwise spin forever
    if (node.level === level) return node;
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return null;
}

/** Resolve one asset's location into the facility and organisation above it. */
function placementFor(
  hierarchy: Hierarchy,
  location: { id?: string; name?: string } | undefined,
): WorkOrderPlacement {
  const locationId = location?.id ?? null;
  const facility = locationId ? nearestAncestor(hierarchy.byId, locationId, 'facility') : null;
  const organization = locationId ? nearestAncestor(hierarchy.byId, locationId, 'org') : null;

  return {
    facilityId: facility?._id ?? null,
    facilityName: facility?.name ?? 'Unassigned',
    organizationId: organization?._id ?? null,
    organizationName: organization?.name ?? 'Unassigned',
    locationId,
    locationName: location?.name ?? 'Unassigned',
  };
}

/** The joined row as the pipeline leaves it, before placement is attached. */
type JoinedWorkOrder = WorkOrderDoc & {
  __asset?: { location?: { id?: string; name?: string } };
  __priorityRank?: number;
  __statusRank?: number;
};

/**
 * Strip the pipeline's scratch fields and attach the derived placement.
 *
 * The `__`-prefixed fields exist only to join and to sort; letting them reach
 * the wire would publish an internal ordering as if it were part of the
 * contract, and the first client to sort on `__priorityRank` would be broken by
 * the next change to it.
 */
function present(rows: JoinedWorkOrder[], hierarchy: Hierarchy): WorkOrderDoc[] {
  return rows.map((row) => {
    const { __asset, __priorityRank, __statusRank, ...rest } = row;
    return { ...rest, placement: placementFor(hierarchy, __asset?.location) } as WorkOrderDoc;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export async function listWorkOrders(
  scope: VisibleScope,
  query: WorkOrderListQuery,
): Promise<{ items: WorkOrderDoc[]; meta: ApiMeta }> {
  const pagination = parsePagination(query, SORTABLE, 'dueDate');
  const stages = await matchStages(scope, query);

  const [rows, hierarchy] = await Promise.all([
    WorkOrder.aggregate<{ items: JoinedWorkOrder[]; total: { count: number }[] }>([
      ...stages,
      {
        // The page and its count in one round trip. Two queries would be two
        // trips against a pool this app pins to a single connection, and could
        // disagree if a write landed between them.
        $facet: {
          items: [{ $sort: sortStage(pagination.sort) }, { $skip: pagination.skip }, { $limit: pagination.limit }],
          total: [{ $count: 'count' }],
        },
      },
    ]).exec(),
    loadHierarchy(),
  ]);

  const facet = rows[0];
  const total = facet?.total[0]?.count ?? 0;

  return {
    items: present(facet?.items ?? [], hierarchy),
    meta: buildMeta(pagination.page, pagination.limit, total),
  };
}

/**
 * The board in its stored shape.
 *
 * Structurally `WorkOrderBoard` (the wire contract) but holding `WorkOrderDoc`
 * rows — `_id` and `Date`s, not `id` and ISO strings. `sendData` does that
 * conversion at the one place every response leaves through, so services deal
 * in documents and only the client sees the wire type. Same reason
 * `listWorkOrders` returns `WorkOrderDoc[]`.
 */
type BoardResult = Omit<WorkOrderBoard, 'columns'> & {
  columns: { status: WorkOrderStatus; total: number; items: WorkOrderDoc[] }[];
};

/**
 * The board: the same filtered set, split by status.
 *
 * Each column reports its **true** total alongside a capped page of rows. The
 * two are different numbers on purpose — shipping four hundred documents to
 * draw a scrollable column is waste, but a header that counts only what was
 * shipped under-reports the backlog, which is the failure mode that makes a
 * board untrustworthy.
 */
export async function getWorkOrderBoard(scope: VisibleScope, query: WorkOrderBoardQuery): Promise<BoardResult> {
  const limitPerColumn = query.limitPerColumn;
  const stages = await matchStages(scope, query);
  const pagination = parsePagination(query, SORTABLE, 'dueDate');

  const [rows, hierarchy] = await Promise.all([
    WorkOrder.aggregate<{ _id: WorkOrderStatus; total: number; items: JoinedWorkOrder[] }>([
      ...stages,
      { $sort: sortStage(pagination.sort) },
      {
        $group: {
          _id: '$status',
          total: { $sum: 1 },
          // `$push` then `$slice` rather than `$topN`: the sort is already
          // applied above, so the array arrives ordered and the slice keeps the
          // first N of the order the caller asked for.
          items: { $push: '$$ROOT' },
        },
      },
      { $project: { total: 1, items: { $slice: ['$items', limitPerColumn] } } },
    ]).exec(),
    loadHierarchy(),
  ]);

  const byStatus = new Map(rows.map((row) => [row._id, row]));

  // Every status gets a column, including the empty ones: a board that hides
  // "On Hold" because nothing is on hold has nowhere to drop a card onto.
  const columns = WORK_ORDER_STATUSES.map((status) => {
    const row = byStatus.get(status);
    return {
      status,
      total: row?.total ?? 0,
      items: present(row?.items ?? [], hierarchy),
    };
  });

  return {
    columns,
    total: columns.reduce((sum, column) => sum + column.total, 0),
    limitPerColumn,
  };
}

export async function getWorkOrder(scope: VisibleScope, id: string): Promise<WorkOrderDoc> {
  const [workOrder, hierarchy] = await Promise.all([
    WorkOrder.findById(id).lean<WorkOrderDoc>(),
    loadHierarchy(),
  ]);
  if (!workOrder) throw ApiError.notFound('Work order');

  const asset = await Asset.findById(workOrder.assetId).select('location').lean<{ location?: { id?: string; name?: string } }>();
  // A work order is visible exactly when its asset is. 404 rather than 403 —
  // see `assertLocationVisible` for why.
  assertLocationVisible(scope, asset?.location?.id, 'Work order');
  return { ...workOrder, placement: placementFor(hierarchy, asset?.location) } as WorkOrderDoc;
}

/**
 * The filter bar's options, counted from the records that exist.
 *
 * Facilities and technicians are derived rather than listed from a constant:
 * offering a facility nobody has an asset in produces a filter that can only
 * ever return nothing, and the surest way to make people distrust a filter bar
 * is to let them pick something that yields an empty screen.
 *
 * Counts are unfiltered by the caller's *own* filters on purpose — they answer
 * "how many are there altogether", so the options do not vanish as soon as one
 * of them is picked. They are still bounded by the estate: a facet listing
 * every facility and its work-order volume is a map of the organisation, and
 * handing that to somebody who can open one site is the same disclosure the
 * list endpoint was fixed for.
 */
export async function getWorkOrderFacets(scope: VisibleScope): Promise<WorkOrderFacets> {
  const [rows, hierarchy, roster, users] = await Promise.all([
    WorkOrder.aggregate<{
      byFacility: { _id: string | null; count: number }[];
      byTechnician: { _id: string; count: number }[];
      bySource: { _id: WorkOrderSource | null; count: number }[];
      byType: { _id: WorkOrderType; count: number }[];
      byStatus: { _id: WorkOrderStatus; count: number }[];
      byPriority: { _id: WorkOrderPriority; count: number }[];
    }>([
      { $lookup: { from: ASSET_COLLECTION, localField: 'assetId', foreignField: '_id', as: '__asset' } },
      { $unwind: { path: '$__asset', preserveNullAndEmptyArrays: true } },
      ...(scope.coversAll
        ? []
        : [{ $match: { '__asset.location.id': { $in: [...scope.ids] } } } as PipelineStage]),
      {
        $facet: {
          byFacility: [{ $group: { _id: '$__asset.location.id', count: { $sum: 1 } } }],
          byTechnician: [{ $match: { assignedTo: { $ne: UNASSIGNED } } }, { $group: { _id: '$assignedTo', count: { $sum: 1 } } }],
          bySource: [{ $group: { _id: '$source', count: { $sum: 1 } } }],
          byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          byPriority: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
        },
      },
    ]).exec(),
    loadHierarchy(),
    Technician.find({ active: true }).select('name').sort({ name: 1 }).lean<{ name: string }[]>(),
    User.find({ status: 'active' }).select('name').sort({ name: 1 }).lean<{ name: string }[]>(),
  ]);

  const facet = rows[0];

  // Location ids roll up: a work order on a rack counts against the warehouse.
  const facilityCounts = new Map<string, { name: string; count: number }>();
  for (const row of facet?.byFacility ?? []) {
    const facility = row._id ? nearestAncestor(hierarchy.byId, row._id, 'facility') : null;
    if (!facility) continue;
    const existing = facilityCounts.get(facility._id);
    if (existing) existing.count += row.count;
    else facilityCounts.set(facility._id, { name: facility.name, count: row.count });
  }

  /*
   * Who can be given a job.
   *
   * The field roster first, then application users, then any name already on an
   * order that is on neither list. Including users is not a convenience: with
   * an empty roster — which is every deployment before Mobile Workforce is
   * onboarded — a roster-only rule means no work order can ever be assigned to
   * anybody, and the queue Scheduling & Dispatch exists to clear can never be
   * cleared. Both lists are real records, so nothing here is invented.
   *
   * `historic` names are listed but not assignable; see `assignWorkOrder`.
   */
  const technicianCounts = new Map<string, number>(
    (facet?.byTechnician ?? []).map((row) => [row._id, row.count]),
  );

  const seen = new Set<string>();
  const technicians: WorkOrderFacets['technicians'] = [];
  const push = (name: string, kind: 'technician' | 'user' | 'historic') => {
    if (!name || name === UNASSIGNED || seen.has(name)) return;
    seen.add(name);
    technicians.push({ name, count: technicianCounts.get(name) ?? 0, kind });
  };

  for (const tech of roster) push(tech.name, 'technician');
  for (const user of users) push(user.name, 'user');
  for (const name of technicianCounts.keys()) push(name, 'historic');

  technicians.sort((a, b) => a.name.localeCompare(b.name));

  const sourceCounts = new Map<string, number>();
  for (const row of facet?.bySource ?? []) {
    // A missing `source` is a hand-raised order from before the field existed.
    sourceCounts.set(row._id ?? 'Manual', (sourceCounts.get(row._id ?? 'Manual') ?? 0) + row.count);
  }

  const typeCounts = new Map((facet?.byType ?? []).map((r) => [r._id, r.count]));
  const statusCounts = new Map((facet?.byStatus ?? []).map((r) => [r._id, r.count]));
  const priorityCounts = new Map((facet?.byPriority ?? []).map((r) => [r._id, r.count]));

  return {
    facilities: [...facilityCounts.entries()]
      .map(([id, value]) => ({ id, name: value.name, count: value.count }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    technicians,
    // Parked sources appear only when records still carry them, flagged
    // `active: false` so the UI can offer them as a legacy filter without
    // offering them as something new work can be created as.
    sources: WORK_ORDER_SOURCES.filter(
      (source) => isActiveWorkOrderSource(source) || (sourceCounts.get(source) ?? 0) > 0,
    ).map((source) => ({
      source,
      label: WORK_ORDER_SOURCE_LABELS[source as keyof typeof WORK_ORDER_SOURCE_LABELS] ?? source,
      count: sourceCounts.get(source) ?? 0,
      active: isActiveWorkOrderSource(source),
    })),
    types: WORK_ORDER_TYPES.filter(
      (type) => (ACTIVE_WORK_ORDER_TYPES as readonly string[]).includes(type) || (typeCounts.get(type) ?? 0) > 0,
    ).map((type) => ({
      type,
      count: typeCounts.get(type) ?? 0,
      active: (ACTIVE_WORK_ORDER_TYPES as readonly string[]).includes(type),
    })),
    statuses: WORK_ORDER_STATUSES.map((status) => ({ status, count: statusCounts.get(status) ?? 0 })),
    priorities: WORK_ORDER_PRIORITIES.map((priority) => ({ priority, count: priorityCounts.get(priority) ?? 0 })),
  };
}

/** Board counters: the numbers on the maintenance page header. */
export async function getWorkOrderStats(scope: VisibleScope, query: Partial<WorkOrderListQuery> = {}) {
  const now = new Date();
  const stages = await matchStages(scope, query);

  const [rows] = await WorkOrder.aggregate<{
    byStatus: { _id: WorkOrderStatus; count: number }[];
    byPriority: { _id: WorkOrderPriority; count: number }[];
    bySource: { _id: WorkOrderSource | null; count: number }[];
    overdue: { count: number }[];
    unassigned: { count: number }[];
    openHours: { estimated: number }[];
  }>([
    ...stages,
    {
      $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        byPriority: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
        bySource: [{ $group: { _id: '$source', count: { $sum: 1 } } }],
        overdue: [{ $match: { dueDate: { $lt: now }, status: { $in: OPEN_WO_STATUSES } } }, { $count: 'count' }],
        unassigned: [
          { $match: { assignedTo: UNASSIGNED, status: { $in: OPEN_WO_STATUSES } } },
          { $count: 'count' },
        ],
        openHours: [
          { $match: { status: { $in: OPEN_WO_STATUSES } } },
          { $group: { _id: null, estimated: { $sum: '$estimatedHours' } } },
        ],
      },
    },
  ]).exec();

  const byStatus = rows?.byStatus ?? [];
  const open = byStatus
    .filter((s) => OPEN_WO_STATUSES.includes(s._id))
    .reduce((sum, s) => sum + s.count, 0);

  return {
    open,
    overdue: rows?.overdue[0]?.count ?? 0,
    unassigned: rows?.unassigned[0]?.count ?? 0,
    completed: byStatus.find((s) => s._id === 'Completed')?.count ?? 0,
    estimatedHoursOpen: Math.round(rows?.openHours[0]?.estimated ?? 0),
    byStatus: byStatus.map((s) => ({ status: s._id, count: s.count })),
    byPriority: (rows?.byPriority ?? []).map((p) => ({ priority: p._id, count: p.count })),
    bySource: (rows?.bySource ?? []).map((s) => ({ source: s._id ?? 'Manual', count: s.count })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

/** `''`, `'unassigned'` and absent all mean the same thing to a `<select>`. */
function normalizeAssignee(value: string | undefined | null): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'unassigned') return UNASSIGNED;
  return trimmed;
}

export async function createWorkOrder(
  scope: VisibleScope,
  input: CreateWorkOrderInput,
  actor: string,
): Promise<WorkOrderDoc> {
  // The asset must exist: a work order against a non-existent asset is a
  // dangling record nobody will ever action.
  const asset = await Asset.findById(input.assetId).lean();
  if (!asset) throw ApiError.badRequest(`Asset ${input.assetId} does not exist`);

  const assignedTo = normalizeAssignee(input.assignedTo);
  const scheduledDate = input.scheduledDate ? new Date(input.scheduledDate) : undefined;
  const dueDate = new Date(input.dueDate);

  // A job planned to start after it is due is a data-entry mistake, not a plan.
  if (scheduledDate && scheduledDate.getTime() > dueDate.getTime()) {
    throw ApiError.badRequest('The scheduled start cannot be after the due date.');
  }

  const id = await nextId('workOrder', 'WO');

  // The created document is not read back here: `getWorkOrder(id)` below
  // returns it with its placement resolved, and every other write path in this
  // file answers in that same shape.
  await WorkOrder.create({
    ...input,
    _id: id,
    assetName: asset.name,
    assignedTo,
    scheduledDate,
    dueDate,
    // Never set by any path any more — predictive raising is parked.
    aiGenerated: false,
    // The trail starts at creation, not at the first change: otherwise the
    // status an order was opened in has to be inferred from a gap.
    history: [{ from: null, to: input.status, at: new Date(), actor, note: 'Work order created' }],
  });

  await Activity.create({
    assetId: input.assetId,
    type: 'Maintenance',
    description: `Work order ${id} raised: ${input.title}`,
    actor,
    timestamp: new Date(),
  });

  // §6 Stage Automation: "Maintenance Ticket Created → Maintenance". Only
  // pulls an in-service asset out — one raised while the asset is still
  // being received/commissioned doesn't jump the queue ahead of onboarding.
  if (asset.lifecycleStage === 'Assigned / In Service') {
    await applyLifecycleTransition(input.assetId, 'Maintenance', {
      actor,
      reason: `Work order ${id} raised: ${input.title}`,
      automated: true,
    });
  }

  markEstateChanged('work-order-create');
  return getWorkOrder(scope, id);
}

export async function updateWorkOrder(
  scope: VisibleScope,
  id: string,
  input: UpdateWorkOrderInput,
  actor: string,
): Promise<WorkOrderDoc> {
  // Refuses a record outside the estate before any write happens.
  await getWorkOrder(scope, id);

  const workOrder = await WorkOrder.findById(id);
  if (!workOrder) throw ApiError.notFound('Work order');

  // A status change carries a history entry and a transition check, so it is
  // routed through the action that owns those rather than being written here as
  // a field. Sending it to PATCH is a caller mistake worth naming.
  if (input.status && input.status !== workOrder.status) {
    throw ApiError.badRequest('Use POST /work-orders/:id/status to change status — it is an audited transition.');
  }

  const { status: _ignored, scheduledDate, assignedTo, dueDate, ...rest } = input;
  Object.assign(workOrder, rest);

  if (assignedTo !== undefined) workOrder.assignedTo = normalizeAssignee(assignedTo);
  if (dueDate !== undefined) workOrder.dueDate = new Date(dueDate);
  // Explicit `null` clears the date; `undefined` leaves it alone. That
  // distinction is the whole reason the field is nullable in the validator.
  if (scheduledDate !== undefined) workOrder.scheduledDate = scheduledDate ? new Date(scheduledDate) : undefined;

  if (workOrder.scheduledDate && workOrder.scheduledDate.getTime() > workOrder.dueDate.getTime()) {
    throw ApiError.badRequest('The scheduled start cannot be after the due date.');
  }

  await workOrder.save();
  await Activity.create({
    assetId: workOrder.assetId,
    type: 'Maintenance',
    description: `Work order ${id} updated`,
    actor,
    timestamp: new Date(),
  });

  return getWorkOrder(scope, id);
}

/**
 * Move a work order through its lifecycle.
 *
 * The transition is checked against `WORK_ORDER_TRANSITIONS` — defined in
 * `shared/` so the board offers exactly the moves this function will accept,
 * rather than keeping a second copy that drifts the first time a state changes.
 */
export async function changeWorkOrderStatus(
  scope: VisibleScope,
  id: string,
  status: WorkOrderStatus,
  actor: string,
  note?: string,
): Promise<WorkOrderDoc> {
  const workOrder = await WorkOrder.findById(id);
  if (!workOrder) throw ApiError.notFound('Work order');

  if (workOrder.status === status) return getWorkOrder(scope, id);

  const allowed = WORK_ORDER_TRANSITIONS[workOrder.status];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(
      `Cannot move a work order from "${workOrder.status}" to "${status}"` +
        (allowed.length ? `. Allowed: ${allowed.join(', ')}` : '. This work order is closed.'),
    );
  }

  const previous = workOrder.status;
  workOrder.status = status;
  workOrder.history.push({ from: previous, to: status, at: new Date(), actor, note });
  if (note) workOrder.comments.push({ author: actor, text: note, at: new Date() });
  if (status === 'Completed') workOrder.completedAt = new Date();

  // Picking the job up implies taking it: a technician moving a card to In
  // Progress while it still reads "Unassigned" leaves the queue lying about who
  // has it, and nobody goes back to fix that field afterwards.
  if (status === 'In Progress' && workOrder.assignedTo === UNASSIGNED) workOrder.assignedTo = actor;

  await workOrder.save();

  await Activity.create({
    assetId: workOrder.assetId,
    type: 'Maintenance',
    description: `Work order ${id} moved from ${previous} to ${status}`,
    actor,
    timestamp: new Date(),
  });

  // §6 Stage Automation: "Maintenance Completed → In Service" — once this was
  // the *last* open order against the asset. Closing one of three concurrent
  // orders should not send the asset back into service still mid-repair.
  if (status === 'Completed') {
    const asset = await Asset.findById(workOrder.assetId).lean();
    if (asset?.lifecycleStage === 'Maintenance') {
      const stillOpen = await WorkOrder.countDocuments({
        assetId: workOrder.assetId,
        status: { $in: OPEN_WO_STATUSES },
      });
      if (stillOpen === 0) {
        await applyLifecycleTransition(workOrder.assetId, 'Assigned / In Service', {
          actor,
          reason: `Work order ${id} completed`,
          automated: true,
        });
      }
    }
  }

  // Closing a corrective order changes the asset's health, and closing a PM
  // clears an overdue finding.
  markEstateChanged('work-order-status');

  return getWorkOrder(scope, id);
}

/**
 * Assign, reassign or release a work order.
 *
 * Its own action rather than a PATCH field because it has a rule PATCH does
 * not: a named assignee must be on the roster. Free text here is how a queue
 * ends up holding "Raj", "raj" and "R. Kumar" as three different technicians
 * that no filter can reconcile.
 */
export async function assignWorkOrder(
  scope: VisibleScope,
  id: string,
  assignedTo: string,
  actor: string,
  note?: string,
): Promise<WorkOrderDoc> {
  const workOrder = await WorkOrder.findById(id);
  if (!workOrder) throw ApiError.notFound('Work order');

  const next = normalizeAssignee(assignedTo);

  if (next !== UNASSIGNED) {
    // Either list will do — see `getWorkOrderFacets` for why users count. What
    // is refused is a name on neither: free text here is how a queue ends up
    // holding "Raj", "raj" and "R. Kumar" as three technicians no filter can
    // reconcile.
    const [technician, user] = await Promise.all([
      Technician.findOne({ name: next, active: true }).select('_id').lean(),
      User.findOne({ name: next, status: 'active' }).select('_id').lean(),
    ]);

    if (!technician && !user) {
      throw ApiError.badRequest(
        `"${next}" is not an active technician or user. Pick someone from the assignee list, or clear the assignment.`,
      );
    }
  }

  if (workOrder.assignedTo === next) return getWorkOrder(scope, id);

  const previousAssignee = workOrder.assignedTo;
  workOrder.assignedTo = next;

  // Assigning a brand-new order advances it: leaving it in New with a
  // technician's name on it is a state the board cannot represent honestly.
  if (next !== UNASSIGNED && workOrder.status === 'New') {
    workOrder.status = 'Assigned';
    workOrder.history.push({
      from: 'New',
      to: 'Assigned',
      at: new Date(),
      actor,
      note: `Assigned to ${next}`,
    });
  }

  if (note) workOrder.comments.push({ author: actor, text: note, at: new Date() });
  await workOrder.save();

  await Activity.create({
    assetId: workOrder.assetId,
    type: 'Maintenance',
    description:
      next === UNASSIGNED
        ? `Work order ${id} returned to the queue from ${previousAssignee}`
        : `Work order ${id} assigned to ${next}`,
    actor,
    timestamp: new Date(),
  });

  return getWorkOrder(scope, id);
}

export async function addComment(scope: VisibleScope, id: string, author: string, text: string): Promise<WorkOrderDoc> {
  await getWorkOrder(scope, id);

  const workOrder = await WorkOrder.findByIdAndUpdate(
    id,
    { $push: { comments: { author, text, at: new Date() } } },
    { new: true },
  ).lean<WorkOrderDoc>();

  if (!workOrder) throw ApiError.notFound('Work order');
  return getWorkOrder(scope, id);
}

export async function logLabor(
  scope: VisibleScope,
  id: string,
  tech: string,
  hours: number,
  note: string,
): Promise<WorkOrderDoc> {
  await getWorkOrder(scope, id);

  const workOrder = await WorkOrder.findByIdAndUpdate(
    id,
    { $push: { laborLog: { tech, hours, note, at: new Date() } } },
    { new: true },
  ).lean<WorkOrderDoc>();

  if (!workOrder) throw ApiError.notFound('Work order');
  return getWorkOrder(scope, id);
}

export async function toggleChecklistItem(
  scope: VisibleScope,
  id: string,
  index: number,
  done: boolean,
): Promise<WorkOrderDoc> {
  await getWorkOrder(scope, id);

  const workOrder = await WorkOrder.findById(id);
  if (!workOrder) throw ApiError.notFound('Work order');

  const item = workOrder.checklist[index];
  if (!item) throw ApiError.notFound(`Checklist item ${index}`);

  item.done = done;
  await workOrder.save();
  return getWorkOrder(scope, id);
}

export async function deleteWorkOrder(scope: VisibleScope, id: string): Promise<void> {
  await getWorkOrder(scope, id);

  const result = await WorkOrder.findByIdAndDelete(id);
  if (!result) throw ApiError.notFound('Work order');
  markEstateChanged('work-order-delete');
}
