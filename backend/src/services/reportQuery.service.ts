import type { Model, PipelineStage } from 'mongoose';
import {
  REPORT_SOURCES,
  reportSource,
  type ReportColumn,
  type ReportDataSource,
  type ReportDefinition,
  type ReportFieldType,
  type ReportFilterClause,
  type ReportResult,
  type ReportRow,
} from '@access-genie/shared';
import { Asset, CustodyRecord, Inspection, Technician, WorkOrder } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { resolveAnalyticsScope, type AnalyticsScope, type ScopeIdentity } from './analyticsScope.service.js';

/**
 * The report engine — one saved question, executed against live collections.
 *
 * A report is a *definition*: a source, some dimensions to group by, some
 * measures to aggregate, some filters and a chart type. Running it builds a
 * Mongo aggregation from that definition and returns the rows. Nothing is
 * precomputed, nothing is cached and no report keeps a copy of the data it
 * reports on — reopening a report a month later re-runs it against that day's
 * estate, which is the entire difference between a report and a screenshot.
 *
 * The catalogue of what may be asked lives in `shared/analytics.ts` and is
 * rendered by the builder. Every key it advertises is mapped below; a key it
 * advertises and this file does not map is a 400 naming the field, not a column
 * that silently comes back empty.
 *
 * ── Why there is a post-pass ─────────────────────────────────────────────────
 *
 * Two things cannot be done inside the aggregation.
 *
 * **Facility rollup.** An asset records the exact node it sits in — a rack on a
 * floor in a building. "By facility" means folding that up the tree, and the
 * tree lives in a different collection whose shape is a parent pointer, not a
 * join key. So the pipeline groups by the raw location id and the rollup
 * happens here, where the tree is already in memory. Two raw keys that resolve
 * to the same facility have their buckets merged.
 *
 * **Averages and rates.** A mean cannot be summed. Every measure therefore
 * accumulates *additive parts* — a sum and a count — and divides at the end,
 * which is also what makes merging two buckets correct rather than approximate.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Measure specs
// ─────────────────────────────────────────────────────────────────────────────

/** Accumulated parts for one bucket. Numbers add; string lists concatenate. */
type Parts = Record<string, number | string[]>;

interface MeasureSpec {
  /**
   * `$group` accumulators, keyed by part name. Every one must be additive
   * (`$sum`) or set-like (`$addToSet`) so two buckets can be merged without
   * re-reading the source.
   */
  accumulate: Record<string, unknown>;
  /** Turn the accumulated parts into the number the column shows. */
  finalize: (parts: Parts) => number;
  type: ReportFieldType;
}

const num = (parts: Parts, key: string): number => {
  const value = parts[key];
  return typeof value === 'number' ? value : 0;
};

const ratio = (parts: Parts, sum: string, count: string, dp = 1): number => {
  const c = num(parts, count);
  if (c === 0) return 0;
  return Math.round((num(parts, sum) / c) * 10 ** dp) / 10 ** dp;
};

const countIf = (condition: unknown) => ({ $sum: { $cond: [condition, 1, 0] } });

/** A plain `$sum` over an expression, exposed as one part. */
const summed = (expr: unknown, type: ReportFieldType = 'number'): MeasureSpec => ({
  accumulate: { v: { $sum: expr } },
  finalize: (p) => Math.round(num(p, 'v') * 100) / 100,
  type,
});

/** A count of documents matching a condition (or all of them). */
const counted = (condition?: unknown): MeasureSpec => ({
  accumulate: { v: condition ? countIf(condition) : { $sum: 1 } },
  finalize: (p) => num(p, 'v'),
  type: 'number',
});

/** A mean, carried as (sum, count) so merged buckets stay exact. */
const averaged = (
  expr: unknown,
  present: unknown,
  type: ReportFieldType = 'number',
  dp = 1,
): MeasureSpec => ({
  accumulate: { s: { $sum: expr }, c: countIf(present) },
  finalize: (p) => ratio(p, 's', 'c', dp),
  type,
});

// ─────────────────────────────────────────────────────────────────────────────
// Dimension specs
// ─────────────────────────────────────────────────────────────────────────────

interface DimensionSpec {
  /** What the pipeline groups by. */
  expr: unknown;
  /**
   * Turn the raw group key into the value shown. Present only where the
   * displayed value is not what Mongo grouped by — the facility rollup, mainly.
   */
  resolve?: (raw: string | null, scope: AnalyticsScope) => string;
  type: ReportFieldType;
}

