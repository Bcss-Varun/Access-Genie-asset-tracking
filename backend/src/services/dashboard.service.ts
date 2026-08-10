import type {
  ActivityEvent,
  AssetCategory,
  AssetStatus,
  CategoryBreakdown,
  UtilizationDowntimePoint,
  DashboardAlert,
  DashboardCharts,
  DashboardLists,
  DashboardPeriod,
  DashboardSummary,
  DashboardWork,
  KpiId,
  LifecycleCount,
  MaintenanceMonth,
  Metric,
  ModuleKey,
} from '@access-genie/shared';
import {
  Activity,
  Alert,
  Asset,
  Certification,
  CustodyRecord,
  Geofence,
  Insight,
  MetricSnapshot,
  OPEN_ALERT_STATUSES,
  Part,
  PmSchedule,
  Transfer,
  Warehouse,
  WorkOrder,
} from '../models/index.js';
import { OPEN_WO_STATUSES } from './workOrder.service.js';
import { resolveScope } from './scopeFilter.service.js';
import { depreciationFor, loadClassTerms, portfolioSeries, type ClassTerms } from './depreciation.service.js';
import { getOrgSettings } from './configuration.service.js';

/**
 * The dashboard, in one request.
 *
 * Three things make this different from the aggregate it replaced.
 *
 * **It respects the scope switcher.** The old version aggregated the whole
 * estate and never saw `?scope=`, while every other slice of `/dataset` was
 * narrowed by `resolveScope()`. A facility's tiles sat next to an
 * organisation's charts and nothing said so. The subtree is resolved once here
 * and every query below keys off it.
 *
 * **It compares.** "4 open work orders" is not information; "4, down from 7"
 * is. Anything that *happened during* a window — work raised and closed, alerts
 * acknowledged, assets moved — is counted twice, over this window and the one
 * before it, and bucketed into a series for the sparkline. Anything that simply
 * *is* — how many assets exist, what they are worth — gets no `previous` and no
 * `series`, because there are no historical snapshots in this system and a
 * trend line for portfolio value would be a drawing, not a measurement.
 *
 * **It answers per role.** Each group is computed only when the caller holds
 * the module grant, so a Technician's response genuinely has no financial keys
 * in it rather than having them zeroed on the way out.
 */

const DAY = 86_400_000;

/** How far back each period reaches, and how many buckets its sparkline has. */
const PERIOD_SHAPE: Record<DashboardPeriod, { days: number; buckets: number }> = {
  '7d': { days: 7, buckets: 7 },
  '30d': { days: 30, buckets: 10 },
  '90d': { days: 90, buckets: 12 },
  fy: { days: 365, buckets: 12 },
};

interface Window {
  start: Date;
  previousStart: Date;
  now: Date;
  buckets: number;
  bucketMs: number;
}

/**
 * The window the flow figures are counted over.
 *
 * A period preset is relative to now; an explicit `from`–`to` is not, and the
 * comparison window for it is the equally long stretch immediately before it —
 * so "1–31 July against 1–30 June" rather than against a fixed month length.
 * Bucket count is derived from the span so a two-day range does not get twelve
 * near-empty buckets and a year does not get two.
 */
function windowFor(period: DashboardPeriod, from?: Date, to?: Date): Window {
  const now = new Date();

  if (from && to && to.getTime() > from.getTime()) {
    const span = to.getTime() - from.getTime();
    const days = span / DAY;
    const buckets = Math.max(4, Math.min(14, Math.round(days <= 14 ? days : days <= 90 ? 10 : 12)));
    return {
      now: to,
      start: from,
      previousStart: new Date(from.getTime() - span),
      buckets,
      bucketMs: span / buckets,
    };
  }

  const { days, buckets } = PERIOD_SHAPE[period];
  const span = days * DAY;
  return {
    now,
    start: new Date(now.getTime() - span),
    previousStart: new Date(now.getTime() - span * 2),
    buckets,
    bucketMs: span / buckets,
  };
}

/** A stock metric: true right now, with no honest history behind it. */
function stock(value: number | null, unit: Metric['unit'], extra: Partial<Metric> = {}): Metric {
  return { value, unit, ...extra };
}

/** A flow metric: counted over the window, with the window before it to compare against. */
function flow(
  value: number,
  previous: number,
  series: number[],
  unit: Metric['unit'],
  extra: Partial<Metric> = {},
): Metric {
  return { value, previous, series, unit, higherIsBetter: true, ...extra };
}

/** Bucket a list of timestamps into the window's sparkline slots. */
function bucketize(dates: (Date | string)[], w: Window): number[] {
  const series = new Array<number>(w.buckets).fill(0);
  for (const d of dates) {
    const at = new Date(d).getTime();
    const offset = at - w.start.getTime();
    if (offset < 0) continue;
    const index = Math.min(w.buckets - 1, Math.floor(offset / w.bucketMs));
    series[index] = (series[index] ?? 0) + 1;
  }
  return series;
}

const round = (n: number, dp = 0) => {
  const factor = 10 ** dp;
  return Math.round(n * factor) / factor;
};

const mean = (values: number[]): number | null =>
  values.length ? round(values.reduce((s, v) => s + v, 0) / values.length) : null;

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);

/**
 * What one asset cost and what it is worth — from a single source.
 *
 * An asset's price can sit in two places: the `purchasePrice` column and the
 * `commercial` block of its registration record, and the second is the more
 * specific of the two. Reading cost from one and book value from the other is
 * how a dashboard ends up reporting an asset worth more than it cost, which is
 * exactly what happened before this existed. Both figures now come from the
 * same resolved inputs.
 *
 * A non-depreciable asset — leased, or with no date — still contributes its
 * cost, and its book value falls back to that cost rather than to zero: we know
 * what was paid, we simply have no basis to write it down.
 */
