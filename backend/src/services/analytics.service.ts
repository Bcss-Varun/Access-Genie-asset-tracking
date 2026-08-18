import type { PipelineStage } from 'mongoose';
import type {
  AnalyticsDashboard,
  AnalyticsFacilityRow,
  AnalyticsKpi,
  AnalyticsPeriod,
  AnalyticsRecentAsset,
  AnalyticsSlice,
  AnalyticsTransferRow,
  AnalyticsTrendPoint,
  ScopeLevel,
} from '@access-genie/shared';
import { ASSET_CATEGORIES, ASSET_STATUSES } from '@access-genie/shared';
import { Asset, CustodyRecord, PmSchedule, WorkOrder } from '../models/index.js';
import { resolveAnalyticsScope, type AnalyticsScope, type ScopeIdentity } from './analyticsScope.service.js';

/**
 * The organisation-wide Analytics Dashboard, in one read.
 *
 * There is no analytics collection and there must not be one. Every figure
 * below is aggregated at request time from the collections the other modules
 * already write — `Asset`, `WorkOrder`, `PmSchedule`, `CustodyRecord`
 * — joined to `ScopeNode` for the Org ▸ Facility ▸ Building hierarchy. Move an
 * asset in the registry and the facility distribution here changes on the next
 * read; complete a work order and the maintenance counts change with it. There
 * is nothing to synchronise because there is nothing stored twice.
 *
 * Three decisions are visible in the response and worth stating up front.
 *
 * **Stock versus flow.** "How many assets exist" is true as of now and does not
 * move with the date range; "how many were added" is counted over the range and
 * does. Every KPI publishes which it is, so a range selector that correctly
 * leaves the estate size alone does not read as a broken filter.
 *
 * **A record's facility is its asset's facility.** A work order has no location
 * of its own — it has an asset, and the asset sits somewhere in the tree. So
 * anything facility-shaped is resolved through the asset and rolled up to the
 * nearest `facility` ancestor. Records whose asset or location is missing land
 * in one explicit "Unassigned" row rather than being quietly dropped.
 *
 * **Gaps are reported, not filled.** Where the schema cannot answer something
 * the screen asks for, it goes in `dataGaps` and the figure counts only what
 * exists. Nothing here fabricates a number to avoid showing a zero.
 */

const DAY = 86_400_000;
/** How far ahead "due for maintenance" looks. */
const DUE_SOON_DAYS = 30;
/** How close to warranty expiry counts as nearing end of life. */
const EOL_WINDOW_DAYS = 90;