const plain = (path: string, type: ReportFieldType = 'string'): DimensionSpec => ({ expr: `$${path}`, type });

/** A `YYYY-MM` bucket from a date field. */
const monthOf = (path: string): DimensionSpec => ({
  expr: { $dateToString: { format: '%Y-%m', date: `$${path}` } },
  type: 'string',
});

/** Group by the exact location node, display the facility above it. */
const facilityDim = (path: string): DimensionSpec => ({
  expr: `$${path}`,
  resolve: (raw, scope) => (raw ? (scope.facilityOf.get(raw)?.name ?? 'Unassigned') : 'Unassigned'),
  type: 'string',
});

// ─────────────────────────────────────────────────────────────────────────────
// Source specs
// ─────────────────────────────────────────────────────────────────────────────

interface FilterSpec {
  path: string;
  type: ReportFieldType;
  /** Scope-node valued: the clause expands to the node's whole subtree. */
  scopeNode?: boolean;
}

interface SourceSpec {
  model: Model<never>;
  /** Stages that run before filtering — joins, mostly. */
  prefix: () => PipelineStage[];
  /** Field holding a scope-node id, used to enforce the caller's permitted slice. */
  scopeField: string | null;
  dimensions: Record<string, DimensionSpec>;
  measures: Record<string, MeasureSpec>;
  filters: Record<string, FilterSpec>;
  /**
   * Rows to add after aggregation for groups the source legitimately has none
   * of — a facility holding no assets is a real, useful row of zeroes.
   */
  zeroFill?: (scope: AnalyticsScope) => { raw: string; value: string }[];
}

const YEAR_MS = 365.25 * 86_400_000;

/** The join every asset-referencing source needs. */
const assetJoin = (): PipelineStage[] => [
  { $lookup: { from: Asset.collection.name, localField: 'assetId', foreignField: '_id', as: '__asset' } },
  // Preserved rather than dropped: a record whose asset was deleted is still a
  // record, and hiding it would make the totals disagree with the collection.
  { $unwind: { path: '$__asset', preserveNullAndEmptyArrays: true } },
];

const OPEN_WO = { $not: [{ $in: ['$status', ['Completed', 'Cancelled']] }] };
const ASSET_VALUE = { $ifNull: ['$bookValue', { $ifNull: ['$purchasePrice', 0] }] };