function valuationOf(
  asset: AssetRow,
  classTerms: Map<string, ClassTerms>,
  at: Date,
): { purchase: number; book: number; depreciable: boolean } {
  const state = depreciationFor(asset, classTerms, at);
  if (state) return { purchase: state.purchasePrice, book: state.bookValue, depreciable: true };

  const commercial = asset.onboarding?.commercial as { purchasePrice?: number } | undefined;
  const purchase = commercial?.purchasePrice ?? asset.purchasePrice ?? 0;
  return { purchase, book: purchase, depreciable: false };
}

// ─────────────────────────────────────────────────────────────────────────────

export interface DashboardRequest {
  modules: ModuleKey[];
  /**
   * Who is asking, by display name — work orders record an assignee's name, not
   * their id (see `my-work`). Absent from the `/dataset` call, which wants the
   * charts and has no use for a personal queue, so the "mine" tiles are skipped
   * rather than computed against nobody.
   */
  userName?: string;
  scopeId?: string;
  period?: DashboardPeriod;
  /** A custom range. When both are present they win over `period`. */
  from?: Date;
  to?: Date;
  /** `asset.onboarding.department` — captured at registration. */
  department?: string;
  category?: AssetCategory;
}

export async function getDashboardSummary({
  modules,
  userName,
  scopeId,
  period = '30d',
  from,
  to,
  department,
  category,
}: DashboardRequest): Promise<DashboardSummary> {
  const can = (...required: ModuleKey[]) => required.some((m) => modules.includes(m));
  const w = windowFor(period, from, to);

  const scope = await resolveScope(scopeId);
  const scoped = scope !== null && !scope.isRoot;

  // Which assets are in view. Everything below keys off this one set, so an
  // asset and the work orders against it can never disagree about being in
  // scope — the same contract dataset.service.ts holds itself to. Department
  // and category narrow the same set, which is why they reach the charts and
  // the lists without either having to know they exist.
  const assetFilter: Record<string, unknown> = {
    ...(scoped ? { 'location.id': { $in: [...scope.ids] } } : {}),
    ...(department ? { 'onboarding.department': department } : {}),
    ...(category ? { category } : {}),
  };

  const assets = await Asset.find(assetFilter)
    .select(
      '_id name category status healthScore riskScore utilization purchasePrice bookValue depreciationMethod purchaseDate warrantyExpiry trackingId location lifecycleStage onboarding',
    )
    .lean();

  const assetIds = assets.map((a) => a._id);
  // Any narrowing at all means downstream collections filter by asset id — not
  // just a scope, since a department or category cut is equally a cut of which
  // work orders and alerts are in view.
  const narrowed = scoped || Boolean(department) || Boolean(category);
  const byAsset = narrowed ? { assetId: { $in: assetIds } } : {};

  const [orgSettings, classTerms] = await Promise.all([getOrgSettings(), loadClassTerms()]);

  const [kpis, triage, charts, lists] = await Promise.all([
    buildKpis(can, w, assets, byAsset, userName, classTerms, orgSettings.laborRatePerHour),
    buildTriage(can, w, assets, byAsset),
    buildCharts(can, w, assets, byAsset, classTerms, orgSettings.laborRatePerHour),
    buildLists(can, assets, byAsset, userName),
  ]);

  return {
    meta: {
      scopeId: scope?.scopeId ?? null,
      scopeName: scope?.name ?? 'All locations',
      period,
      from: w.start.toISOString(),
      to: w.now.toISOString(),
      department: department ?? null,
      category: category ?? null,
      departments: await departmentsInScope(scoped ? { 'location.id': { $in: [...scope.ids] } } : {}),
      generatedAt: new Date().toISOString(),
    },
    triage,
    kpis,
    charts,
    lists,
  };
}

/**
 * The departments the filter can offer.
 *
 * Read against the *scope* only, not the current department filter — otherwise
 * choosing one would leave it as the only option and there would be no way back
 * to the others.
 */
async function departmentsInScope(scopeFilter: Record<string, unknown>): Promise<string[]> {
  const values = await Asset.distinct('onboarding.department', scopeFilter);
  return values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).sort();
}

/**
 * Just the two aggregate series `/dataset` carries.
 *
 * The dataset payload needs a utilization trend and a category mix for the
 * screens that still read module bindings — and nothing else from this module.
 * Calling `getDashboardSummary` there would run twenty-odd queries to use two of
 * their results, on the app's hottest endpoint. It takes the caller's already
 * resolved scope filters rather than resolving them a second time.
 */
