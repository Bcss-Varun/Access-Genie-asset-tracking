// ─────────────────────────────────────────────────────────────────────────────
// Asset Financials — the one place aggregation happens.
//
// Every figure the Financials page shows — a KPI, a chart series, a table row
// — is a reduction over the same `RegisteredAsset[]` the page is currently
// scoped to, run through the functions here. Nothing here maintains its own
// number: change the filter, the array changes, and everything downstream
// re-derives from it on the next render.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ageBucket as sharedAgeBucket,
  depreciationOn,
  estimatedEolDate,
  isNearEol,
  type AgeBucket,
  type DepreciationInput,
  type DepreciationState,
} from '@access-genie/shared';
import type { LifecycleStage, RegisteredAsset } from '@access-genie/shared';
import { nowMs } from '@/lib/utils';

const DAY = 86_400_000;
const YEAR_MS = 365.25 * DAY;

/**
 * Assemble a `DepreciationInput` from a hydrated asset, with the *exact*
 * precedence `backend/src/services/depreciation.service.ts`'s
 * `depreciationInputFor` uses: the embedded registration record first (what
 * someone typed for this specific asset), the asset's own columns second,
 * class terms third (always empty today — classes were removed — reproduced
 * anyway so nothing here silently disagrees if that ever changes).
 *
 * This is the fix for a real gap the current Financials page has: it reads
 * `asset.bookValue` — a column only as fresh as the last metrics recompute —
 * instead of live-computing it the way the main dashboard does. Every figure
 * on this page is computed the same way the dashboard's are, so the two never
 * quietly disagree.
 */
export function depreciationInputFor(asset: RegisteredAsset): DepreciationInput {
  const commercial = asset.onboarding?.commercial;
  return {
    purchasePrice: commercial?.purchasePrice ?? asset.purchasePrice,
    purchaseDate: commercial?.purchaseDate ?? asset.purchaseDate,
    commissionDate: commercial?.commissionDate,
    usefulLifeYears: commercial?.usefulLifeYears,
    method: commercial?.depreciationMethod ?? asset.depreciationMethod,
    ownership: commercial?.ownership,
  };
}

export type FinancialStatusLabel = 'Retired' | 'Disposed' | 'Fully Depreciated' | 'EOL' | 'Near EOL' | 'Depreciating' | 'Not Depreciable';

export interface FinancialStatus {
  state: DepreciationState | null;
  ageYears: number;
  ageBucket: AgeBucket;
  estimatedEol: Date | null;
  nearEol: boolean;
  /** One label — what the register's "Financial Status" column shows. */
  status: FinancialStatusLabel;
}

/**
 * Everything the Financials screens need about one asset, on one date.
 *
 * `Fully Depreciated` and `EOL` are kept distinct on purpose — they answer
 * different questions. Straight-line reaches salvage exactly when age crosses
 * useful life, but written-down-value decays asymptotically and can still
 * carry book value well past that point, so "the books say it's worth
 * nothing" and "it has outlived its planned life" are not always the same
 * asset.
 */
export function financialStateFor(asset: RegisteredAsset, at: Date | number = nowMs()): FinancialStatus {
  const input = depreciationInputFor(asset);
  const state = depreciationOn(input, at);
  const ageYears = Math.max(0, (Number(at) - Date.parse(asset.purchaseDate)) / YEAR_MS);
  const nearEol = state ? isNearEol(state) : false;
  const pastEol = state ? state.lifeUsed >= 1 : false;

  const status: FinancialStatusLabel =
    asset.lifecycleStage === 'Disposed'
      ? 'Disposed'
      : asset.lifecycleStage === 'Retired'
        ? 'Retired'
        : !state
          ? 'Not Depreciable'
          : state.fullyDepreciated
            ? 'Fully Depreciated'
            : pastEol
              ? 'EOL'
              : nearEol
                ? 'Near EOL'
                : 'Depreciating';

  return {
    state,
    ageYears,
    ageBucket: sharedAgeBucket(ageYears),
    estimatedEol: estimatedEolDate(input, at),
    nearEol,
    status,
  };
}

/** One row of an aggregated table — facility, room or category, all the same shape. */
export interface FinancialAggregate {
  key: string;
  count: number;
  purchase: number;
  book: number;
  depreciation: number;
  /** `depreciation / purchase`, 0 when there is no basis to divide by. */
  depreciationPct: number;
  avgAgeYears: number;
  eolCount: number;
}