const SOURCES: Record<ReportDataSource, SourceSpec> = {
  assets: {
    model: Asset as unknown as Model<never>,
    prefix: () => [],
    scopeField: 'location.id',
    dimensions: {
      category: plain('category'),
      status: plain('status'),
      lifecycleStage: plain('lifecycleStage'),
      facility: facilityDim('location.id'),
      location: plain('location.name'),
      building: plain('location.building'),
      custodian: plain('custodian'),
      criticality: plain('criticality'),
      healthStatus: plain('healthStatus'),
      manufacturer: plain('manufacturer'),
      purchaseMonth: monthOf('purchaseDate'),
      purchaseYear: { expr: { $dateToString: { format: '%Y', date: '$purchaseDate' } }, type: 'string' },
    },
    measures: {
      count: counted(),
      bookValue: summed(ASSET_VALUE, 'currency'),
      purchaseValue: summed({ $ifNull: ['$purchasePrice', 0] }, 'currency'),
      depreciation: summed(
        { $max: [0, { $subtract: [{ $ifNull: ['$purchasePrice', 0] }, { $ifNull: ['$bookValue', 0] }] }] },
        'currency',
      ),
      avgPurchasePrice: averaged({ $ifNull: ['$purchasePrice', 0] }, { $isNumber: '$purchasePrice' }, 'currency', 0),
      avgHealth: averaged({ $ifNull: ['$healthScore', 0] }, { $isNumber: '$healthScore' }),
      avgUtilization: averaged({ $ifNull: ['$utilization', 0] }, { $isNumber: '$utilization' }, 'percent'),
      avgRisk: averaged({ $ifNull: ['$riskScore', 0] }, { $isNumber: '$riskScore' }),
      avgAgeYears: averaged(
        { $divide: [{ $subtract: ['$$NOW', { $ifNull: ['$purchaseDate', '$$NOW'] }] }, YEAR_MS] },
        { $ne: ['$purchaseDate', null] },
      ),
    },
    filters: {
      category: { path: 'category', type: 'string' },
      status: { path: 'status', type: 'string' },
      lifecycleStage: { path: 'lifecycleStage', type: 'string' },
      facility: { path: 'location.id', type: 'string', scopeNode: true },
      custodian: { path: 'custodian', type: 'string' },
      criticality: { path: 'criticality', type: 'string' },
      healthStatus: { path: 'healthStatus', type: 'string' },
      manufacturer: { path: 'manufacturer', type: 'string' },
      purchaseDate: { path: 'purchaseDate', type: 'date' },
      purchasePrice: { path: 'purchasePrice', type: 'currency' },
      healthScore: { path: 'healthScore', type: 'number' },
    },
  },

  maintenance: {
    model: WorkOrder as unknown as Model<never>,
    prefix: assetJoin,
    scopeField: '__asset.location.id',
    dimensions: {
      status: plain('status'),
      type: plain('type'),
      priority: plain('priority'),
      assignedTo: plain('assignedTo'),
      source: plain('source'),
      assetCategory: plain('__asset.category'),
      facility: facilityDim('__asset.location.id'),
      dueMonth: monthOf('dueDate'),
      completedMonth: monthOf('completedAt'),
    },
    measures: {
      count: counted(),
      openCount: counted(OPEN_WO),
      overdueCount: counted({ $and: [OPEN_WO, { $lt: ['$dueDate', '$$NOW'] }] }),
      completedCount: counted({ $eq: ['$status', 'Completed'] }),
      estimatedHours: summed({ $ifNull: ['$estimatedHours', 0] }),
      // The logged hours live in an array of entries; summing the array inside
      // the accumulator is what makes this the real figure rather than a count
      // of log lines.
      laborHours: summed({ $sum: { $ifNull: ['$laborLog.hours', []] } }),
      partsCost: summed(
        {
          $reduce: {
            input: { $ifNull: ['$parts', []] },
            initialValue: 0,
            in: {
              $add: ['$$value', { $multiply: [{ $ifNull: ['$$this.qty', 0] }, { $ifNull: ['$$this.unitCost', 0] }] }],
            },
          },
        },
        'currency',
      ),
      avgDaysToComplete: averaged(
        {
          $cond: [
            { $and: [{ $eq: ['$status', 'Completed'] }, { $ne: ['$completedAt', null] }] },
            { $divide: [{ $subtract: ['$completedAt', '$createdAt'] }, 86_400_000] },
            0,
          ],
        },
        { $and: [{ $eq: ['$status', 'Completed'] }, { $ne: ['$completedAt', null] }] },
      ),
    },
    filters: {
      status: { path: 'status', type: 'string' },
      type: { path: 'type', type: 'string' },
      priority: { path: 'priority', type: 'string' },
      assignedTo: { path: 'assignedTo', type: 'string' },
      facility: { path: '__asset.location.id', type: 'string', scopeNode: true },
      assetCategory: { path: '__asset.category', type: 'string' },
      dueDate: { path: 'dueDate', type: 'date' },
      completedAt: { path: 'completedAt', type: 'date' },
    },
  },

  inspections: {
    model: Inspection as unknown as Model<never>,
    prefix: assetJoin,
    scopeField: '__asset.location.id',
    dimensions: {
      status: plain('status'),
      type: plain('type'),
      templateName: plain('templateName'),
      assignedTo: plain('assignedTo'),
      assetCategory: plain('__asset.category'),
      facility: facilityDim('__asset.location.id'),
      scheduledMonth: monthOf('scheduledFor'),
    },
    measures: {
      count: counted(),
      completedCount: counted({ $in: ['$status', ['Passed', 'Failed']] }),
      passedCheckpoints: summed({ $ifNull: ['$summary.passed', 0] }),
      failedCheckpoints: summed({ $ifNull: ['$summary.failed', 0] }),
      // Pass rate over checkpoints, not over records: an inspection with one
      // failure out of forty is not a failed estate.
      passRate: {
        accumulate: {
          s: { $sum: { $ifNull: ['$summary.passed', 0] } },
          c: { $sum: { $add: [{ $ifNull: ['$summary.passed', 0] }, { $ifNull: ['$summary.failed', 0] }] } },
        },
        finalize: (p) => (num(p, 'c') === 0 ? 0 : Math.round((num(p, 's') / num(p, 'c')) * 1000) / 10),
        type: 'percent',
      },
    },
    filters: {
      status: { path: 'status', type: 'string' },
      type: { path: 'type', type: 'string' },
      assignedTo: { path: 'assignedTo', type: 'string' },
      facility: { path: '__asset.location.id', type: 'string', scopeNode: true },
      assetCategory: { path: '__asset.category', type: 'string' },
      scheduledFor: { path: 'scheduledFor', type: 'date' },
    },
  },

  transfers: {
    model: CustodyRecord as unknown as Model<never>,
    prefix: assetJoin,
    scopeField: '__asset.location.id',
    dimensions: {
      action: plain('action'),
      holder: plain('holder'),
      by: plain('by'),
      assetCategory: plain('__asset.category'),
      facility: facilityDim('__asset.location.id'),
      month: monthOf('at'),
    },
    measures: {
      count: counted(),
      // Distinct assets, carried as the set itself so merged buckets do not
      // double-count an asset that moved within each of them.
      assetsMoved: {
        accumulate: { ids: { $addToSet: '$assetId' } },
        finalize: (p) => new Set(Array.isArray(p.ids) ? p.ids : []).size,
        type: 'number',
      },
    },
    filters: {
      action: { path: 'action', type: 'string' },
      holder: { path: 'holder', type: 'string' },
      by: { path: 'by', type: 'string' },
      facility: { path: '__asset.location.id', type: 'string', scopeNode: true },
      assetCategory: { path: '__asset.category', type: 'string' },
      at: { path: 'at', type: 'date' },
    },
  },

  workforce: {
    model: Technician as unknown as Model<never>,
    prefix: () => [
      // Open work is joined on the assignee's *name*, because that is what a
      // work order stores. Stated in the catalogue so nobody reads this column
      // as an id-level join it is not.
      {
        $lookup: {
          from: WorkOrder.collection.name,
          let: { tech: '$name' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$assignedTo', '$$tech'] },
                    { $not: [{ $in: ['$status', ['Completed', 'Cancelled']] }] },
                  ],
                },
              },
            },
            { $count: 'n' },
          ],
          as: '__work',
        },
      },
    ],
    scopeField: 'location.id',
    dimensions: {
      department: plain('department'),
      title: plain('title'),
      shift: plain('shift.label'),
      facility: facilityDim('location.id'),
      active: { expr: { $cond: ['$active', 'Active', 'Inactive'] }, type: 'string' },
    },
    measures: {
      count: counted(),
      activeCount: counted({ $eq: ['$active', true] }),
      openWorkOrders: summed({ $ifNull: [{ $first: '$__work.n' }, 0] }),
    },
    filters: {
      department: { path: 'department', type: 'string' },
      facility: { path: 'location.id', type: 'string', scopeNode: true },
      active: { path: 'active', type: 'boolean' },
    },
  },

  facilities: {
    // Built from assets rather than from the tree, because every measure here
    // is an asset measure. The facilities holding none are added back by
    // `zeroFill` — a site with no assets is exactly what somebody reading this
    // report is looking for.
    model: Asset as unknown as Model<never>,
    prefix: () => [],
    scopeField: 'location.id',
    dimensions: {
      facility: facilityDim('location.id'),
      parent: {
        expr: '$location.id',
        resolve: (raw, scope) => {
          const facility = raw ? scope.facilityOf.get(raw) : undefined;
          const node = facility ? scope.byId.get(facility.id) : undefined;
          const parent = node?.parentId ? scope.byId.get(node.parentId) : undefined;
          return parent?.name ?? scope.rootName;
        },
        type: 'string',
      },
      level: {
        expr: '$location.id',
        resolve: (raw, scope) => (raw ? (scope.facilityOf.get(raw)?.level ?? 'facility') : 'facility'),
        type: 'string',
      },
    },
    measures: {
      assetCount: counted(),
      assetValue: summed(ASSET_VALUE, 'currency'),
      activeCount: counted({ $eq: ['$status', 'Active'] }),
      maintenanceCount: counted({ $eq: ['$status', 'Maintenance'] }),
      avgHealth: averaged({ $ifNull: ['$healthScore', 0] }, { $isNumber: '$healthScore' }),
    },
    filters: {
      facility: { path: 'location.id', type: 'string', scopeNode: true },
      level: { path: 'location.id', type: 'string' },
    },
    zeroFill: (scope) =>
      scope.rows
        .filter((row) => row.level === 'facility' && scope.ids.has(row._id))
        .map((row) => ({ raw: row._id, value: row.name })),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────────────────────

/** Escape a user string so `contains` is a substring match, never a pattern. */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function coerce(value: unknown, type: ReportFieldType): unknown {
  if (type === 'date') {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) throw ApiError.badRequest(`"${String(value)}" is not a valid date`);
    return date;
  }
  if (type === 'number' || type === 'currency' || type === 'percent') {
    const n = Number(value);
    if (Number.isNaN(n)) throw ApiError.badRequest(`"${String(value)}" is not a number`);
    return n;
  }
  if (type === 'boolean') return value === true || value === 'true';
  return String(value);
}