export interface AnalyticsDashboardInput {
  period?: AnalyticsPeriod;
  from?: Date;
  to?: Date;
  /** A scope-node id. Refused when outside the caller's permitted root. */
  facility?: string;
  categories?: string[];
  statuses?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Range
// ─────────────────────────────────────────────────────────────────────────────

interface Range {
  from: Date;
  to: Date;
  label: string;
  /** Trend bucket size. Chosen from the range length, not configured. */
  grain: 'day' | 'month';
}

/**
 * The window flow metrics are counted over.
 *
 * `all` starts at the epoch rather than at some arbitrary lookback, so "assets
 * added" over all time is genuinely every asset rather than a number that
 * quietly excludes the oldest ones.
 */
function resolveRange(input: AnalyticsDashboardInput): Range {
  const to = input.to ?? new Date();
  const period = input.period ?? '12m';

  const back = (days: number) => new Date(to.getTime() - days * DAY);
  const spans: Record<Exclude<AnalyticsPeriod, 'custom' | 'ytd' | 'all'>, [Date, string]> = {
    '30d': [back(30), 'Last 30 days'],
    '90d': [back(90), 'Last 90 days'],
    '6m': [back(182), 'Last 6 months'],
    '12m': [back(365), 'Last 12 months'],
  };

  let from: Date;
  let label: string;
  if (period === 'custom') {
    // A custom period without both ends is refused by the validator, so this
    // branch only ever runs with real dates.
    from = input.from as Date;
    label = `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`;
  } else if (period === 'ytd') {
    from = new Date(Date.UTC(to.getUTCFullYear(), 0, 1));
    label = 'Year to date';
  } else if (period === 'all') {
    from = new Date(0);
    label = 'All time';
  } else {
    [from, label] = spans[period];
  }

  const span = to.getTime() - from.getTime();
  return { from, to, label, grain: span <= 62 * DAY ? 'day' : 'month' };
}

/** `$dateToString` format for the chosen grain. */
const grainFormat = (grain: Range['grain']) => (grain === 'day' ? '%Y-%m-%d' : '%Y-%m');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function bucketLabel(period: string, grain: Range['grain']): string {
  const [year, month, day] = period.split('-');
  const name = MONTHS[Number(month) - 1] ?? month;
  return grain === 'day' ? `${day} ${name}` : `${name} ${year?.slice(2)}`;
}

/**
 * Fill the gaps in a series.
 *
 * A month in which nothing was added is a real zero and has to be drawn, or a
 * flat line through a quiet quarter looks like a busy one. Mongo returns only
 * the buckets that have documents, so the missing ones are added here.
 */
function fillBuckets(
  rows: { period: string; value: number; secondary?: number }[],
  range: Range,
): AnalyticsTrendPoint[] {
  const found = new Map(rows.map((r) => [r.period, r]));
  const out: AnalyticsTrendPoint[] = [];

  // An open-ended range would otherwise emit a bucket per day since 1970, so
  // "all time" starts at the earliest bucket that actually holds something.
  const earliest = rows.map((r) => r.period).sort()[0];
  const start = range.from.getTime() === 0
    ? (earliest ? new Date(`${earliest}${range.grain === 'month' ? '-01' : ''}T00:00:00Z`) : range.to)
    : range.from;

  const cursor = range.grain === 'day'
    ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
    : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));

  // Bounded so a malformed range can never spin: 400 buckets is more than any
  // preset produces, and the chart would be unreadable long before that.
  for (let guard = 0; cursor <= range.to && guard < 400; guard += 1) {
    const period = range.grain === 'day' ? cursor.toISOString().slice(0, 10) : cursor.toISOString().slice(0, 7);
    const hit = found.get(period);
    out.push({
      period,
      label: bucketLabel(period, range.grain),
      value: hit?.value ?? 0,
      secondary: hit?.secondary ?? 0,
    });
    if (range.grain === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared expressions
// ─────────────────────────────────────────────────────────────────────────────

/** Book value, falling back to purchase price where none is held. */
const VALUE_EXPR = { $ifNull: ['$bookValue', { $ifNull: ['$purchasePrice', 0] }] };

const countIf = (condition: unknown) => ({ $sum: { $cond: [condition, 1, 0] } });

const round = (n: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const sliceSort = (a: AnalyticsSlice, b: AnalyticsSlice) => b.value - a.value || a.label.localeCompare(b.label);

// ─────────────────────────────────────────────────────────────────────────────
// The read
// ─────────────────────────────────────────────────────────────────────────────

export async function analyticsDashboard(
  identity: ScopeIdentity,
  input: AnalyticsDashboardInput,
): Promise<AnalyticsDashboard> {
  const range = resolveRange(input);
  const scope = await resolveAnalyticsScope(identity, input.facility);

  const now = new Date();
  const dueSoonCutoff = new Date(now.getTime() + DUE_SOON_DAYS * DAY);
  const eolCutoff = new Date(now.getTime() + EOL_WINDOW_DAYS * DAY);
  const dataGaps: string[] = [];

  // The attribute filter, applied to every figure except the facility census
  // that feeds the picker — a picker that reads zero everywhere because you
  // narrowed to one category cannot be used to widen back out.
  const attributes: Record<string, unknown> = {};
  if (input.categories?.length) attributes.category = { $in: input.categories };
  if (input.statuses?.length) attributes.status = { $in: input.statuses };
  const attributeMatch: PipelineStage.FacetPipelineStage[] =
    Object.keys(attributes).length > 0 ? [{ $match: attributes } as PipelineStage.FacetPipelineStage] : [];

  const locationMatch = scope.coversAll ? {} : { 'location.id': { $in: [...scope.ids] } };

  // ── Assets ────────────────────────────────────────────────────────────────
  const [assetFacets] = await Asset.aggregate<AssetFacets>([
    ...(Object.keys(locationMatch).length > 0 ? [{ $match: locationMatch } as PipelineStage] : []),
    {
      $facet: {
        // Unfiltered by category/status on purpose — see above.
        census: [{ $group: { _id: '$location.id', n: { $sum: 1 } } }],
        totals: [
          ...attributeMatch,
          {
            $group: {
              _id: null,
              assets: { $sum: 1 },
              value: { $sum: VALUE_EXPR },
              purchaseValue: { $sum: { $ifNull: ['$purchasePrice', 0] } },
              // "Assigned" means somebody holds it. A blank custodian and the
              // literal placeholder both mean nobody does.
              assigned: countIf({
                $and: [
                  { $ne: [{ $ifNull: ['$custodian', ''] }, ''] },
                  { $ne: ['$custodian', 'Unassigned'] },
                ],
              }),
              underMaintenance: countIf({
                $or: [{ $eq: ['$status', 'Maintenance'] }, { $eq: ['$lifecycleStage', 'Maintenance'] }],
              }),
              endOfLife: countIf({
                $or: [
                  { $eq: ['$status', 'End_Of_Life'] },
                  { $in: ['$lifecycleStage', ['Retired', 'Disposed']] },
                  { $and: [{ $ne: ['$warrantyExpiry', null] }, { $lte: ['$warrantyExpiry', eolCutoff] }] },
                ],
              }),
              addedInRange: countIf({ $and: [{ $gte: ['$createdAt', range.from] }, { $lte: ['$createdAt', range.to] }] }),
              health: { $sum: { $ifNull: ['$healthScore', 0] } },
              healthN: countIf({ $isNumber: '$healthScore' }),
            },
          },
        ],
        byStatus: [...attributeMatch, { $group: { _id: '$status', n: { $sum: 1 } } }],
        byCategory: [...attributeMatch, { $group: { _id: '$category', n: { $sum: 1 }, value: { $sum: VALUE_EXPR } } }],
        byLifecycle: [...attributeMatch, { $group: { _id: '$lifecycleStage', n: { $sum: 1 } } }],
        byLocation: [
          ...attributeMatch,
          {
            $group: {
              _id: '$location.id',
              assets: { $sum: 1 },
              value: { $sum: VALUE_EXPR },
              active: countIf({ $eq: ['$status', 'Active'] }),
              underMaintenance: countIf({ $eq: ['$status', 'Maintenance'] }),
              health: { $sum: { $ifNull: ['$healthScore', 0] } },
              healthN: countIf({ $isNumber: '$healthScore' }),
            },
          },
        ],
        additions: [
          ...attributeMatch,
          { $match: { createdAt: { $gte: range.from, $lte: range.to } } },
          {
            $group: {
              _id: { $dateToString: { format: grainFormat(range.grain), date: '$createdAt' } },
              n: { $sum: 1 },
              value: { $sum: VALUE_EXPR },
            },
          },
        ],
        recent: [
          ...attributeMatch,
          { $sort: { createdAt: -1 } },
          { $limit: 8 },
          {
            $project: {
              name: 1,
              category: 1,
              status: 1,
              custodian: 1,
              createdAt: 1,
              locationId: '$location.id',
              locationName: '$location.name',
              value: VALUE_EXPR,
            },
          },
        ],
      },
    },
  ]);

  const totals = assetFacets?.totals?.[0];
  const totalAssets = totals?.assets ?? 0;

  // Asset ids in scope, needed to narrow the collections that have no location
  // of their own. Only fetched when the scope is genuinely narrower than the
  // whole tree — the common Super Admin case skips the query entirely.
  const assetScope = scope.coversAll && !input.categories?.length && !input.statuses?.length
    ? null
    : (await Asset.find({ ...locationMatch, ...attributes }).select('_id').lean<{ _id: string }[]>()).map((a) => a._id);

  const relatedMatch = assetScope ? { assetId: { $in: assetScope } } : {};

  // ── Maintenance ───────────────────────────────────────────────────────────
  const [woFacets] = await WorkOrder.aggregate<WorkOrderFacets>([
    ...(assetScope ? [{ $match: relatedMatch } as PipelineStage] : []),
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              open: countIf({ $not: [{ $in: ['$status', ['Completed', 'Cancelled']] }] }),
              inProgress: countIf({ $eq: ['$status', 'In Progress'] }),
              overdue: countIf({
                $and: [
                  { $not: [{ $in: ['$status', ['Completed', 'Cancelled']] }] },
                  { $lt: ['$dueDate', now] },
                ],
              }),
              dueSoon: countIf({
                $and: [
                  { $not: [{ $in: ['$status', ['Completed', 'Cancelled']] }] },
                  { $gte: ['$dueDate', now] },
                  { $lte: ['$dueDate', dueSoonCutoff] },
                ],
              }),
              completedInRange: countIf({
                $and: [
                  { $eq: ['$status', 'Completed'] },
                  { $ne: ['$completedAt', null] },
                  { $gte: ['$completedAt', range.from] },
                  { $lte: ['$completedAt', range.to] },
                ],
              }),
            },
          },
        ],
        byType: [{ $group: { _id: '$type', n: { $sum: 1 } } }],
        byStatus: [{ $group: { _id: '$status', n: { $sum: 1 } } }],
        // Raised vs completed on the same axis: the shape that answers "are we
        // keeping up", which neither series answers on its own.
        raised: [
          { $match: { createdAt: { $gte: range.from, $lte: range.to } } },
          { $group: { _id: { $dateToString: { format: grainFormat(range.grain), date: '$createdAt' } }, n: { $sum: 1 } } },
        ],
        completed: [
          { $match: { completedAt: { $gte: range.from, $lte: range.to } } },
          { $group: { _id: { $dateToString: { format: grainFormat(range.grain), date: '$completedAt' } }, n: { $sum: 1 } } },
        ],
        // Facility attribution needs the asset, which a work order references
        // but does not embed a location for.
        byLocation: [
          { $match: { status: { $nin: ['Completed', 'Cancelled'] } } },
          { $lookup: { from: Asset.collection.name, localField: 'assetId', foreignField: '_id', as: 'asset' } },
          { $unwind: { path: '$asset', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: '$asset.location.id',
              open: { $sum: 1 },
              overdue: countIf({ $lt: ['$dueDate', now] }),
            },
          },
        ],
      },
    },
  ]);

  // Preventive schedules are a second source of "due" and "overdue" — a PM that
  // has not yet raised a work order is still work that is owed.
  const [pmFacets] = await PmSchedule.aggregate<PmFacets>([
    ...(assetScope ? [{ $match: relatedMatch } as PipelineStage] : []),
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              overdue: countIf({ $lt: ['$nextDue', now] }),
              dueSoon: countIf({ $and: [{ $gte: ['$nextDue', now] }, { $lte: ['$nextDue', dueSoonCutoff] }] }),
            },
          },
        ],
      },
    },
  ]);

  // ── Transfers ─────────────────────────────────────────────────────────────
  const [custodyFacets] = await CustodyRecord.aggregate<CustodyFacets>([
    ...(assetScope ? [{ $match: relatedMatch } as PipelineStage] : []),
    {
      $facet: {
        totals: [{ $match: { at: { $gte: range.from, $lte: range.to } } }, { $group: { _id: null, n: { $sum: 1 } } }],
        trend: [
          { $match: { at: { $gte: range.from, $lte: range.to } } },
          { $group: { _id: { $dateToString: { format: grainFormat(range.grain), date: '$at' } }, n: { $sum: 1 } } },
        ],
        recent: [{ $sort: { at: -1 } }, { $limit: 8 }],
      },
    },
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // Shaping
  // ─────────────────────────────────────────────────────────────────────────

  const census = new Map((assetFacets?.census ?? []).map((r) => [r._id ?? '', r.n]));
  // Re-resolve the picker options now that real counts are available. The tree
  // is already in memory, so this costs nothing beyond the walk.
  const scopeWithCounts = await resolveAnalyticsScope(identity, input.facility, census);

  const woTotals = woFacets?.totals?.[0];
  const pmTotals = pmFacets?.totals?.[0];

  const overdueMaintenance = (woTotals?.overdue ?? 0) + (pmTotals?.overdue ?? 0);
  const dueMaintenance = (woTotals?.dueSoon ?? 0) + (pmTotals?.dueSoon ?? 0);
  const transfersTotal = custodyFacets?.totals?.[0]?.n ?? 0;

  if ((pmTotals?.total ?? 0) === 0) {
    dataGaps.push('No preventive maintenance schedules exist, so "due" and "overdue" count work orders only.');
  }
  dataGaps.push(
    `Assets have no expected-useful-life field, so "nearing end of life" means retired, disposed, flagged end-of-life, or within ${EOL_WINDOW_DAYS} days of warranty expiry.`,
  );

  const kpis: AnalyticsKpi[] = [
    {
      id: 'total-assets',
      label: 'Total assets',
      value: totalAssets,
      unit: 'count',
      sub: `In ${scopeWithCounts.name}`,
      basis: 'stock',
      tone: 'primary',
    },
    {
      id: 'total-value',
      label: 'Total asset value',
      value: round(totals?.value ?? 0),
      unit: 'currency',
      sub: 'Book value, falling back to purchase price',
      basis: 'stock',
      tone: 'emerald',
    },
    {
      id: 'assigned',
      label: 'Assigned',
      value: totals?.assigned ?? 0,
      unit: 'count',
      sub: totalAssets > 0 ? `${round(((totals?.assigned ?? 0) / totalAssets) * 100)}% of the estate` : 'No assets in scope',
      basis: 'stock',
      tone: 'slate',
    },
    {
      id: 'under-maintenance',
      label: 'Under maintenance',
      value: totals?.underMaintenance ?? 0,
      unit: 'count',
      sub: 'Assets out of service right now',
      basis: 'stock',
      tone: 'amber',
    },
    {
      id: 'due-maintenance',
      label: 'Due for maintenance',
      value: dueMaintenance,
      unit: 'count',
      sub: `Work orders and PM schedules due within ${DUE_SOON_DAYS} days`,
      basis: 'stock',
      tone: 'amber',
    },
    {
      id: 'overdue-maintenance',
      label: 'Overdue maintenance',
      value: overdueMaintenance,
      unit: 'count',
      sub: 'Past their due date and still open',
      basis: 'stock',
      tone: 'red',
    },
    {
      id: 'end-of-life',
      label: 'At or nearing end of life',
      value: totals?.endOfLife ?? 0,
      unit: 'count',
      sub: `Retired, disposed, or within ${EOL_WINDOW_DAYS} days of warranty expiry`,
      basis: 'stock',
      tone: 'red',
    },
    {
      id: 'recently-added',
      label: 'Assets added',
      value: totals?.addedInRange ?? 0,
      unit: 'count',
      sub: range.label,
      basis: 'flow',
      tone: 'emerald',
    },
    {
      id: 'transfers',
      label: 'Transfers',
      value: transfersTotal,
      unit: 'count',
      sub: `Custody movements · ${range.label.toLowerCase()}`,
      basis: 'flow',
      tone: 'slate',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    scope: {
      id: scopeWithCounts.id,
      name: scopeWithCounts.name,
      level: scopeWithCounts.level,
      isRoot: scopeWithCounts.isRoot,
    },
    range: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    kpis,
    assetsByStatus: orderedSlices(assetFacets?.byStatus ?? [], ASSET_STATUSES, (s) => s.replace(/_/g, ' ')),
    assetsByCategory: orderedSlices(assetFacets?.byCategory ?? [], ASSET_CATEGORIES),
    assetsByLifecycle: (assetFacets?.byLifecycle ?? [])
      .map((r) => ({ key: r._id ?? 'Unknown', label: r._id ?? 'Unknown', value: r.n }))
      .sort(sliceSort),
    assetsByFacility: facilityRows(scopeWithCounts, assetFacets?.byLocation ?? [], woFacets?.byLocation ?? []),
    valueByCategory: (assetFacets?.byCategory ?? [])
      .filter((r) => (r.value ?? 0) > 0)
      .map((r) => ({ key: r._id ?? 'Unknown', label: r._id ?? 'Unknown', value: round(r.value ?? 0), secondary: r.n }))
      .sort(sliceSort),
    additions: fillBuckets(
      (assetFacets?.additions ?? []).map((r) => ({ period: r._id, value: r.n, secondary: round(r.value ?? 0) })),
      range,
    ),
    maintenance: {
      open: woTotals?.open ?? 0,
      overdue: overdueMaintenance,
      inProgress: woTotals?.inProgress ?? 0,
      completedInRange: woTotals?.completedInRange ?? 0,
      dueSoon: dueMaintenance,
      byType: (woFacets?.byType ?? [])
        .map((r) => ({ key: r._id ?? 'Unspecified', label: r._id ?? 'Unspecified', value: r.n }))
        .sort(sliceSort),
      byStatus: (woFacets?.byStatus ?? [])
        .map((r) => ({ key: r._id ?? 'Unspecified', label: r._id ?? 'Unspecified', value: r.n }))
        .sort(sliceSort),
      trend: mergeTrend(woFacets?.raised ?? [], woFacets?.completed ?? [], range),
    },
    transfers: {
      total: transfersTotal,
      trend: fillBuckets((custodyFacets?.trend ?? []).map((r) => ({ period: r._id, value: r.n })), range),
      recent: (custodyFacets?.recent ?? []).map(
        (r): AnalyticsTransferRow => ({
          id: r._id,
          assetId: r.assetId,
          assetName: r.assetName,
          action: r.action,
          holder: r.holder,
          by: r.by,
          at: new Date(r.at).toISOString(),
        }),
      ),
    },
    recentAssets: (assetFacets?.recent ?? []).map(
      (r): AnalyticsRecentAsset => ({
        id: r._id,
        name: r.name,
        category: r.category,
        status: r.status,
        facility: scopeWithCounts.facilityOf.get(r.locationId ?? '')?.name ?? r.locationName ?? 'Unassigned',
        custodian: r.custodian && r.custodian !== 'Unassigned' ? r.custodian : 'Unassigned',
        value: round(r.value ?? 0),
        createdAt: new Date(r.createdAt).toISOString(),
      }),
    ),
    filterOptions: {
      facilities: scopeWithCounts.options,
      // The vocabularies, not the values currently present: a status with no
      // assets still has to be selectable, or the filter cannot be used to
      // discover that there are none.
      categories: [...ASSET_CATEGORIES],
      statuses: [...ASSET_STATUSES],
    },
    dataGaps,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shaping helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Slices in the domain's own order, with the zeroes kept.
 *
 * A status nobody is in is a fact worth drawing — a bar chart of asset status
 * that silently omits "Missing" reads as though nothing can go missing.
 */
function orderedSlices(
  rows: { _id: string | null; n: number; value?: number }[],
  vocabulary: readonly string[],
  label: (key: string) => string = (k) => k,
): AnalyticsSlice[] {
  const found = new Map(rows.map((r) => [r._id ?? 'Unknown', r]));
  const known = vocabulary.map((key) => ({
    key,
    label: label(key),
    value: found.get(key)?.n ?? 0,
    secondary: found.get(key)?.value !== undefined ? round(found.get(key)?.value ?? 0) : undefined,
  }));

  // Anything stored that is not in the vocabulary still gets a row — dropping
  // it would make the parts not add up to the whole.
  const extra = rows
    .filter((r) => !vocabulary.includes(r._id ?? 'Unknown'))
    .map((r) => ({ key: r._id ?? 'Unknown', label: label(r._id ?? 'Unknown'), value: r.n }));

  return [...known, ...extra];
}

/** Raised and completed on one axis. */
function mergeTrend(
  raised: { _id: string; n: number }[],
  completed: { _id: string; n: number }[],
  range: Range,
): AnalyticsTrendPoint[] {
  const done = new Map(completed.map((r) => [r._id, r.n]));
  const rows = raised.map((r) => ({ period: r._id, value: r.n, secondary: done.get(r._id) ?? 0 }));
  for (const [period, n] of done) {
    if (!rows.some((r) => r.period === period)) rows.push({ period, value: 0, secondary: n });
  }
  return fillBuckets(rows, range);
}

/**
 * Assets and open work rolled up to facilities.
 *
 * Both inputs are keyed by the exact location node — a rack, usually — so both
 * are folded to the nearest facility ancestor before being joined. A record
 * whose location is not in the tree lands in one explicit "Unassigned" row.
 */
function facilityRows(
  scope: AnalyticsScope,
  assets: { _id: string | null; assets: number; value: number; active: number; underMaintenance: number; health: number; healthN: number }[],
  work: { _id: string | null; open: number; overdue: number }[],
): AnalyticsFacilityRow[] {
  const rows = new Map<string, AnalyticsFacilityRow & { healthSum: number; healthN: number }>();

  const bucket = (locationId: string | null) => {
    const facility = locationId ? scope.facilityOf.get(locationId) : undefined;
    const id = facility?.id ?? 'unassigned';
    const existing = rows.get(id);
    if (existing) return existing;

    const created = {
      id,
      name: facility?.name ?? 'Unassigned',
      level: (facility?.level ?? 'facility') as ScopeLevel,
      assets: 0,
      value: 0,
      active: 0,
      underMaintenance: 0,
      openWorkOrders: 0,
      overdueWorkOrders: 0,
      avgHealth: null as number | null,
      healthSum: 0,
      healthN: 0,
    };
    rows.set(id, created);
    return created;
  };

  for (const row of assets) {
    const target = bucket(row._id);
    target.assets += row.assets;
    target.value += row.value;
    target.active += row.active;
    target.underMaintenance += row.underMaintenance;
    target.healthSum += row.health;
    target.healthN += row.healthN;
  }

  for (const row of work) {
    const target = bucket(row._id);
    target.openWorkOrders += row.open;
    target.overdueWorkOrders += row.overdue;
  }

  return [...rows.values()]
    .map(({ healthSum, healthN, ...row }) => ({
      ...row,
      value: round(row.value),
      avgHealth: healthN > 0 ? round(healthSum / healthN) : null,
    }))
    .sort((a, b) => b.assets - a.assets || b.value - a.value || a.name.localeCompare(b.name));
}


// ─────────────────────────────────────────────────────────────────────────────
// Facet shapes — what each `$facet` branch above actually returns.
// ─────────────────────────────────────────────────────────────────────────────

interface AssetFacets {
  census: { _id: string | null; n: number }[];
  totals: {
    assets: number;
    value: number;
    purchaseValue: number;
    assigned: number;
    underMaintenance: number;
    endOfLife: number;
    addedInRange: number;
    health: number;
    healthN: number;
  }[];
  byStatus: { _id: string | null; n: number }[];
  byCategory: { _id: string | null; n: number; value: number }[];
  byLifecycle: { _id: string | null; n: number }[];
  byLocation: {
    _id: string | null;
    assets: number;
    value: number;
    active: number;
    underMaintenance: number;
    health: number;
    healthN: number;
  }[];
  additions: { _id: string; n: number; value: number }[];
  recent: {
    _id: string;
    name: string;
    category: string;
    status: string;
    custodian: string;
    createdAt: Date;
    locationId?: string;
    locationName?: string;
    value: number;
  }[];
}

interface WorkOrderFacets {
  totals: { open: number; inProgress: number; overdue: number; dueSoon: number; completedInRange: number }[];
  byType: { _id: string | null; n: number }[];
  byStatus: { _id: string | null; n: number }[];
  raised: { _id: string; n: number }[];
  completed: { _id: string; n: number }[];
  byLocation: { _id: string | null; open: number; overdue: number }[];
}

interface PmFacets {
  totals: { total: number; overdue: number; dueSoon: number }[];
}

interface CustodyFacets {
  totals: { n: number }[];
  trend: { _id: string; n: number }[];
  recent: { _id: string; assetId: string; assetName: string; action: string; holder: string; by: string; at: Date }[];
}