export async function getScopedAggregates(
  assetFilter: Record<string, unknown>,
  byAsset: Record<string, unknown>,
): Promise<{ utilizationDowntime: UtilizationDowntimePoint[]; categoryBreakdown: CategoryBreakdown[] }> {
  const assets = await Asset.find(assetFilter).select('category purchasePrice utilization').lean();

  const byCategory = new Map<AssetCategory, { count: number; value: number }>();
  for (const a of assets) {
    const row = byCategory.get(a.category) ?? { count: 0, value: 0 };
    row.count += 1;
    row.value += a.purchasePrice ?? 0;
    byCategory.set(a.category, row);
  }

  return {
    categoryBreakdown: [...byCategory.entries()]
      .map(([category, r]) => ({ category, count: r.count, value: Math.round(r.value) }))
      .sort((a, b) => b.count - a.count),
    utilizationDowntime: await buildUtilizationTrend(assets as AssetRow[], byAsset, windowFor('30d')),
  };
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

type Can = (...required: ModuleKey[]) => boolean;

/** The columns of an asset this module reads — selected once, reused everywhere. */
type AssetRow = {
  _id: string;
  name: string;
  category: AssetCategory;
  status: AssetStatus;
  healthScore: number;
  riskScore?: number;
  utilization?: number;
  purchasePrice: number;
  purchaseDate?: Date;
  bookValue?: number;
  depreciationMethod?: string;
  warrantyExpiry?: Date;
  trackingId?: string;
  location?: { name?: string };
  lifecycleStage?: string;
  /** The embedded registration record — loosely typed by design, narrowed at use. */
  onboarding?: Record<string, unknown>;
};

async function buildKpis(
  can: Can,
  w: Window,
  assets: AssetRow[],
  byAsset: Record<string, unknown>,
  userName: string | undefined,
  classTerms: Map<string, ClassTerms>,
  laborRate: number,
): Promise<Partial<Record<KpiId, Metric>>> {
  const kpis: Partial<Record<KpiId, Metric>> = {};
  const total = assets.length;

  // ── Estate (stock) — every role that can see the workspace sees these ──────
  const active = assets.filter((a) => a.status === 'Active').length;
  const underMaintenance = assets.filter((a) => a.status === 'Maintenance').length;
  kpis.totalAssets = stock(total, 'count', { caption: total ? `${active} active` : 'nothing registered' });
  kpis.avgHealth = stock(mean(assets.map((a) => a.healthScore ?? 0)), 'score');
  kpis.avgUtilization = stock(mean(assets.map((a) => a.utilization ?? 0)), 'pct');
  kpis.availability = stock(pct(active, total), 'pct', { caption: `${active} of ${total} active` });
  kpis.missingAssets = stock(assets.filter((a) => a.status === 'Missing').length, 'count', {
    higherIsBetter: false,
  });
  kpis.assetsUnderMaintenance = stock(underMaintenance, 'count', {
    higherIsBetter: false,
    caption: 'out of service',
  });

  if (can('tracking')) {
    kpis.trackedPct = stock(pct(assets.filter((a) => a.trackingId).length, total), 'pct', {
      caption: 'assets with a tag bound',
    });

    const moves = await CustodyRecord.find({ ...byAsset, at: { $gte: w.previousStart } })
      .select('at')
      .lean();
    const current = moves.filter((m) => new Date(m.at) >= w.start);
    kpis.movementVolume = flow(
      current.length,
      moves.length - current.length,
      bucketize(current.map((m) => m.at), w),
      'count',
    );
  }

  // ── Money (stock) ─────────────────────────────────────────────────────────
  //
  // Computed here rather than read off the stored `bookValue`, so a figure is
  // never stale between derivation passes and an asset the pass has not seen
  // yet still reports correctly. The stored column exists so MongoDB can sort
  // and filter on it; these three are the arithmetic itself.
  if (can('analytics', 'admin')) {
    let purchase = 0;
    let book = 0;
    let depreciable = 0;
    for (const asset of assets) {
      const value = valuationOf(asset, classTerms, w.now);
      purchase += value.purchase;
      book += value.book;
      if (value.depreciable) depreciable += 1;
    }

    kpis.portfolioValue = stock(Math.round(purchase), 'inr', { caption: 'what it cost' });
    kpis.bookValue = stock(Math.round(book), 'inr', {
      caption: depreciable ? `${depreciable} of ${total} depreciable` : 'nothing depreciable in scope',
    });
    kpis.depreciatedValue = stock(Math.round(Math.max(0, purchase - book)), 'inr', {
      higherIsBetter: false,
      caption: purchase ? `${pct(purchase - book, purchase) ?? 0}% written down` : undefined,
    });
  }

  // ── Maintenance (flow) ────────────────────────────────────────────────────
  if (can('maintenance')) {
    const work = await WorkOrder.find({ ...byAsset, createdAt: { $gte: w.previousStart } })
      .select('createdAt completedAt status dueDate assignedTo')
      .lean();

    const openNow = await WorkOrder.countDocuments({ ...byAsset, status: { $in: OPEN_WO_STATUSES } });
    const overdueNow = await WorkOrder.countDocuments({
      ...byAsset,
      status: { $in: OPEN_WO_STATUSES },
      dueDate: { $lt: w.now },
    });

    const raised = work.filter((x) => new Date(x.createdAt) >= w.start);
    kpis.openWorkOrders = stock(openNow, 'count', {
      higherIsBetter: false,
      caption: `${raised.length} raised this period`,
    });
    kpis.overdueWorkOrders = stock(overdueNow, 'count', { higherIsBetter: false, caption: 'past due date' });

    const closed = await WorkOrder.find({ ...byAsset, completedAt: { $gte: w.previousStart } })
      .select('createdAt completedAt')
      .lean();
    const closedNow = closed.filter((x) => x.completedAt && new Date(x.completedAt) >= w.start);
    kpis.completedWorkOrders = flow(
      closedNow.length,
      closed.length - closedNow.length,
      bucketize(closedNow.map((x) => x.completedAt as Date), w),
      'count',
    );

    // MTTR — hours from raised to completed, over the orders closed in each
    // window. Only orders with both timestamps count; a seeded order without a
    // creation date would otherwise report a repair that took years.
    const hoursFor = (rows: typeof closed) =>
      rows
        .filter((x) => x.completedAt && x.createdAt)
        .map((x) => (new Date(x.completedAt as Date).getTime() - new Date(x.createdAt).getTime()) / 3_600_000)
        .filter((h) => h >= 0);

    const mttrNow = hoursFor(closedNow);
    const mttrPrev = hoursFor(closed.filter((x) => x.completedAt && new Date(x.completedAt) < w.start));
    if (mttrNow.length || mttrPrev.length) {
      kpis.mttrHours = {
        value: mttrNow.length ? round(mttrNow.reduce((s, h) => s + h, 0) / mttrNow.length, 1) : null,
        previous: mttrPrev.length ? round(mttrPrev.reduce((s, h) => s + h, 0) / mttrPrev.length, 1) : 0,
        unit: 'hours',
        higherIsBetter: false,
        caption: `${mttrNow.length} order${mttrNow.length === 1 ? '' : 's'} closed`,
      };
    }

    // MTBF — mean days between failures, taken as corrective work raised
    // against the estate over the window. Reported per asset in service, so a
    // fleet of ten with one failure a month reads as "300 days", not "30".
    const corrective = await WorkOrder.find({ ...byAsset, type: 'Corrective', createdAt: { $gte: w.previousStart } })
      .select('createdAt')
      .lean();
    const failuresNow = corrective.filter((x) => new Date(x.createdAt) >= w.start).length;
    const failuresPrev = corrective.length - failuresNow;
    const windowDays = (w.now.getTime() - w.start.getTime()) / DAY;
    const inService = assets.filter((a) => a.status !== 'End_Of_Life').length;
    if (failuresNow || failuresPrev) {
      const mtbf = (failures: number) => (failures > 0 ? round((windowDays * inService) / failures, 1) : null);
      kpis.mtbfDays = {
        value: mtbf(failuresNow),
        previous: mtbf(failuresPrev) ?? 0,
        unit: 'count',
        higherIsBetter: true,
        caption: `${failuresNow} corrective order${failuresNow === 1 ? '' : 's'} raised`,
      };
    }

    // What the work cost: parts consumed plus labour at the configured rate.
    const costRows = await WorkOrder.find({ ...byAsset, completedAt: { $gte: w.previousStart } })
      .select('completedAt parts laborLog')
      .lean();
    const costOf = (rows: typeof costRows) =>
      rows.reduce(
        (sum, wo) =>
          sum +
          (wo.parts ?? []).reduce((p, part) => p + part.qty * part.unitCost, 0) +
          (wo.laborLog ?? []).reduce((l, entry) => l + entry.hours * laborRate, 0),
        0,
      );
    const costNow = costRows.filter((x) => x.completedAt && new Date(x.completedAt) >= w.start);
    if (costRows.length) {
      kpis.maintenanceCost = {
        value: Math.round(costOf(costNow)),
        previous: Math.round(costOf(costRows.filter((x) => !costNow.includes(x)))),
        unit: 'inr',
        higherIsBetter: false,
        caption: `parts plus labour at ${laborRate.toLocaleString('en-IN')}/h`,
      };
    }

    const pms = await PmSchedule.find(byAsset).select('compliancePct nextDue').lean();
    const overduePms = pms.filter((p) => new Date(p.nextDue) < w.now).length;
    kpis.pmCompliance = stock(mean(pms.map((p) => p.compliancePct ?? 0)), 'pct', {
      caption: pms.length ? `${overduePms} overdue PM` : 'no PM schedules',
    });
  }

  // ── Alerts & security (flow) ──────────────────────────────────────────────
  if (can('alerts', 'compliance', 'tracking')) {
    const alerts = await Alert.find({ ...byAsset, createdAt: { $gte: w.previousStart } })
      .select('createdAt acknowledgedAt severity status')
      .lean();
    const raisedNow = alerts.filter((a) => new Date(a.createdAt) >= w.start);

    kpis.openAlerts = stock(
      await Alert.countDocuments({ ...byAsset, status: { $in: OPEN_ALERT_STATUSES } }),
      'count',
      { higherIsBetter: false, caption: `${raisedNow.length} raised this period` },
    );
    kpis.criticalAlerts = stock(
      await Alert.countDocuments({ ...byAsset, severity: 'Critical', status: { $in: OPEN_ALERT_STATUSES } }),
      'count',
      { higherIsBetter: false },
    );

    // Response time: raised → acknowledged. An alert nobody has acknowledged
    // contributes nothing rather than counting as instant.
    const responseFor = (rows: typeof alerts) =>
      rows
        .filter((a) => a.acknowledgedAt)
        .map((a) => (new Date(a.acknowledgedAt as Date).getTime() - new Date(a.createdAt).getTime()) / 60_000)
        .filter((m) => m >= 0);

    const respNow = responseFor(raisedNow);
    const respPrev = responseFor(alerts.filter((a) => new Date(a.createdAt) < w.start));
    if (respNow.length || respPrev.length) {
      kpis.alertResponseMins = {
        value: respNow.length ? round(respNow.reduce((s, m) => s + m, 0) / respNow.length) : null,
        previous: respPrev.length ? round(respPrev.reduce((s, m) => s + m, 0) / respPrev.length) : 0,
        unit: 'count',
        higherIsBetter: false,
        caption: 'minutes to acknowledge',
      };
    }
  }

  if (can('tracking', 'compliance')) {
    const geofences = await Geofence.find().select('breaches24h').lean();
    kpis.geofenceBreaches = stock(
      geofences.reduce((s, g) => s + (g.breaches24h ?? 0), 0),
      'count',
      { higherIsBetter: false, caption: 'last 24 hours' },
    );

    const custody = await CustodyRecord.find(byAsset).select('holder by').lean();
    kpis.custodyExceptions = stock(
      custody.filter((c) => c.holder === 'Unknown' || /geofence|no check-out/i.test(c.by ?? '')).length,
      'count',
      { higherIsBetter: false, caption: 'unknown holder or no check-out' },
    );
  }

  // ── AI (stock, materialised by metrics.service.ts) ────────────────────────
  if (can('ai')) {
    const risky = assets.filter((a) => (a.riskScore ?? 0) > 60).length;
    kpis.assetsAtRisk = stock(risky, 'count', { higherIsBetter: false, caption: 'risk above 60' });
    kpis.predictedFailures = stock(assets.filter((a) => (a.riskScore ?? 0) >= 70).length, 'count', {
      higherIsBetter: false,
    });
    kpis.riskIndex = stock(mean(assets.map((a) => a.riskScore ?? 0)), 'score', { higherIsBetter: false });

    const insights = await Insight.find(byAsset).select('impactInr createdAt').lean();
    kpis.aiSavings = stock(
      Math.round(insights.reduce((s, i) => s + (i.impactInr ?? 0), 0)),
      'inr',
      { caption: 'identified across open insights' },
    );
  }

  // ── Inventory (stock) ─────────────────────────────────────────────────────
  if (can('inventory')) {
    const [parts, warehouses] = await Promise.all([
      Part.find().select('onHand reorderPoint unitCost abcClass').lean(),
      Warehouse.find().select('valueInr').lean(),
    ]);
    const below = parts.filter((p) => p.onHand <= p.reorderPoint);

    kpis.stockValue = stock(Math.round(warehouses.reduce((s, x) => s + (x.valueInr ?? 0), 0)), 'inr');
    kpis.stockouts = stock(parts.filter((p) => p.onHand < p.reorderPoint).length, 'count', {
      higherIsBetter: false,
    });
    kpis.belowReorder = stock(below.length, 'count', { higherIsBetter: false });
    kpis.fillRate = stock(pct(parts.length - below.length, parts.length), 'pct', {
      caption: `${parts.length} SKUs tracked`,
    });
  }

  // ── Mine (the field roles' whole dashboard) ───────────────────────────────
  if (userName && can('maintenance', 'operations')) {
    const mine = await WorkOrder.find({ ...byAsset, assignedTo: userName })
      .select('status dueDate completedAt')
      .lean();
    const open = mine.filter((x) => OPEN_WO_STATUSES.includes(x.status));
    const endOfToday = new Date(w.now);
    endOfToday.setHours(23, 59, 59, 999);

    kpis.myOpenWork = stock(open.length, 'count', { higherIsBetter: false, caption: 'assigned to me' });
    kpis.myDueToday = stock(open.filter((x) => new Date(x.dueDate) <= endOfToday).length, 'count', {
      higherIsBetter: false,
    });
    kpis.myOverdue = stock(open.filter((x) => new Date(x.dueDate) < w.now).length, 'count', {
      higherIsBetter: false,
    });

    const closedMine = mine.filter((x) => x.completedAt && new Date(x.completedAt) >= w.previousStart);
    const closedThis = closedMine.filter((x) => new Date(x.completedAt as Date) >= w.start);
    kpis.myClosedThisPeriod = flow(
      closedThis.length,
      closedMine.length - closedThis.length,
      bucketize(closedThis.map((x) => x.completedAt as Date), w),
      'count',
    );
  }

  return kpis;
}

// ── Triage ───────────────────────────────────────────────────────────────────

/**
 * The "needs you now" counts.
 *
 * Deliberately not gated the way the KPIs are: this strip is the reason the
 * dashboard exists, and a count of zero for a module you cannot see is
 * indistinguishable from a count of zero because nothing is wrong. Each figure
 * is still computed only when the grant allows it — the fallback is 0, and the
 * client renders a chip only for counts above zero, so nothing appears that the
 * user cannot then open.
 */
async function buildTriage(
  can: Can,
  w: Window,
  assets: AssetRow[],
  byAsset: Record<string, unknown>,
): Promise<DashboardSummary['triage']> {
  const soon = new Date(w.now.getTime() + 30 * DAY);

  const [criticalAlerts, overdueWorkOrders, unassignedWork, expiringCerts, stockouts] = await Promise.all([
    can('alerts', 'compliance', 'tracking')
      ? Alert.countDocuments({ ...byAsset, severity: 'Critical', status: { $in: OPEN_ALERT_STATUSES } })
      : 0,
    can('maintenance')
      ? WorkOrder.countDocuments({ ...byAsset, status: { $in: OPEN_WO_STATUSES }, dueDate: { $lt: w.now } })
      : 0,
    can('maintenance') ? WorkOrder.countDocuments({ ...byAsset, status: 'New' }) : 0,
    can('compliance')
      ? Certification.countDocuments({ ...byAsset, expiresAt: { $lte: soon }, status: { $ne: 'Expired' } })
      : 0,
    can('inventory')
      ? Part.find().select('onHand reorderPoint').lean().then((p) => p.filter((x) => x.onHand < x.reorderPoint).length)
      : 0,
  ]);

  return {
    criticalAlerts,
    overdueWorkOrders,
    unassignedWork,
    missingAssets: assets.filter((a) => a.status === 'Missing').length,
    stockouts,
    expiringCerts,
  };
}

// ── Charts ───────────────────────────────────────────────────────────────────

const RISK_BANDS = [
  { label: 'Low (0–25)', test: (r: number) => r <= 25 },
  { label: 'Medium (26–50)', test: (r: number) => r > 25 && r <= 50 },
  { label: 'High (51–75)', test: (r: number) => r > 50 && r <= 75 },
  { label: 'Critical (76–100)', test: (r: number) => r > 75 },
];

async function buildCharts(
  can: Can,
  w: Window,
  assets: AssetRow[],
  byAsset: Record<string, unknown>,
  classTerms: Map<string, ClassTerms>,
  laborRate: number,
): Promise<DashboardCharts> {
  const charts: DashboardCharts = {};

  // Category and status mix come from the assets already in hand — no second
  // pass over the collection, and guaranteed to agree with the tiles above.
  // Value is resolved the same way the money tiles resolve it, so the donut and
  // the KPI row cannot report different totals for the same estate.
  const byCategory = new Map<AssetCategory, { count: number; value: number; book: number }>();
  for (const a of assets) {
    const row = byCategory.get(a.category) ?? { count: 0, value: 0, book: 0 };
    const value = valuationOf(a, classTerms, w.now);
    row.count += 1;
    row.value += value.purchase;
    row.book += value.book;
    byCategory.set(a.category, row);
  }

  charts.categoryBreakdown = [...byCategory.entries()]
    .map(([category, r]) => ({ category, count: r.count, value: Math.round(r.value) }))
    .sort((a, b) => b.count - a.count);

  const statusCounts = new Map<AssetStatus, number>();
  for (const a of assets) statusCounts.set(a.status, (statusCounts.get(a.status) ?? 0) + 1);
  charts.statusMix = [...statusCounts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  // Where the estate physically sits. Grouped by the location *name* rather
  // than its id, so an asset filed against a zone counts towards the site a
  // reader would recognise.
  const byLocation = new Map<string, number>();
  for (const a of assets) {
    const name = a.location?.name ?? 'Unassigned';
    byLocation.set(name, (byLocation.get(name) ?? 0) + 1);
  }
  charts.topLocations = [...byLocation.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  charts.utilizationBands = [
    { label: 'High (>80%)', value: assets.filter((a) => (a.utilization ?? 0) > 80).length },
    { label: 'Medium (50–80%)', value: assets.filter((a) => (a.utilization ?? 0) >= 50 && (a.utilization ?? 0) <= 80).length },
    { label: 'Low (<50%)', value: assets.filter((a) => (a.utilization ?? 0) < 50).length },
  ];

  charts.liveStatus = buildLiveStatus(assets, await inTransitAssetIds(byAsset));
  charts.lifecycle = buildLifecycle(assets, classTerms, w.now);

  // Estate-wide, not scoped: the snapshot records one row for the whole estate
  // per day, so narrowing to a facility cannot narrow its history. Rather than
  // filter it wrongly, it is sent as-is and the widget names what it covers.
  const history = await MetricSnapshot.find({ at: { $gte: w.start } })
    .sort({ at: 1 })
    .select('at avgHealth avgUtilization avgRisk')
    .lean();
  charts.scoreHistory = history.map((row) => ({
    at: new Date(row.at).toISOString(),
    health: row.avgHealth,
    utilization: row.avgUtilization,
    risk: row.avgRisk,
  }));

  if (can('ai')) {
    charts.riskDistribution = RISK_BANDS.map((band) => ({
      label: band.label,
      value: assets.filter((a) => band.test(a.riskScore ?? 0)).length,
    }));
  }

  if (can('analytics', 'admin')) {
    charts.valueByCategory = [...byCategory.entries()]
      .map(([category, r]) => ({ label: category, purchase: Math.round(r.value), book: Math.round(r.book) }))
      .sort((a, b) => b.purchase - a.purchase);

    // The headline chart. Twelve months of purchase, book and accumulated
    // depreciation — every point computed from the asset's own terms, so it is
    // real history with nothing stored: see shared/src/depreciation.ts.
    const trendFrom = new Date(w.now);
    trendFrom.setUTCMonth(trendFrom.getUTCMonth() - 11);
    charts.valueTrend = portfolioSeries(assets, classTerms, trendFrom, w.now);
  }

  if (can('maintenance')) {
    const pipeline = await WorkOrder.aggregate<{ _id: string; count: number }>([
      ...(Object.keys(byAsset).length ? [{ $match: byAsset }] : []),
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const at = (status: string) => pipeline.find((p) => p._id === status)?.count ?? 0;
    charts.woPipeline = [
      { label: 'New', value: at('New') },
      { label: 'Assigned', value: at('Assigned') },
      { label: 'In Progress', value: at('In Progress') },
      { label: 'Completed', value: at('Completed') },
    ];

    charts.utilizationDowntime = await buildUtilizationTrend(assets, byAsset, w);
    charts.maintenanceByMonth = await buildMaintenanceMonths(byAsset, w, laborRate);
  }

  if (can('alerts', 'compliance', 'tracking')) {
    const byType = await Alert.aggregate<{ _id: string; count: number }>([
      ...(Object.keys(byAsset).length ? [{ $match: byAsset }] : []),
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    charts.alertsByType = byType.map((t) => ({ label: t._id, value: t.count }));
  }

  if (can('inventory')) {
    const parts = await Part.find().select('onHand unitCost abcClass').lean();
    charts.abcAnalysis = (['A', 'B', 'C'] as const).map((cls) => {
      const rows = parts.filter((p) => p.abcClass === cls);
      return {
        label: `Class ${cls}`,
        value: Math.round(rows.reduce((s, p) => s + p.onHand * p.unitCost, 0)),
        caption: `${rows.length} SKUs`,
      };
    });
  }

  return charts;
}

/** Assets currently moving between sites — a transfer approved but not yet received. */
async function inTransitAssetIds(byAsset: Record<string, unknown>): Promise<Set<string>> {
  const moving = await Transfer.find({ ...byAsset, status: { $in: ['Approved', 'In Transit'] } })
    .select('assetId')
    .lean();
  return new Set(moving.map((t) => t.assetId));
}

/**
 * What the estate is doing right now.
 *
 * The stored `status` enum answers a records question — Active, Maintenance,
 * Missing — and a live board wants an operational one. So Active splits on
 * whether the asset has actually been used lately, and anything mid-transfer is
 * reported as such rather than as sitting in the site it has already left.
 *
 * Every state here is derived from something recorded. There is deliberately no
 * "Offline" or "Lost" bucket: neither is a state this system tracks, and adding
 * them would mean inventing the count.
 */
function buildLiveStatus(assets: AssetRow[], inTransit: Set<string>): { label: string; value: number }[] {
  let inUse = 0;
  let idle = 0;
  let maintenance = 0;
  let missing = 0;
  let retired = 0;
  let staging = 0;
  let transit = 0;

  for (const a of assets) {
    if (inTransit.has(a._id)) {
      transit += 1;
      continue;
    }
    switch (a.status) {
      case 'Maintenance':
        maintenance += 1;
        break;
      case 'Missing':
        missing += 1;
        break;
      case 'End_Of_Life':
        retired += 1;
        break;
      case 'Staging':
        staging += 1;
        break;
      default:
        if ((a.utilization ?? 0) > 0) inUse += 1;
        else idle += 1;
    }
  }

  return [
    { label: 'In use', value: inUse },
    { label: 'Idle', value: idle },
    { label: 'In transit', value: transit },
    { label: 'Under maintenance', value: maintenance },
    { label: 'Staging', value: staging },
    { label: 'Missing', value: missing },
    { label: 'Retired', value: retired },
  ].filter((row) => row.value > 0);
}

/**
 * The lifecycle overview — what is about to need a decision.
 *
 * Every row is backed by a field that exists. The reference design this follows
 * also listed *calibration due* and *insurance expiring*; neither is modelled
 * anywhere in this system, and a count invented for them would be read and
 * acted on as though it were real.
 */
function buildLifecycle(assets: AssetRow[], classTerms: Map<string, ClassTerms>, at: Date): LifecycleCount[] {
  const now = at.getTime();
  const within = (iso: Date | string | undefined, days: number) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && t - now <= days * DAY;
  };

  const commercialOf = (a: AssetRow) => {
    const record = a.onboarding?.commercial;
    return record && typeof record === 'object' ? (record as { amcEnd?: string; returnDate?: string }) : undefined;
  };

  let endOfLife = 0;
  let fullyDepreciated = 0;
  for (const a of assets) {
    const state = depreciationFor(a, classTerms, at);
    if (state?.fullyDepreciated) fullyDepreciated += 1;
    // Within a year of the end of its useful life, or already flagged for it.
    // `'EOL Planning'` was a pre-cutover board stage that no longer exists —
    // see shared/src/domain.ts `LIFECYCLE_STAGES`; `Retired` is its nearest
    // equivalent in the governed 10-stage vocabulary.
    if (a.lifecycleStage === 'Retired' || (state && state.lifeUsed >= 1 - 1 / (state.usefulLifeYears || 1))) {
      endOfLife += 1;
    }
  }

  return [
    { key: 'eol', label: 'Nearing end of life (12 months)', count: endOfLife },
    { key: 'depreciated', label: 'Fully depreciated', count: fullyDepreciated },
    { key: 'warranty', label: 'Warranty expiring (60 days)', count: assets.filter((a) => within(a.warrantyExpiry, 60)).length },
    { key: 'amc', label: 'AMC expiring (60 days)', count: assets.filter((a) => within(commercialOf(a)?.amcEnd, 60)).length },
    { key: 'lease', label: 'Lease returning (90 days)', count: assets.filter((a) => within(commercialOf(a)?.returnDate, 90)).length },
  ];
}

/**
 * Maintenance by month: work raised of each kind, and what the completed work cost.
 *
 * Counted by month rather than by the selected period's buckets, because this
 * is the one chart people read against a budget cycle.
 */
async function buildMaintenanceMonths(
  byAsset: Record<string, unknown>,
  w: Window,
  laborRate: number,
): Promise<MaintenanceMonth[]> {
  const from = new Date(Date.UTC(w.now.getUTCFullYear(), w.now.getUTCMonth() - 5, 1));
  const orders = await WorkOrder.find({
    ...byAsset,
    $or: [{ createdAt: { $gte: from } }, { completedAt: { $gte: from } }],
  })
    .select('type createdAt completedAt parts laborLog')
    .lean();

  const months: MaintenanceMonth[] = [];
  for (let i = 0; i < 6; i++) {
    const at = new Date(Date.UTC(w.now.getUTCFullYear(), w.now.getUTCMonth() - 5 + i, 1));
    months.push({
      label: MONTH_LABELS[at.getUTCMonth()] ?? '',
      preventive: 0,
      corrective: 0,
      predictive: 0,
      inspection: 0,
      cost: 0,
    });
  }

  const indexOf = (date: Date) => {
    const diff =
      (date.getUTCFullYear() - w.now.getUTCFullYear()) * 12 + (date.getUTCMonth() - w.now.getUTCMonth()) + 5;
    return diff >= 0 && diff < months.length ? diff : -1;
  };

  for (const order of orders) {
    const raised = indexOf(new Date(order.createdAt));
    const bucket = raised >= 0 ? months[raised] : undefined;
    if (bucket) {
      if (order.type === 'Preventive') bucket.preventive += 1;
      else if (order.type === 'Corrective') bucket.corrective += 1;
      else if (order.type === 'Predictive') bucket.predictive += 1;
      else bucket.inspection += 1;
    }

    // Cost lands in the month the work finished, which is when it was spent.
    if (!order.completedAt) continue;
    const closed = indexOf(new Date(order.completedAt));
    const costBucket = closed >= 0 ? months[closed] : undefined;
    if (!costBucket) continue;
    costBucket.cost +=
      (order.parts ?? []).reduce((s, p) => s + p.qty * p.unitCost, 0) +
      (order.laborLog ?? []).reduce((s, l) => s + l.hours * laborRate, 0);
  }

  return months.map((m) => ({ ...m, cost: Math.round(m.cost) }));
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Utilization against downtime, bucketed over the window.
 *
 * Downtime is logged maintenance labour in each bucket. Utilization is the
 * fleet average in scope — a single number, because utilization is materialised
 * per asset rather than journaled, so there is no per-month history to read. It
 * is drawn as a flat reference line rather than being given a fake slope; the
 * shape in this chart is the downtime, which is real.
 */
async function buildUtilizationTrend(assets: AssetRow[], byAsset: Record<string, unknown>, w: Window) {
  const labour = await WorkOrder.aggregate<{ _id: null; entries: { at: Date; hours: number }[] }>([
    ...(Object.keys(byAsset).length ? [{ $match: byAsset }] : []),
    { $unwind: '$laborLog' },
    { $match: { 'laborLog.at': { $gte: w.start } } },
    { $group: { _id: null, entries: { $push: { at: '$laborLog.at', hours: '$laborLog.hours' } } } },
  ]);

  const entries = labour[0]?.entries ?? [];
  const fleetAvg = mean(assets.map((a) => a.utilization ?? 0)) ?? 0;

  const downtime = new Array<number>(w.buckets).fill(0);
  for (const e of entries) {
    const offset = new Date(e.at).getTime() - w.start.getTime();
    if (offset < 0) continue;
    const index = Math.min(w.buckets - 1, Math.floor(offset / w.bucketMs));
    downtime[index] = (downtime[index] ?? 0) + (e.hours ?? 0);
  }

  return downtime.map((hours, i) => {
    const at = new Date(w.start.getTime() + i * w.bucketMs);
    return {
      label: at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      utilization: fleetAvg,
      downtime: Math.round(hours),
    };
  });
}

// ── Lists ────────────────────────────────────────────────────────────────────

const toWork = (w: { _id: string; title: string; assetId: string; assetName: string; status: string; priority: string; assignedTo: string; dueDate: Date }, now: number): DashboardWork => ({
  id: w._id,
  title: w.title,
  assetId: w.assetId,
  assetName: w.assetName,
  status: w.status as DashboardWork['status'],
  priority: w.priority as DashboardWork['priority'],
  assignedTo: w.assignedTo,
  dueDate: new Date(w.dueDate).toISOString(),
  overdue: new Date(w.dueDate).getTime() < now,
});

async function buildLists(
  can: Can,
  assets: AssetRow[],
  byAsset: Record<string, unknown>,
  userName: string | undefined,
): Promise<DashboardLists> {
  const lists: DashboardLists = {};
  const now = Date.now();

  // The reallocation candidates — least used first, and only assets in service.
  lists.underutilized = [...assets]
    .filter((a) => a.status === 'Active')
    .sort((a, b) => (a.utilization ?? 0) - (b.utilization ?? 0))
    .slice(0, 5)
    .map((a) => ({ id: a._id, name: a.name, utilization: a.utilization ?? 0 }));

  lists.topRisks = [...assets]
    .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
    .slice(0, 6)
    .map((a) => ({
      id: a._id,
      name: a.name,
      category: a.category,
      healthScore: a.healthScore,
      riskScore: a.riskScore,
      status: a.status,
      location: a.location?.name,
    }));

  const [alerts, overdue, mine, activity, certs] = await Promise.all([
    // Fetched newest-first and re-ranked below rather than sorted by severity
    // in Mongo: `severity` is a string, so a database sort would order it
    // alphabetically — Critical before Info before Warning — and a `limit`
    // applied to that would drop real criticals off the end.
    can('alerts', 'compliance', 'tracking')
      ? Alert.find({ ...byAsset, status: { $in: OPEN_ALERT_STATUSES } })
          .sort({ createdAt: -1 })
          .limit(40)
          .lean()
      : null,
    can('maintenance')
      ? WorkOrder.find({ ...byAsset, status: { $in: OPEN_WO_STATUSES } })
          .sort({ dueDate: 1 })
          .limit(8)
          .lean()
      : null,
    userName && can('maintenance', 'operations')
      ? WorkOrder.find({ ...byAsset, assignedTo: userName, status: { $in: OPEN_WO_STATUSES } })
          .sort({ dueDate: 1 })
          .limit(8)
          .lean()
      : null,
    Activity.find(byAsset).sort({ timestamp: -1 }).limit(10).lean(),
    can('compliance')
      ? Certification.find({ ...byAsset, expiresAt: { $lte: new Date(now + 90 * DAY) } })
          .sort({ expiresAt: 1 })
          .limit(6)
          .lean()
      : null,
  ]);

  const SEVERITY_RANK: Record<string, number> = { Critical: 0, Warning: 1, Info: 2 };
  if (alerts) {
    lists.alertsToTriage = [...alerts]
      .sort(
        (a, b) =>
          (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 8)
      .map<DashboardAlert>((a) => ({
        id: a._id,
        title: a.title,
        severity: a.severity,
        type: a.type,
        status: a.status,
        assetName: a.assetName,
        createdAt: new Date(a.createdAt).toISOString(),
      }));
  }

  if (overdue) lists.overdueWork = overdue.map((w) => toWork(w, now));
  if (mine) lists.myWork = mine.map((w) => toWork(w, now));

  if (certs) {
    lists.expiringCerts = certs.map((c) => ({
      id: c._id,
      name: c.name,
      assetName: c.assetName,
      expiresAt: new Date(c.expiresAt).toISOString(),
      daysLeft: Math.round((new Date(c.expiresAt).getTime() - now) / DAY),
    }));
  }

  lists.recentActivity = activity.map<ActivityEvent>((a) => ({
    id: String(a._id),
    assetId: a.assetId,
    type: a.type,
    description: a.description,
    actor: a.actor,
    timestamp: new Date(a.timestamp).toISOString(),
  }));

  return lists;
}