/** Every node at or beneath `id`, walking the parent pointers upward. */
function subtreeOf(scope: AnalyticsScope, id: string): string[] {
  const out: string[] = [];
  for (const row of scope.rows) {
    let cursor: string | undefined = row._id;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor); // a cycle in the adjacency list would otherwise spin forever
      if (cursor === id) {
        out.push(row._id);
        break;
      }
      cursor = scope.byId.get(cursor)?.parentId;
    }
  }
  return out;
}

/**
 * One clause to one Mongo condition.
 *
 * A facility clause expands to the node's whole subtree, because selecting a
 * facility means "and everything in it" — matching the facility's own id alone
 * would return only the assets nobody has placed in a rack yet.
 */
function clauseToCondition(
  clause: ReportFilterClause,
  spec: FilterSpec,
  scope: AnalyticsScope,
): Record<string, unknown> {
  const { path, type } = spec;

  if (spec.scopeNode) {
    const ids = Array.isArray(clause.value) ? clause.value.map(String) : [String(clause.value)];
    const expanded = new Set<string>();
    for (const id of ids) {
      // Refused, not narrowed: a filter naming a facility the caller may not
      // see is an attempt to widen past their grant, and answering it with
      // somebody else's rows is the failure this module exists to prevent.
      if (!scope.ids.has(id)) throw ApiError.forbidden(`Your access does not extend to location ${id}`);
      for (const node of subtreeOf(scope, id)) expanded.add(node);
    }
    return { [path]: { $in: [...expanded] } };
  }

  switch (clause.op) {
    case 'eq':
      return { [path]: coerce(clause.value, type) };
    case 'ne':
      return { [path]: { $ne: coerce(clause.value, type) } };
    case 'in': {
      const list = Array.isArray(clause.value) ? clause.value : [clause.value];
      return { [path]: { $in: list.map((v) => coerce(v, type)) } };
    }
    case 'gt':
      return { [path]: { $gt: coerce(clause.value, type) } };
    case 'gte':
      return { [path]: { $gte: coerce(clause.value, type) } };
    case 'lt':
      return { [path]: { $lt: coerce(clause.value, type) } };
    case 'lte':
      return { [path]: { $lte: coerce(clause.value, type) } };
    case 'between': {
      const pair = Array.isArray(clause.value) ? clause.value : [clause.value];
      if (pair.length !== 2) throw ApiError.badRequest(`"between" on ${clause.field} needs exactly two values`);
      return { [path]: { $gte: coerce(pair[0], type), $lte: coerce(pair[1], type) } };
    }
    case 'contains':
      return { [path]: { $regex: escapeRegex(String(clause.value)), $options: 'i' } };
    default:
      throw ApiError.badRequest(`Unsupported operator "${String(clause.op)}"`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecuteOptions {
  /** Run the report against one facility, without editing the definition. */
  facility?: string;
  /** Exports take every row; the preview takes `definition.limit`. */
  unlimited?: boolean;
}

/** Default and hard caps on preview size. */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/**
 * Validate a definition against the catalogue.
 *
 * Exported because saving a report runs the same check — a definition that
 * cannot be executed should be refused where it is written, not discovered the
 * first time somebody opens it.
 */
export function validateDefinition(definition: ReportDefinition): void {
  const catalogue = reportSource(definition.source);
  const spec = SOURCES[definition.source];
  if (!catalogue || !spec) throw ApiError.badRequest(`Unknown data source "${definition.source}"`);

  for (const key of definition.dimensions) {
    if (!spec.dimensions[key]) throw ApiError.badRequest(`"${key}" is not a dimension of ${catalogue.label}`);
  }
  if (definition.measures.length === 0) throw ApiError.badRequest('A report needs at least one measure');
  for (const key of definition.measures) {
    if (!spec.measures[key]) throw ApiError.badRequest(`"${key}" is not a measure of ${catalogue.label}`);
  }
  for (const clause of definition.filters) {
    if (!spec.filters[clause.field]) {
      throw ApiError.badRequest(`"${clause.field}" cannot be filtered on ${catalogue.label}`);
    }
  }
  if (definition.sort) {
    const key = definition.sort.replace(/^-/, '');
    if (!definition.dimensions.includes(key) && !definition.measures.includes(key)) {
      throw ApiError.badRequest(`Cannot sort by "${key}" — it is not in the report`);
    }
  }
}

/**
 * Run a definition and return the rows.
 *
 * Every figure comes out of the pipeline. Nothing on this path reads a stored
 * total, and nothing writes one.
 */
export async function executeReport(
  identity: ScopeIdentity,
  definition: ReportDefinition,
  options: ExecuteOptions = {},
): Promise<ReportResult> {
  validateDefinition(definition);

  const catalogue = reportSource(definition.source);
  const spec = SOURCES[definition.source];
  const scope = await resolveAnalyticsScope(identity, options.facility);
  const notes: string[] = [];

  const dimensions = definition.dimensions.map((key) => ({ key, spec: spec.dimensions[key] as DimensionSpec }));
  const measures = definition.measures.map((key) => ({ key, spec: spec.measures[key] as MeasureSpec }));

  // ── Pipeline ──────────────────────────────────────────────────────────────
  const pipeline: PipelineStage[] = [...spec.prefix()];

  // Permissions first, and never optional. A user restricted to one facility
  // cannot widen past it by writing a filter, because this clause is ANDed on
  // top of whatever the definition asks for.
  if (spec.scopeField && !scope.coversAll) {
    pipeline.push({ $match: { [spec.scopeField]: { $in: [...scope.ids] } } });
  } else if (!spec.scopeField && !scope.coversAll) {
    notes.push(
      `${catalogue?.label ?? definition.source} is not held per location, so these figures cover the whole estate rather than ${scope.name}.`,
    );
  }

  const conditions = definition.filters.map((clause) =>
    clauseToCondition(clause, spec.filters[clause.field] as FilterSpec, scope),
  );
  if (conditions.length > 0) pipeline.push({ $match: { $and: conditions } });

  // The group key. No dimensions means one bucket — a single totals row, which
  // is a legitimate report ("what is the estate worth?").
  const groupId =
    dimensions.length === 0 ? null : Object.fromEntries(dimensions.map((d, i) => [`d${i}`, d.spec.expr]));

  const accumulators: Record<string, unknown> = {};
  for (const [index, measure] of measures.entries()) {
    for (const [part, expr] of Object.entries(measure.spec.accumulate)) {
      accumulators[`m${index}_${part}`] = expr;
    }
  }
  // Always carried: the honest denominator under every row.
  accumulators.__records = { $sum: 1 };

  pipeline.push({ $group: { _id: groupId, ...accumulators } });

  const raw = await spec.model.aggregate<RawGroup>(pipeline);

  // ── Post-pass ─────────────────────────────────────────────────────────────
  // Resolve display values, merge buckets that collapse onto the same key, then
  // finalize each measure from its additive parts.
  const merged = new Map<string, { values: string[]; parts: Parts[]; records: number }>();

  const put = (values: string[], parts: Parts[], records: number) => {
    const key = values.join(' ');
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { values, parts, records });
      return;
    }
    existing.records += records;
    for (const [index, part] of parts.entries()) {
      const target = existing.parts[index] as Parts;
      for (const [name, value] of Object.entries(part)) {
        if (Array.isArray(value)) {
          const current = Array.isArray(target[name]) ? (target[name] as string[]) : [];
          target[name] = [...current, ...value];
        } else {
          target[name] = num(target, name) + value;
        }
      }
    }
  };

  for (const group of raw) {
    const values = dimensions.map((dimension, i) => {
      const rawValue = groupId ? ((group._id as Record<string, unknown>)?.[`d${i}`] ?? null) : null;
      const asString = rawValue === null || rawValue === undefined || rawValue === '' ? null : String(rawValue);
      return dimension.spec.resolve ? dimension.spec.resolve(asString, scope) : (asString ?? 'Unspecified');
    });

    const parts = measures.map((measure, index) => {
      const bucket: Parts = {};
      for (const part of Object.keys(measure.spec.accumulate)) {
        const value = group[`m${index}_${part}`];
        bucket[part] = Array.isArray(value) ? (value as string[]) : Number(value ?? 0);
      }
      return bucket;
    });

    put(values, parts, Number(group.__records ?? 0));
  }

  // Facilities with nothing in them still deserve a row.
  if (spec.zeroFill && dimensions.length > 0) {
    const emptyParts = () =>
      measures.map(
        (measure) =>
          Object.fromEntries(
            Object.entries(measure.spec.accumulate).map(([part, expr]) => [
              part,
              // A set-valued part starts empty; every other part starts at zero.
              typeof expr === 'object' && expr !== null && '$addToSet' in (expr as object) ? ([] as string[]) : 0,
            ]),
          ) as Parts,
      );

    for (const candidate of spec.zeroFill(scope)) {
      const values = dimensions.map((dimension) =>
        dimension.spec.resolve ? dimension.spec.resolve(candidate.raw, scope) : candidate.value,
      );
      if (!merged.has(values.join(' '))) put(values, emptyParts(), 0);
    }
  }

  const columns: ReportColumn[] = [
    ...dimensions.map((d) => ({
      key: d.key,
      label: labelFor(definition.source, 'dimension', d.key),
      type: d.spec.type,
      kind: 'dimension' as const,
    })),
    ...measures.map((m) => ({
      key: m.key,
      label: labelFor(definition.source, 'measure', m.key),
      type: m.spec.type,
      kind: 'measure' as const,
    })),
  ];

  let rows: ReportRow[] = [...merged.values()].map((entry) => {
    const row: ReportRow = {};
    dimensions.forEach((dimension, i) => {
      row[dimension.key] = entry.values[i] ?? 'Unspecified';
    });
    measures.forEach((measure, i) => {
      row[measure.key] = measure.spec.finalize(entry.parts[i] as Parts);
    });
    return row;
  });

  // ── Sort ──────────────────────────────────────────────────────────────────
  // Default: descending by the first measure, which is what a bar chart wants
  // and what a reader scanning a table expects.
  const sortKey = (definition.sort ?? `-${measures[0]?.key ?? ''}`).replace(/^-/, '');
  const descending = (definition.sort ?? '-x').startsWith('-');
  rows.sort((a, b) => {
    const left = a[sortKey];
    const right = b[sortKey];
    if (typeof left === 'number' && typeof right === 'number') return descending ? right - left : left - right;
    return descending
      ? String(right ?? '').localeCompare(String(left ?? ''))
      : String(left ?? '').localeCompare(String(right ?? ''));
  });

  const rowCount = rows.length;
  const limit = options.unlimited ? rowCount : Math.min(definition.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const truncated = rowCount > limit;
  if (truncated) rows = rows.slice(0, limit);

  // ── Totals ────────────────────────────────────────────────────────────────
  // Summed over the *returned* rows, so a truncated preview's footer agrees
  // with what is above it rather than quoting a figure the reader cannot see.
  const totals: Record<string, number> = {};
  for (const measure of measures) {
    // A mean of means is not a mean, and a rate of rates is not a rate. Those
    // columns get no total rather than a plausible wrong one.
    if (measure.key.startsWith('avg') || measure.spec.type === 'percent') continue;
    totals[measure.key] = Math.round(rows.reduce((sum, row) => sum + Number(row[measure.key] ?? 0), 0) * 100) / 100;
  }

  const recordsScanned = [...merged.values()].reduce((sum, entry) => sum + entry.records, 0);
  if (recordsScanned === 0) {
    notes.push(`${catalogue?.label ?? definition.source} holds no records matching this report yet.`);
  }
  if (truncated) {
    notes.push(`Showing the top ${limit} of ${rowCount} rows. Exports contain every row.`);
  }

  return {
    columns,
    rows,
    totals,
    rowCount,
    truncated,
    generatedAt: new Date().toISOString(),
    source: definition.source,
    visualization: definition.visualization,
    scope: { id: scope.id, name: scope.name },
    recordsScanned,
    notes,
  };
}

/** Display label from the shared catalogue, so both sides say the same thing. */
function labelFor(source: ReportDataSource, kind: 'dimension' | 'measure', key: string): string {
  const catalogue = REPORT_SOURCES.find((s) => s.id === source);
  const list = kind === 'dimension' ? catalogue?.dimensions : catalogue?.measures;
  return list?.find((f) => f.key === key)?.label ?? key;
}

interface RawGroup {
  _id: unknown;
  __records: number;
  [part: string]: unknown;
}