/** Group a filtered fleet by any key — facility, room, category — one implementation. */
export function aggregateBy(
  assets: RegisteredAsset[],
  keyFn: (a: RegisteredAsset) => string,
  at: Date | number = nowMs(),
): FinancialAggregate[] {
  const byKey = new Map<string, { assets: RegisteredAsset[]; purchase: number; book: number; ageSum: number; eol: number }>();

  for (const asset of assets) {
    const key = keyFn(asset);
    const bucket = byKey.get(key) ?? { assets: [], purchase: 0, book: 0, ageSum: 0, eol: 0 };
    const fin = financialStateFor(asset, at);

    bucket.assets.push(asset);
    bucket.purchase += fin.state?.purchasePrice ?? asset.purchasePrice;
    bucket.book += fin.state?.bookValue ?? 0;
    bucket.ageSum += fin.ageYears;
    if (fin.status === 'EOL' || fin.status === 'Near EOL' || fin.status === 'Retired') bucket.eol += 1;

    byKey.set(key, bucket);
  }

  return [...byKey.entries()]
    .map(([key, b]) => ({
      key,
      count: b.assets.length,
      purchase: Math.round(b.purchase),
      book: Math.round(b.book),
      depreciation: Math.round(b.purchase - b.book),
      depreciationPct: b.purchase > 0 ? Math.round(((b.purchase - b.book) / b.purchase) * 100) : 0,
      avgAgeYears: b.assets.length ? Math.round((b.ageSum / b.assets.length) * 10) / 10 : 0,
      eolCount: b.eol,
    }))
    .sort((x, y) => y.book - x.book);
}

// ── Calendar periods ─────────────────────────────────────────────────────────

export type DateRangeKind = 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'lastQuarter' | 'thisYear' | 'lastYear' | 'custom';
export type Granularity = 'monthly' | 'quarterly' | 'yearly';

export interface PeriodBucket {
  label: string;
  /** The point sampled for stock metrics (book value, accumulated depreciation, fleet size) — end of bucket, clamped to now. */
  at: Date;
  /** The span summed for flow metrics (acquisition spend) — clamped to the overall range. */
  rangeStart: Date;
  rangeEnd: Date;
}

export interface Period {
  from: Date;
  to: Date;
  buckets: PeriodBucket[];
}

const QUARTER_OF = (m: number) => Math.floor(m / 3);

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function startOfQuarter(d: Date): Date {
  return new Date(d.getFullYear(), QUARTER_OF(d.getMonth()) * 3, 1);
}
function endOfQuarter(d: Date): Date {
  return new Date(d.getFullYear(), QUARTER_OF(d.getMonth()) * 3 + 3, 0, 23, 59, 59, 999);
}
function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}
function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}

/**
 * Resolve a preset (or custom range) plus a granularity into the concrete
 * date span and the buckets a trend chart draws. Calendar-aligned (Jan–Dec
 * quarters/years), not fiscal-year — the one place this decision is made, so
 * "This Quarter" means the same thing in the KPI row and the trend chart.
 */
export function periodBounds(kind: DateRangeKind, granularity: Granularity, custom?: { from: string; to: string }): Period {
  const now = new Date(nowMs());
  let from: Date;
  let to: Date;

  switch (kind) {
    case 'thisMonth':
      from = startOfMonth(now);
      to = now;
      break;
    case 'lastMonth': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      from = startOfMonth(prev);
      to = endOfMonth(prev);
      break;
    }
    case 'thisQuarter':
      from = startOfQuarter(now);
      to = now;
      break;
    case 'lastQuarter': {
      const prev = new Date(now.getFullYear(), QUARTER_OF(now.getMonth()) * 3 - 1, 1);
      from = startOfQuarter(prev);
      to = endOfQuarter(prev);
      break;
    }
    case 'thisYear':
      from = startOfYear(now);
      to = now;
      break;
    case 'lastYear': {
      const prev = new Date(now.getFullYear() - 1, 0, 1);
      from = startOfYear(prev);
      to = endOfYear(prev);
      break;
    }
    case 'custom':
      from = custom?.from ? new Date(custom.from) : startOfYear(now);
      to = custom?.to ? new Date(`${custom.to}T23:59:59.999`) : now;
      break;
  }

  return { from, to, buckets: buildBuckets(from, to, granularity, now) };
}

