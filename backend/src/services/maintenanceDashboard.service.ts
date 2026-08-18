import type { PipelineStage } from 'mongoose';
import {
  ASSET_CATEGORIES,
  MAINTENANCE_KINDS,
  type AssetCategory,
  type FacilityPerformanceRow,
  type MaintenanceActivityEntry,
  type MaintenanceDashboard,
  type MaintenanceDataGap,
  type MaintenanceFilterOptions,
  type MaintenanceItem,
  type MaintenanceKind,
  type MaintenanceKpi,
  type MaintenancePeriod,
  type MaintenanceSource,
  type MaintenanceStatus,
  type MaintenanceTrendPoint,
  type MaintenanceTypeSlice,
  type ScopeLevel,
  type WorkOrderPriority,
} from '@access-genie/shared';
import { Activity, Asset, Inspection, PmSchedule, ScopeNodeModel, WorkOrder, type ScopeNodeDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { descendantIds } from './scopeFilter.service.js';

/**
 * The organisation-wide maintenance read, in one request.
 *
 * There is no maintenance-dashboard collection and there must not be one: every
 * figure below is aggregated live from the three collections the maintenance
 * modules already write — `WorkOrder`, `PmSchedule`, `Inspection` — joined to
 * `Asset` for facility/category/criticality and to `ScopeNode` for the
 * hierarchy. Completing a work order in Automated Work Orders therefore moves
 * this screen on its next read, with nothing to synchronise and nothing that
 * can drift.
 *
 * Two design decisions are worth stating up front, because both are visible in
 * the response.
 *
 * **A maintenance record has no facility of its own.** It has an asset, and the
 * asset has a `location.id` somewhere in the scope tree. Facility performance
 * is therefore the asset's location rolled *up* to its nearest `facility`
 * ancestor. An asset whose location is not in the tree lands in one explicit
 * "Unassigned" row rather than being silently dropped.
 *
 * **Backlog and activity are counted differently.** "How much is open" is a
 * stock and is true as of now; "what was completed" is a flow and is counted
 * over the selected range. Every KPI publishes which it is (`basis`), so the
 * range selector holding a backlog number still is a correct answer rather than
 * a broken filter.
 *
 * Nothing here fabricates. Where the schema cannot answer a figure the screen
 * asks for — inspections and PM schedules carry no priority, for one — the
 * shortfall is reported in `dataGaps` and the number counts only what exists.
 */

const DAY = 86_400_000;

// ─────────────────────────────────────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────────────────────────────────────

export interface MaintenanceDashboardInput {
  period?: MaintenancePeriod;
  from?: Date;
  to?: Date;
  organization?: string;
  facility?: string;
  location?: string;
  kinds?: MaintenanceKind[];
  priorities?: WorkOrderPriority[];
  statuses?: MaintenanceStatus[];
  categories?: AssetCategory[];
  assetId?: string;
  /** Narrow to records already past their due date. */
  overdue?: boolean;
}

/** Statuses that mean "this work is not finished". */
const OPEN_STATUSES: MaintenanceStatus[] = ['Open', 'In Progress', 'On Hold'];

// ─────────────────────────────────────────────────────────────────────────────
// The hierarchy
// ─────────────────────────────────────────────────────────────────────────────

interface Hierarchy {
  rows: ScopeNodeDoc[];
  byId: Map<string, ScopeNodeDoc>;
  /** Any scope node → the facility it belongs to (or itself, when higher up). */
  facilityOf: Map<string, { id: string; name: string; level: ScopeLevel }>;
  /** Any scope node → the organisation above it, when there is one. */
  organizationOf: Map<string, string | null>;
}

function nearestAncestor(byId: Map<string, ScopeNodeDoc>, start: string, level: ScopeLevel): ScopeNodeDoc | null {
  const seen = new Set<string>();
  let node = byId.get(start);
  while (node && !seen.has(node._id)) {
    seen.add(node._id); // a cycle in the adjacency list would otherwise spin forever
    if (node.level === level) return node;
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return null;
}

async function loadHierarchy(): Promise<Hierarchy> {
  const rows = await ScopeNodeModel.find().lean<ScopeNodeDoc[]>();
  const byId = new Map(rows.map((r) => [r._id, r]));

  const facilityOf = new Map<string, { id: string; name: string; level: ScopeLevel }>();
  const organizationOf = new Map<string, string | null>();

  for (const row of rows) {
    // A facility ancestor is the right bucket for a rack on a floor in a
    // building. Above that level there is none, and the node stands for itself
    // — a region with assets hanging directly off it is reported as the region
    // rather than being folded into a facility it does not have.
    const facility = nearestAncestor(byId, row._id, 'facility');
    facilityOf.set(
      row._id,
      facility
        ? { id: facility._id, name: facility.name, level: 'facility' }
        : { id: row._id, name: row.name, level: row.level },
    );
    organizationOf.set(row._id, nearestAncestor(byId, row._id, 'org')?._id ?? null);
  }

  return { rows, byId, facilityOf, organizationOf };
}

/**
 * The scope the request narrowed itself to.
 *
 * The screen offers Organisation ▸ Facility ▸ Warehouse/location as three
 * cascading selectors; they all name nodes of the same tree, so the deepest one
 * supplied is the filter and the other two are context. A parentless node (the
 * group, or a lone organisation) covers everything, so it resolves to no filter
 * rather than to a set that would wrongly exclude assets sitting outside it.
 */
function resolveSelection(
  hierarchy: Hierarchy,
  input: MaintenanceDashboardInput,
): { node: ScopeNodeDoc; ids: Set<string> } | null {
  const requested = input.location ?? input.facility ?? input.organization;
  if (!requested) return null;

  const node = hierarchy.byId.get(requested);
  if (!node) throw ApiError.notFound('Scope');
  if (!node.parentId) return null;

  return { node, ids: descendantIds(hierarchy.rows, node._id) };
}

// ─────────────────────────────────────────────────────────────────────────────
// The window
// ─────────────────────────────────────────────────────────────────────────────

type Granularity = 'day' | 'week' | 'month';

interface Bucket {
  start: Date;
  label: string;
}

interface Window {
  period: MaintenancePeriod;
  from: Date;
  to: Date;
  granularity: Granularity;
  buckets: Bucket[];
  /** Bucket starts plus the exclusive upper edge — what `$bucket` needs. */
  boundaries: Date[];
}

const PERIOD_DAYS: Record<Exclude<MaintenancePeriod, 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '3m': 90,
  '6m': 182,
  '1y': 365,
};

function startOfDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

function startOfWeek(at: Date): Date {
  const day = startOfDay(at);
  // Monday-based: Sunday (0) is the seventh day of the week that began six days ago.
  const shift = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - shift * DAY);
}

function startOfMonth(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function labelFor(start: Date, granularity: Granularity): string {
  const d = start.getUTCDate();
  const m = MONTHS[start.getUTCMonth()];
  if (granularity === 'month') return `${m} ${String(start.getUTCFullYear()).slice(2)}`;
  return `${d} ${m}`;
}

/**
 * Calendar-aligned buckets, built once and used by both sides.
 *
 * The same boundary array is handed to MongoDB's `$bucket`, so the server and
 * the aggregation cannot disagree about where a week starts — which is the
 * failure mode of computing bucket indices arithmetically on one side and with
 * `$dateTrunc` on the other.
 */
function windowFor(period: MaintenancePeriod, from?: Date, to?: Date): Window {
  const now = new Date();

  let start: Date;
  let end: Date;
  let effectivePeriod: MaintenancePeriod = period;

  // `?period=custom` carrying neither date names no range at all, which a
  // hand-typed URL or a half-set picker both produce. That falls back to the
  // default preset so the screen renders; a range that is genuinely wrong —
  // one end missing, or ending before it starts — is still refused, because
  // quietly reinterpreting it would answer a question nobody asked.
  const wantsCustom = period === 'custom' || Boolean(from && to);
  const namesNoRange = period === 'custom' && !from && !to;

  if (wantsCustom && !namesNoRange) {
    if (!from || !to || to.getTime() <= from.getTime()) {
      throw ApiError.badRequest('A custom range needs `from` and `to`, with `to` after `from`.');
    }
    start = from;
    end = to;
    effectivePeriod = 'custom';
  } else {
    const preset = period === 'custom' ? '30d' : period;
    const days = PERIOD_DAYS[preset];
    effectivePeriod = preset;
    end = now;
    start = new Date(now.getTime() - days * DAY);
  }

  const spanDays = (end.getTime() - start.getTime()) / DAY;
  const granularity: Granularity = spanDays <= 31 ? 'day' : spanDays <= 200 ? 'week' : 'month';

  const truncate = granularity === 'day' ? startOfDay : granularity === 'week' ? startOfWeek : startOfMonth;
  const step = (at: Date): Date => {
    if (granularity === 'day') return new Date(at.getTime() + DAY);
    if (granularity === 'week') return new Date(at.getTime() + 7 * DAY);
    return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
  };

  const buckets: Bucket[] = [];
  const boundaries: Date[] = [];
  let cursor = truncate(start);
  // Guarded rather than open-ended: a malformed range must not build a million
  // buckets before anyone notices.
  while (cursor.getTime() <= end.getTime() && buckets.length < 400) {
    buckets.push({ start: cursor, label: labelFor(cursor, granularity) });
    boundaries.push(cursor);
    cursor = step(cursor);
  }
  boundaries.push(cursor); // exclusive upper edge of the final bucket

  return {
    period: effectivePeriod,
    // The first bucket's start is the real lower edge of what the chart shows;
    // reporting the requested `start` instead would caption the chart wrongly.
    from: buckets[0]?.start ?? truncate(start),
    to: end,
    granularity,
    buckets,
    boundaries,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Source specifications
// ─────────────────────────────────────────────────────────────────────────────

type MongoExpr = Record<string, unknown> | string | number | boolean | null;

interface SourceSpec {
  source: MaintenanceSource;
  model: typeof WorkOrder | typeof PmSchedule | typeof Inspection;
  /** The kinds this collection can ever produce — used to skip it wholesale. */
  kinds: MaintenanceKind[];
  /** The unified statuses this collection can ever produce. */
  statuses: MaintenanceStatus[];
  /** False when the collection has no priority field at all. */
  hasPriority: boolean;
  /**
   * Whether a row from this collection is outstanding *work*.
   *
   * A PM schedule is a standing rule, not a task: counting every schedule as an
   * open job would report an estate with a tidy preventive programme as one
   * drowning in backlog. It still counts as overdue once its next occurrence
   * has passed, because that is real outstanding maintenance.
   */
  countsAsWork: boolean;
  titleField: string;
  dueField: string;
  /** Expression yielding the moment this record was carried out, or null. */
  completedExpr: MongoExpr;
  kindExpr: MongoExpr;
  statusExpr: MongoExpr;
  priorityExpr: MongoExpr;
  assignedExpr: MongoExpr;
  hrefPrefix: string;
}

const SOURCES: SourceSpec[] = [
  {
    source: 'work-order',
    model: WorkOrder,
    kinds: [...MAINTENANCE_KINDS],
    statuses: ['Open', 'In Progress', 'On Hold', 'Completed', 'Cancelled'],
    hasPriority: true,
    countsAsWork: true,
    titleField: '$title',
    dueField: '$dueDate',
    completedExpr: '$completedAt',
    // Work-order `type` is already the unified taxonomy — the other two
    // collections were mapped onto it, not the other way round.
    kindExpr: '$type',
    statusExpr: {
      $switch: {
        branches: [
          { case: { $in: ['$status', ['New', 'Assigned']] }, then: 'Open' },
          { case: { $eq: ['$status', 'In Progress'] }, then: 'In Progress' },
          { case: { $eq: ['$status', 'On Hold'] }, then: 'On Hold' },
          { case: { $eq: ['$status', 'Completed'] }, then: 'Completed' },
        ],
        default: 'Cancelled',
      },
    },
    priorityExpr: '$priority',
    assignedExpr: '$assignedTo',
    hrefPrefix: '/maintenance/',
  },
  {
    source: 'pm-schedule',
    model: PmSchedule,
    kinds: ['Preventive'],
    statuses: ['Open'],
    hasPriority: false,
    countsAsWork: false,
    titleField: '$title',
    dueField: '$nextDue',
    /*
     * A PM schedule contributes no completions, and `lastDone` is why.
     *
     * The field reads like "when this was last carried out" and is not: it is
     * stamped `new Date()` the moment the schedule is created (pm.service.ts,
     * on a schedule that has explicitly never been run), and the automation
     * that advances the schedule writes `lastDone: pm.lastDone ?? now` — which,
     * since the field is `required`, preserves the creation stamp forever.
     *
     * Counting it would have reported a completed preventive occurrence for
     * every schedule anyone created today, on an estate where none had been
     * carried out. Completed preventive work is counted from the work orders
     * the schedule raises (`type: 'Preventive'`), which is a real record with a
     * real `completedAt`. Reported in `dataGaps`.
     */
    completedExpr: null,
    kindExpr: 'Preventive',
    statusExpr: 'Open',
    priorityExpr: null,
    assignedExpr: '$assignedTeam',
    hrefPrefix: '/pm/',
  },
  {
    source: 'inspection',
    model: Inspection,
    kinds: ['Inspection'],
    statuses: ['Open', 'In Progress', 'Completed', 'Failed'],
    hasPriority: false,
    countsAsWork: true,
    titleField: '$title',
    dueField: '$dueDate',
    // There is no `completedAt` on an inspection; `updatedAt` at the moment it
    // reached Passed is the closest real timestamp. Reported in `dataGaps`.
    completedExpr: { $cond: [{ $eq: ['$status', 'Passed'] }, '$updatedAt', null] },
    kindExpr: 'Inspection',
    statusExpr: {
      $switch: {
        branches: [
          { case: { $eq: ['$status', 'Scheduled'] }, then: 'Open' },
          { case: { $eq: ['$status', 'In Progress'] }, then: 'In Progress' },
          { case: { $eq: ['$status', 'Passed'] }, then: 'Completed' },
        ],
        default: 'Failed',
      },
    },
    priorityExpr: null,
    assignedExpr: '$inspector',
    hrefPrefix: '/inspections/',
  },
];

/**
 * Whether this collection can contribute anything under the active filters.
 *
 * Skipping a whole source is the only optimisation here that changes the query
 * plan, and it is also the honest reading of the filter: asking for
 * `priority=Critical` cannot match an inspection, because inspections have no
 * priority — so the inspection collection is not queried rather than being
 * queried and returning nothing.
 */
function sourceIncluded(spec: SourceSpec, input: MaintenanceDashboardInput): boolean {
  if (input.kinds?.length && !spec.kinds.some((k) => input.kinds?.includes(k))) return false;
  if (input.statuses?.length && !spec.statuses.some((s) => input.statuses?.includes(s))) return false;
  if (input.priorities?.length && !spec.hasPriority) return false;
  return true;
}

const ASSET_COLLECTION = Asset.collection.name;

interface PipelineContext {
  input: MaintenanceDashboardInput;
  selection: { node: ScopeNodeDoc; ids: Set<string> } | null;
  now: Date;
}

/**
 * The stages every pipeline shares: join the asset, apply the filters, then
 * derive the unified fields the rest of the query groups and sorts by.
 */
function baseStages(spec: SourceSpec, ctx: PipelineContext): PipelineStage[] {
  const { input, selection, now } = ctx;
  const stages: PipelineStage[] = [];

  // Native pre-filters first, so the asset join runs over fewer documents.
  const native: Record<string, unknown> = {};
  if (input.assetId) native.assetId = input.assetId;
  if (spec.hasPriority && input.priorities?.length) native.priority = { $in: input.priorities };
  if (spec.source === 'work-order' && input.kinds?.length) native.type = { $in: input.kinds };
  if (Object.keys(native).length > 0) stages.push({ $match: native });

  stages.push(
    { $lookup: { from: ASSET_COLLECTION, localField: 'assetId', foreignField: '_id', as: '__asset' } },
    // Kept rather than dropped: a work order whose asset was deleted is still
    // outstanding work, and hiding it would make the backlog read low.
    { $unwind: { path: '$__asset', preserveNullAndEmptyArrays: true } },
  );

  const assetMatch: Record<string, unknown> = {};
  if (selection) assetMatch['__asset.location.id'] = { $in: [...selection.ids] };
  if (input.categories?.length) assetMatch['__asset.category'] = { $in: input.categories };
  if (Object.keys(assetMatch).length > 0) stages.push({ $match: assetMatch });

  const due = spec.dueField;

  stages.push({
    $addFields: {
      __kind: spec.kindExpr,
      __status: spec.statusExpr,
      __priority: spec.priorityExpr,
      __due: due,
      __completed: spec.completedExpr,
      __assigned: spec.assignedExpr,
      __locationId: { $ifNull: ['$__asset.location.id', null] },
      __category: { $ifNull: ['$__asset.category', null] },
      __resolvedAssetName: { $ifNull: ['$__asset.name', '$assetName'] },
    },
  });

  // `null < <a date>` is true in BSON's ordering, so an unset due date would
  // read as overdue without this guard. Every schema marks the field required,
  // which makes the guard cheap insurance rather than dead code.
  const pastDue = { $and: [{ $ne: [due, null] }, { $lt: [due, now] }] };
  const openWork = spec.countsAsWork ? { $in: ['$__status', OPEN_STATUSES] } : false;

  stages.push({
    $addFields: {
      __openWork: openWork,
      __overdue: spec.countsAsWork ? { $and: [openWork, pastDue] } : pastDue,
    },
  });

  // Status and overdue are both derived, so their filters can only be applied
  // once the fields above exist.
  if (input.statuses?.length) stages.push({ $match: { __status: { $in: input.statuses } } });
  if (input.overdue) stages.push({ $match: { __overdue: true } });

  return stages;
}

// ─────────────────────────────────────────────────────────────────────────────
// The grouped fact table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row per distinct combination of the dimensions the screen slices by.
 *
 * Bounded by construction: locations × 4 kinds × 4 priorities × 6 statuses ×
 * 2 overdue flags, which is dozens of rows for a real estate and a few thousand
 * in the worst case — so the KPIs, the facility table and the type breakdown
 * are all computed from one exact aggregation rather than from a capped sample
 * or from a dozen racing `countDocuments` calls that could disagree.
 */
interface FactRow {
  _id: {
    locationId: string | null;
    kind: MaintenanceKind;
    priority: WorkOrderPriority | null;
    status: MaintenanceStatus;
    overdue: boolean;
  };
  source: MaintenanceSource;
  count: number;
  completedInRange: number;
}

interface BucketRow {
  _id: Date | null;
  count: number;
}

interface PreventiveRow {
  dueByRangeEnd: number;
  overdue: number;
}

/**
 * Everything countable, in one pass per collection.
 *
 * The fact table, the three trend series and the preventive horizon all start
 * from the same filtered, asset-joined document set, so they are branches of a
 * single `$facet` rather than five pipelines that would each redo the `$lookup`
 * — and, on a deployment whose pool is one connection (see
 * `MONGODB_MAX_POOL_SIZE`), would each pay their own round trip to the cluster
 * one after another. Three requests instead of ten is most of this endpoint's
 * response time.
 *
 * Every branch's output is bounded: the group by dimensions, the buckets by the
 * window, the preventive branch to a single row — so none of them can approach
 * the 16MB limit a `$facet` result is subject to.
 */
async function loadSourceAggregates(
  ctx: PipelineContext,
  window: Window,
): Promise<{ facts: FactRow[]; trend: MaintenanceTrendPoint[]; preventive: PreventiveRow }> {
  const specs = SOURCES.filter((s) => sourceIncluded(s, ctx.input));

  const raised = new Array<number>(window.buckets.length).fill(0);
  const completed = new Array<number>(window.buckets.length).fill(0);
  const due = new Array<number>(window.buckets.length).fill(0);
  const indexOfBucket = new Map(window.buckets.map((b, i) => [b.start.getTime(), i]));

  const bucketStage = (field: string): PipelineStage.Bucket => ({
    $bucket: {
      groupBy: field,
      boundaries: window.boundaries,
      // Anything outside the window — including a null timestamp — lands here
      // and is discarded, rather than being folded into the first bucket.
      default: null,
      output: { count: { $sum: 1 } },
    },
  });

  // Preventive Due is the one figure the range's upper edge moves directly:
  // "what falls due between now and the end of the window I am looking at".
  const pmHorizon = new Date(Math.max(window.to.getTime(), ctx.now.getTime()));

  const results = await Promise.all(
    specs.map(async (spec) => {
      const [facet] = await spec.model
        .aggregate<{
          facts: Omit<FactRow, 'source'>[];
          raised: BucketRow[];
          completed: BucketRow[];
          due: BucketRow[];
          preventive?: PreventiveRow[];
        }>([
          ...baseStages(spec, ctx),
          {
            $facet: {
              facts: [
                {
                  $group: {
                    _id: {
                      locationId: '$__locationId',
                      kind: '$__kind',
                      priority: '$__priority',
                      status: '$__status',
                      overdue: '$__overdue',
                    },
                    count: { $sum: 1 },
                    completedInRange: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              { $ne: ['$__completed', null] },
                              { $gte: ['$__completed', window.from] },
                              { $lte: ['$__completed', window.to] },
                            ],
                          },
                          1,
                          0,
                        ],
                      },
                    },
                  },
                },
              ],
              raised: [bucketStage('$createdAt')],
              completed: [{ $match: { __completed: { $ne: null } } }, bucketStage('$__completed')],
              due: [bucketStage('$__due')],
              ...(spec.source === 'pm-schedule'
                ? {
                    preventive: [
                      {
                        $group: {
                          _id: null,
                          dueByRangeEnd: { $sum: { $cond: [{ $lte: ['$__due', pmHorizon] }, 1, 0] } },
                          overdue: { $sum: { $cond: ['$__overdue', 1, 0] } },
                        },
                      },
                    ],
                  }
                : {}),
            },
          },
        ])
        .exec();

      return { spec, facet };
    }),
  );

  const facts: FactRow[] = [];
  let preventive: PreventiveRow = { dueByRangeEnd: 0, overdue: 0 };

  const fold = (rows: BucketRow[], target: number[]) => {
    for (const row of rows) {
      if (!(row._id instanceof Date)) continue;
      const index = indexOfBucket.get(row._id.getTime());
      if (index !== undefined) target[index] = (target[index] ?? 0) + row.count;
    }
  };

  for (const { spec, facet } of results) {
    if (!facet) continue;
    for (const row of facet.facts) facts.push({ ...row, source: spec.source });
    fold(facet.raised, raised);
    fold(facet.completed, completed);
    fold(facet.due, due);
    if (facet.preventive?.[0]) preventive = facet.preventive[0];
  }

  return {
    facts,
    preventive,
    trend: window.buckets.map((bucket, i) => ({
      start: bucket.start.toISOString(),
      label: bucket.label,
      raised: raised[i] ?? 0,
      completed: completed[i] ?? 0,
      due: due[i] ?? 0,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Item lists
// ─────────────────────────────────────────────────────────────────────────────

interface RawItem {
  _id: string;
  title: string;
  assetId: string;
  assetName: string;
  locationId: string | null;
  kind: MaintenanceKind;
  priority: WorkOrderPriority | null;
  status: MaintenanceStatus;
  nativeStatus: string;
  due: Date | null;
  completed: Date | null;
  overdue: boolean;
  assigned: string;
  createdAt: Date;
  updatedAt: Date;
}

type ItemEntry = { raw: RawItem; source: MaintenanceSource; spec: SourceSpec };

const ITEM_PROJECTION: PipelineStage.Project = {
  $project: {
    _id: 1,
    title: '$title',
    assetId: 1,
    assetName: '$__resolvedAssetName',
    locationId: '$__locationId',
    kind: '$__kind',
    priority: '$__priority',
    status: '$__status',
    nativeStatus: '$status',
    due: '$__due',
    completed: '$__completed',
    overdue: '$__overdue',
    assigned: '$__assigned',
    // Carried on every row so the activity feed can be built from the same
    // read: `createdAt === updatedAt` is what distinguishes a record that was
    // just raised from one that was changed.
    createdAt: 1,
    updatedAt: 1,
  },
};

/** How many rows each list shows, and how many each source contributes to it. */
const ITEM_LIMIT = 12;

/**
 * The three lists, in one pass per collection.
 *
 * MongoDB cannot sort across three collections, so each contributes its own
 * best `ITEM_LIMIT` rows and the merge below picks the true top N from the
 * union. Taking `ITEM_LIMIT` from each is what makes that correct: the Nth-best
 * row overall can only ever come from one collection's first N.
 */
async function loadSourceItems(
  ctx: PipelineContext,
): Promise<{ critical: ItemEntry[]; upcoming: ItemEntry[]; recent: ItemEntry[] }> {
  const specs = SOURCES.filter((s) => sourceIncluded(s, ctx.input));

  const results = await Promise.all(
    specs.map(async (spec) => {
      const [facet] = await spec.model
        .aggregate<{ critical: RawItem[]; upcoming: RawItem[]; recent: RawItem[] }>([
          ...baseStages(spec, ctx),
          {
            $facet: {
              // Open work that is either Critical priority or already past due.
              // A PM schedule qualifies on the overdue half only — a schedule
              // that is not yet due is not an attention item.
              critical: [
                {
                  $match: spec.countsAsWork
                    ? { $and: [{ __openWork: true }, { $or: [{ __priority: 'Critical' }, { __overdue: true }] }] }
                    : { __overdue: true },
                },
                { $sort: { __due: 1 } },
                { $limit: ITEM_LIMIT },
                ITEM_PROJECTION,
              ],
              // Still ahead of its due date, soonest first.
              upcoming: [
                { $match: { __due: { $gte: ctx.now }, ...(spec.countsAsWork ? { __openWork: true } : {}) } },
                { $sort: { __due: 1 } },
                { $limit: ITEM_LIMIT },
                ITEM_PROJECTION,
              ],
              recent: [{ $sort: { updatedAt: -1 } }, { $limit: ITEM_LIMIT }, ITEM_PROJECTION],
            },
          },
        ])
        .exec();

      const wrap = (rows: RawItem[] | undefined): ItemEntry[] =>
        (rows ?? []).map((raw) => ({ raw, source: spec.source, spec }));

      return {
        critical: wrap(facet?.critical),
        upcoming: wrap(facet?.upcoming),
        recent: wrap(facet?.recent),
      };
    }),
  );

  return {
    critical: results.flatMap((r) => r.critical),
    upcoming: results.flatMap((r) => r.upcoming),
    recent: results.flatMap((r) => r.recent),
  };
}

function toItem(
  entry: { raw: RawItem; source: MaintenanceSource; spec: SourceSpec },
  hierarchy: Hierarchy,
  now: Date,
): MaintenanceItem {
  const { raw, source, spec } = entry;
  const facility = raw.locationId ? hierarchy.facilityOf.get(raw.locationId) : undefined;
  const dueMs = raw.due ? new Date(raw.due).getTime() : null;

  return {
    id: raw._id,
    source,
    title: raw.title,
    assetId: raw.assetId,
    assetName: raw.assetName ?? raw.assetId,
    facilityId: facility?.id ?? null,
    facilityName: facility?.name ?? 'Unassigned',
    kind: raw.kind,
    priority: raw.priority ?? null,
    status: raw.status,
    // A PM schedule has no status column of its own; "Scheduled" is what the
    // PM module shows, so the row reads the same on both screens.
    nativeStatus: source === 'pm-schedule' ? 'Scheduled' : (raw.nativeStatus ?? raw.status),
    dueDate: raw.due ? new Date(raw.due).toISOString() : null,
    completedAt: raw.completed ? new Date(raw.completed).toISOString() : null,
    overdue: Boolean(raw.overdue),
    daysOverdue: dueMs === null ? 0 : Math.floor((now.getTime() - dueMs) / DAY),
    assignedTo: raw.assigned || 'Unassigned',
    href: `${spec.hrefPrefix}${raw._id}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent activity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What changed lately, from the records themselves.
 *
 * `updatedAt` is the one signal all three collections maintain, so it is the
 * feed's spine — that is what makes a PM schedule edit and an inspection result
 * show up here, neither of which writes an `Activity` row. Work-order events do
 * write one, and those carry the actor's name; they are matched back by the id
 * in the event text and used to attribute the entry to a person instead of to
 * whoever the record happens to be assigned to.
 */
async function buildRecentActivity(
  entries: ItemEntry[],
  hierarchy: Hierarchy,
  now: Date,
  limit: number,
): Promise<MaintenanceActivityEntry[]> {
  // The most recent maintenance event per record id, for the actor's name.
  const events = await Activity.find({ type: 'Maintenance' })
    .sort({ timestamp: -1 })
    .limit(200)
    .lean<{ assetId: string; description: string; actor: string; timestamp: Date }[]>();

  const actorOf = new Map<string, { actor: string; description: string; at: Date }>();
  for (const event of events) {
    const id = /\b(WO-[A-Za-z0-9_-]+)\b/.exec(event.description)?.[1];
    if (!id || actorOf.has(id)) continue;
    actorOf.set(id, { actor: event.actor, description: event.description, at: event.timestamp });
  }

  const described = entries.map((entry) => {
    const item = toItem(entry, hierarchy, now);
    const at = entry.raw.updatedAt ? new Date(entry.raw.updatedAt) : new Date(0);
    // A record whose two stamps are within a second of each other has not been
    // touched since it was created — the tolerance is there because the two are
    // written by separate clock reads, not because they are approximate.
    const isNew = Boolean(entry.raw.createdAt) && at.getTime() - new Date(entry.raw.createdAt).getTime() < 1000;
    const attribution = actorOf.get(item.id);

    const description =
      attribution?.description ??
      (entry.source === 'pm-schedule'
        ? `PM schedule ${isNew ? 'created' : 'updated'} — ${item.title}`
        : entry.source === 'inspection'
          ? `Inspection ${isNew ? 'scheduled' : entry.raw.nativeStatus.toLowerCase()} — ${item.title}`
          : `Work order ${isNew ? 'raised' : entry.raw.nativeStatus.toLowerCase()} — ${item.title}`);

    return {
      id: `${entry.source}:${item.id}`,
      at: at.toISOString(),
      actor: attribution?.actor ?? item.assignedTo,
      description,
      source: entry.source,
      recordId: item.id,
      assetId: item.assetId,
      assetName: item.assetName,
      facilityName: item.facilityName,
      href: item.href,
    } satisfies MaintenanceActivityEntry;
  });

  return described.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived sections
// ─────────────────────────────────────────────────────────────────────────────

interface Tally {
  open: number;
  overdue: number;
  critical: number;
  inProgress: number;
  completed: number;
}

function emptyTally(): Tally {
  return { open: 0, overdue: 0, critical: 0, inProgress: 0, completed: 0 };
}

/** The counting rules, in one place, so every section agrees on what a number means. */
function accumulate(target: Tally, row: FactRow, countsAsWork: boolean): void {
  const isOpen = countsAsWork && OPEN_STATUSES.includes(row._id.status);
  if (isOpen) target.open += row.count;
  if (row._id.overdue) target.overdue += row.count;
  if (isOpen && row._id.priority === 'Critical') target.critical += row.count;
  if (countsAsWork && row._id.status === 'In Progress') target.inProgress += row.count;
  target.completed += row.completedInRange;
}

function buildFacilityRows(facts: FactRow[], hierarchy: Hierarchy, assetsByLocation: Map<string, number>): FacilityPerformanceRow[] {
  const rows = new Map<string, FacilityPerformanceRow>();

  const ensure = (id: string, name: string, level: ScopeLevel | 'unassigned') => {
    let row = rows.get(id);
    if (!row) {
      row = { facilityId: id, facilityName: name, level, assets: 0, ...emptyTally(), attentionScore: 0 };
      rows.set(id, row);
    }
    return row;
  };

  // Every facility that holds assets gets a row, even with no maintenance on
  // it — "this site has nothing outstanding" is information, and a table that
  // silently omits the healthy sites cannot show it.
  for (const [locationId, count] of assetsByLocation) {
    const facility = hierarchy.facilityOf.get(locationId);
    const row = facility
      ? ensure(facility.id, facility.name, facility.level)
      : ensure('__unassigned', 'Unassigned', 'unassigned');
    row.assets += count;
  }

  for (const fact of facts) {
    const countsAsWork = SOURCES.find((s) => s.source === fact.source)?.countsAsWork ?? true;
    const facility = fact._id.locationId ? hierarchy.facilityOf.get(fact._id.locationId) : undefined;
    const row = facility
      ? ensure(facility.id, facility.name, facility.level)
      : ensure('__unassigned', 'Unassigned', 'unassigned');
    accumulate(row, fact, countsAsWork);
  }

  for (const row of rows.values()) {
    // Overdue and critical are what a Super Admin is scanning for, so they
    // outweigh raw volume; open work still breaks ties between quiet sites.
    row.attentionScore = row.overdue * 3 + row.critical * 5 + row.open;
  }

  return [...rows.values()].sort(
    (a, b) => b.attentionScore - a.attentionScore || b.open - a.open || a.facilityName.localeCompare(b.facilityName),
  );
}

function buildTypeBreakdown(facts: FactRow[]): MaintenanceTypeSlice[] {
  const byKind = new Map<MaintenanceKind, MaintenanceTypeSlice>(
    MAINTENANCE_KINDS.map((kind) => [kind, { kind, total: 0, open: 0, overdue: 0, completed: 0, sources: [] }]),
  );

  for (const fact of facts) {
    const slice = byKind.get(fact._id.kind);
    if (!slice) continue;
    const countsAsWork = SOURCES.find((s) => s.source === fact.source)?.countsAsWork ?? true;

    slice.total += fact.count;
    if (countsAsWork && OPEN_STATUSES.includes(fact._id.status)) slice.open += fact.count;
    if (fact._id.overdue) slice.overdue += fact.count;
    slice.completed += fact.completedInRange;

    const existing = slice.sources.find((s) => s.source === fact.source);
    if (existing) existing.count += fact.count;
    else slice.sources.push({ source: fact.source, count: fact.count });
  }

  // Only categories the data actually supports: a kind with no records at all
  // is dropped rather than drawn as an empty wedge.
  return [...byKind.values()].filter((slice) => slice.total > 0);
}

function buildKpis(facts: FactRow[], preventive: PreventiveRow): MaintenanceKpi[] {
  const bySource = (source: MaintenanceSource) => facts.filter((f) => f.source === source);

  const sum = (rows: FactRow[], predicate: (row: FactRow) => boolean, field: 'count' | 'completedInRange' = 'count') =>
    rows.reduce((total, row) => (predicate(row) ? total + row[field] : total), 0);

  const workSources = SOURCES.filter((s) => s.countsAsWork).map((s) => s.source);
  const workFacts = facts.filter((f) => workSources.includes(f.source));
  const isOpen = (row: FactRow) => OPEN_STATUSES.includes(row._id.status);

  const openWorkOrders = sum(bySource('work-order'), isOpen);
  const openInspections = sum(bySource('inspection'), isOpen);

  const overdueWo = sum(bySource('work-order'), (r) => r._id.overdue);
  const overdueInspections = sum(bySource('inspection'), (r) => r._id.overdue);
  const overduePm = sum(bySource('pm-schedule'), (r) => r._id.overdue);

  const criticalOpen = sum(workFacts, (r) => isOpen(r) && r._id.priority === 'Critical');
  const criticalOverdue = sum(workFacts, (r) => isOpen(r) && r._id.priority === 'Critical' && r._id.overdue);

  const inProgressWo = sum(bySource('work-order'), (r) => r._id.status === 'In Progress');
  const inProgressInspections = sum(bySource('inspection'), (r) => r._id.status === 'In Progress');

  const completedWo = sum(bySource('work-order'), () => true, 'completedInRange');
  const completedInspections = sum(bySource('inspection'), () => true, 'completedInRange');
  const completedPreventiveWo = sum(bySource('work-order'), (r) => r._id.kind === 'Preventive', 'completedInRange');

  const openPreventiveWo = sum(bySource('work-order'), (r) => isOpen(r) && r._id.kind === 'Preventive');
  const failedInspections = sum(bySource('inspection'), (r) => r._id.status === 'Failed');
  const openCorrective = sum(bySource('work-order'), (r) => isOpen(r) && r._id.kind === 'Corrective');

  const byLabel = (label: string, value: number) => ({ label, value });

  return [
    {
      id: 'open',
      label: 'Open Work Orders',
      value: openWorkOrders + openInspections,
      basis: 'now',
      breakdown: [byLabel('Work orders', openWorkOrders), byLabel('Inspections', openInspections)],
    },
    {
      id: 'overdue',
      label: 'Overdue',
      value: overdueWo + overdueInspections + overduePm,
      basis: 'now',
      breakdown: [
        byLabel('Work orders', overdueWo),
        byLabel('Inspections', overdueInspections),
        byLabel('PM schedules', overduePm),
      ],
    },
    {
      id: 'critical',
      label: 'Critical',
      value: criticalOpen,
      basis: 'now',
      breakdown: [byLabel('Open', criticalOpen), byLabel('— overdue', criticalOverdue)],
      note: 'Priority is recorded on work orders only — inspections and PM schedules carry no priority field.',
    },
    {
      id: 'in-progress',
      label: 'In Progress',
      value: inProgressWo + inProgressInspections,
      basis: 'now',
      breakdown: [byLabel('Work orders', inProgressWo), byLabel('Inspections', inProgressInspections)],
    },
    {
      id: 'completed',
      label: 'Completed',
      value: completedWo + completedInspections,
      basis: 'range',
      breakdown: [
        byLabel('Work orders', completedWo),
        byLabel('— preventive', completedPreventiveWo),
        byLabel('Inspections', completedInspections),
      ],
    },
    {
      id: 'preventive-due',
      label: 'Preventive Due',
      value: preventive.dueByRangeEnd,
      basis: 'range',
      breakdown: [
        byLabel('Overdue now', preventive.overdue),
        byLabel('Due in range', Math.max(0, preventive.dueByRangeEnd - preventive.overdue)),
        byLabel('Preventive WOs', openPreventiveWo),
      ],
    },
    {
      id: 'failed-corrective',
      label: 'Failed / Corrective',
      value: failedInspections + openCorrective,
      basis: 'now',
      breakdown: [byLabel('Failed inspections', failedInspections), byLabel('Corrective open', openCorrective)],
      note: 'A work order has no failure outcome — Cancelled is its only non-success terminal state — so "failed" counts failed inspections.',
    },
  ];
}

/**
 * What the current schema cannot answer.
 *
 * Reported rather than papered over. Each entry names the field that is
 * missing, so the fix is a schema change somebody can action rather than a
 * mystery about why a number looks low.
 */
function buildDataGaps(): MaintenanceDataGap[] {
  return [
    {
      metric: 'Critical — inspections and PM schedules',
      missing: '`Inspection` and `PmSchedule` have no `priority` field. Only work orders can be counted as Critical.',
    },
    {
      metric: 'Failed maintenance — work orders',
      missing:
        '`WorkOrder.status` has no failure state (`Cancelled` is not a failure). Failure is read from `Inspection.status = "Failed"`.',
    },
    {
      metric: 'Inspection completion time',
      missing: '`Inspection` has no `completedAt`. The moment it reached `Passed` is taken from `updatedAt`.',
    },
    {
      metric: 'Facility of a maintenance record',
      missing:
        'Work orders, PM schedules and inspections carry no facility. It is derived from `Asset.location.id` rolled up the scope tree; assets outside the tree fall into "Unassigned".',
    },
    {
      metric: 'Preventive occurrences completed',
      missing:
        '`PmSchedule` has no occurrence log. `lastDone` is stamped at creation and `maintenanceAutomation.service` preserves it (`lastDone: pm.lastDone ?? now`) rather than advancing it, so it cannot mark a completion. Completed preventive work is counted from the `Preventive` work orders a schedule raises.',
    },
    {
      metric: 'PM compliance history',
      missing: '`PmSchedule.compliancePct` is a current scalar with no per-occurrence history, so it cannot be trended.',
    },
  ];
}

async function buildFilterOptions(hierarchy: Hierarchy): Promise<MaintenanceFilterOptions> {
  const organizations = hierarchy.rows
    .filter((r) => r.level === 'org')
    .map((r) => ({ id: r._id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const facilities = hierarchy.rows
    .filter((r) => r.level === 'facility' || r.level === 'region')
    .map((r) => ({ id: r._id, name: r.name, organizationId: hierarchy.organizationOf.get(r._id) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const locations = hierarchy.rows
    .filter((r) => r.level === 'building' || r.level === 'floor' || r.level === 'zone')
    .map((r) => ({
      id: r._id,
      name: r.name,
      facilityId: hierarchy.facilityOf.get(r._id)?.id ?? null,
      level: r.level,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Only the categories the estate actually has — an empty option that can
  // never match anything is noise in a filter.
  const present = await Asset.distinct('category');
  const categories = ASSET_CATEGORIES.filter((c) => present.includes(c));

  return { organizations, facilities, locations, categories };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function getMaintenanceDashboard(input: MaintenanceDashboardInput): Promise<MaintenanceDashboard> {
  const now = new Date();
  const window = windowFor(input.period ?? '30d', input.from, input.to);

  const hierarchy = await loadHierarchy();
  const selection = resolveSelection(hierarchy, input);
  const ctx: PipelineContext = { input, selection, now };

  // Assets in scope, per location — the denominator for the facility table and
  // what gives a quiet site a row of its own.
  const assetMatch: Record<string, unknown> = {};
  if (selection) assetMatch['location.id'] = { $in: [...selection.ids] };
  if (input.categories?.length) assetMatch.category = { $in: input.categories };
  if (input.assetId) assetMatch._id = input.assetId;

  const [aggregates, items, assetCounts, options] = await Promise.all([
    loadSourceAggregates(ctx, window),
    loadSourceItems(ctx),
    Asset.aggregate<{ _id: string | null; count: number }>([
      ...(Object.keys(assetMatch).length > 0 ? [{ $match: assetMatch }] : []),
      { $group: { _id: '$location.id', count: { $sum: 1 } } },
    ]).exec(),
    buildFilterOptions(hierarchy),
  ]);

  const { facts, trend, preventive } = aggregates;

  const assetsByLocation = new Map<string, number>();
  let assetTotal = 0;
  for (const row of assetCounts) {
    assetsByLocation.set(row._id ?? '__unassigned', row.count);
    assetTotal += row.count;
  }

  const PRIORITY_RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

  // Most overdue first, then most urgent — the order somebody would work down.
  const criticalAttention = items.critical
    .map((entry) => toItem(entry, hierarchy, now))
    .sort(
      (a, b) =>
        b.daysOverdue - a.daysOverdue ||
        (PRIORITY_RANK[b.priority ?? ''] ?? 0) - (PRIORITY_RANK[a.priority ?? ''] ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, ITEM_LIMIT);

  const upcoming = items.upcoming
    .map((entry) => toItem(entry, hierarchy, now))
    .sort((a, b) => Date.parse(a.dueDate ?? '') - Date.parse(b.dueDate ?? '') || a.id.localeCompare(b.id))
    .slice(0, ITEM_LIMIT);

  const recentActivity = await buildRecentActivity(items.recent, hierarchy, now, ITEM_LIMIT);

  const totals = { workOrders: 0, pmSchedules: 0, inspections: 0, assets: assetTotal };
  for (const fact of facts) {
    if (fact.source === 'work-order') totals.workOrders += fact.count;
    else if (fact.source === 'pm-schedule') totals.pmSchedules += fact.count;
    else totals.inspections += fact.count;
  }

  return {
    generatedAt: now.toISOString(),
    range: {
      period: window.period,
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      granularity: window.granularity,
    },
    totals,
    kpis: buildKpis(facts, preventive),
    trend,
    facilities: buildFacilityRows(facts, hierarchy, assetsByLocation),
    typeBreakdown: buildTypeBreakdown(facts),
    criticalAttention,
    upcoming,
    recentActivity,
    dataGaps: buildDataGaps(),
    options,
  };
}