function buildBuckets(from: Date, to: Date, granularity: Granularity, now: Date): PeriodBucket[] {
  const buckets: PeriodBucket[] = [];
  const spansYears = to.getFullYear() !== from.getFullYear();

  if (granularity === 'monthly') {
    const cursor = startOfMonth(from);
    while (cursor <= to) {
      const rangeStart = cursor < from ? from : cursor;
      const rangeEnd = endOfMonth(cursor) > to ? to : endOfMonth(cursor);
      const label = cursor.toLocaleDateString('en-US', { month: 'short', ...(spansYears ? { year: '2-digit' } : {}) });
      buckets.push({ label, at: rangeEnd > now ? now : rangeEnd, rangeStart, rangeEnd });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else if (granularity === 'quarterly') {
    const cursor = startOfQuarter(from);
    while (cursor <= to) {
      const rangeStart = cursor < from ? from : cursor;
      const qEnd = endOfQuarter(cursor);
      const rangeEnd = qEnd > to ? to : qEnd;
      buckets.push({
        label: `Q${QUARTER_OF(cursor.getMonth()) + 1} ${cursor.getFullYear()}`,
        at: rangeEnd > now ? now : rangeEnd,
        rangeStart,
        rangeEnd,
      });
      cursor.setMonth(cursor.getMonth() + 3);
    }
  } else {
    const cursor = startOfYear(from);
    while (cursor <= to) {
      const rangeStart = cursor < from ? from : cursor;
      const yEnd = endOfYear(cursor);
      const rangeEnd = yEnd > to ? to : yEnd;
      buckets.push({
        label: String(cursor.getFullYear()),
        at: rangeEnd > now ? now : rangeEnd,
        rangeStart,
        rangeEnd,
      });
      cursor.setFullYear(cursor.getFullYear() + 1);
    }
  }

  return buckets;
}

export type TrendMetric = 'acquisition' | 'bookValue' | 'depreciation' | 'assetCount';

/**
 * One number per bucket, for the Financial Trend chart's metric toggle.
 *
 * Acquisition is the one *flow* metric here — spend that happened during the
 * bucket — because "how much did we spend this quarter" is what a person
 * means by it. Book Value, Depreciation and Asset Count are *stock* metrics —
 * the portfolio's state as of the bucket's end — paired the same way
 * `portfolioValueSeries` already pairs purchase/book/accumulated: what the
 * fleet looked like at that point in time, not what changed during it.
 */
export function financialSeries(assets: RegisteredAsset[], buckets: PeriodBucket[], metric: TrendMetric): number[] {
  return buckets.map((bucket) => {
    if (metric === 'acquisition') {
      return Math.round(
        assets
          .filter((a) => {
            const t = Date.parse(a.purchaseDate);
            return t >= bucket.rangeStart.getTime() && t <= bucket.rangeEnd.getTime();
          })
          .reduce((sum, a) => sum + a.purchasePrice, 0),
      );
    }

    const atMs = bucket.at.getTime();
    const present = assets.filter((a) => Date.parse(a.purchaseDate) <= atMs);

    if (metric === 'assetCount') return present.length;

    let book = 0;
    let purchase = 0;
    for (const a of present) {
      const state = depreciationOn(depreciationInputFor(a), atMs);
      if (!state) continue;
      book += state.bookValue;
      purchase += state.purchasePrice;
    }
    return Math.round(metric === 'bookValue' ? book : purchase - book);
  });
}

export const TREND_METRIC_LABEL: Record<TrendMetric, string> = {
  acquisition: 'Acquisition Value',
  bookValue: 'Book Value',
  depreciation: 'Depreciation',
  assetCount: 'Asset Count',
};

/** For the register's Financial Status filter and any place that needs the full label set. */
export const FINANCIAL_STATUSES: FinancialStatusLabel[] = [
  'Depreciating',
  'Near EOL',
  'EOL',
  'Fully Depreciated',
  'Retired',
  'Disposed',
  'Not Depreciable',
];

/** Facility name for an asset — the one place this mapping is written. */
export const facilityOf = (a: RegisteredAsset): string => a.location.name;
/** "Asset Room / Warehouse" — `location.zone`, the finest existing location field. See plan §2. */
export const roomOf = (a: RegisteredAsset): string => a.location.zone || 'Unassigned';

export const EOL_STAGES: LifecycleStage[] = ['Retired', 'Disposed'];

/** Runtime companion to the `AgeBucket` union — iteration order for the aging table/filter. */
export const AGE_BUCKETS: AgeBucket[] = ['<1', '1-3', '3-5', '5-7', '7+'];
