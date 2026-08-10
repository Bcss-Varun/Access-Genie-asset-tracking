// ─────────────────────────────────────────────────────────────────────────────
// Depreciation — the one place the arithmetic lives.
//
// `Asset.bookValue` is a stored column that, until this module existed, nothing
// ever wrote: whatever a seed put there stayed there forever, and every "book
// value", "depreciated value" and "TCO" figure in the product was quoting it.
// The Asset 360 commercial panel had its own straight-line derivation in the
// client, which meant two answers to the same question the moment either moved.
//
// So the maths is here, in the contract package, and both sides call it — the
// backend to materialise `bookValue` and to build the portfolio value trend, the
// client to render one asset's schedule.
//
// The important property, and the reason the dashboard's value chart needs no
// stored history: **book value on any past date is arithmetic, not a
// measurement.** Given a price, a date and a life, the value six months ago is
// exactly computable today. Nothing has to have been recorded at the time.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

/** Default life when neither the asset nor its class says otherwise. */
export const DEFAULT_USEFUL_LIFE_YEARS = 5;

/**
 * What an asset is worth at the end of its life.
 *
 * Nothing in the model carries a residual value, so it is zero — but it is a
 * named constant rather than a literal `0` scattered through the formulas, so
 * adding the field later is one edit here plus one parameter.
 */
export const DEFAULT_SALVAGE_VALUE = 0;

export type DepreciationMethod = 'straight-line' | 'written-down-value';

/**
 * Everything the formulas need, gathered from wherever it happens to live.
 *
 * Deliberately loose: the caller assembles it from `Asset`, from
 * `asset.onboarding.commercial`, or from the class template, and any of those
 * may be missing. A missing input means "no answer", never a guessed one.
 */
export interface DepreciationInput {
  purchasePrice?: number | null;
  /** Depreciation starts when the asset went into service, else when it was bought. */
  purchaseDate?: string | Date | null;
  commissionDate?: string | Date | null;
  usefulLifeYears?: number | null;
  /** Free text in the model — "Straight-line (5yr)", "WDV 40%". Parsed leniently. */
  method?: string | null;
  /** Leased assets are not capitalised, so they carry no book value. */
  ownership?: string | null;
  salvageValue?: number | null;
}

export interface DepreciationState {
  /** What it cost. */
  purchasePrice: number;
  /** What it is worth on the date asked about. */
  bookValue: number;
  /** What has been written off by then. */
  accumulated: number;
  /** How far through its life it is, 0–1. */
  lifeUsed: number;
  method: DepreciationMethod;
  usefulLifeYears: number;
  /** True once the asset has reached salvage — the "fully depreciated" count. */
  fullyDepreciated: boolean;
}

/** One row of a year-by-year schedule. */
export interface DepreciationScheduleRow {
  year: number;
  opening: number;
  charge: number;
  closing: number;
}

/** One point on the portfolio value trend. */
export interface DepreciationPoint {
  /** ISO date of the point — the first of the month, for a monthly series. */
  at: string;
  purchase: number;
  book: number;
  accumulated: number;
}

// ── Parsing what the model actually stores ───────────────────────────────────

const toMs = (value: string | Date | null | undefined): number | null => {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

/**
 * Which method a free-text label means.
 *
 * `depreciationMethod` is a `String` on both the asset and the class, filled by
 * a form and by seed fixtures — "Straight-line (5yr)", "WDV", "Reducing
 * balance". Anything not recognisably declining is treated as straight-line,
 * which is both the commonest case and the conservative reading.
 */
export function parseDepreciationMethod(label?: string | null): DepreciationMethod {
  return label && /written[-\s]?down|\bwdv\b|declining|reducing/i.test(label)
    ? 'written-down-value'
    : 'straight-line';
}

/** A life written into the method label — "Straight-line (5yr)" → 5. */
export function parseUsefulLifeFromMethod(label?: string | null): number | null {
  const match = label?.match(/(\d{1,2})\s*(?:yr|year)/i);
  if (!match?.[1]) return null;
  const years = Number(match[1]);
  return years >= 1 && years <= 40 ? years : null;
}

// ── The calculation ──────────────────────────────────────────────────────────

/**
 * State of one asset's depreciation on a given date.
 *
 * Returns `null` when the asset cannot be depreciated at all — no price, no
 * date, or leased rather than owned. That is a different answer from zero, and
 * the callers render it differently: an em-dash, not "₹0".
 */
export function depreciationOn(input: DepreciationInput, at: Date | number = Date.now()): DepreciationState | null {
  const price = input.purchasePrice ?? 0;
  if (price <= 0) return null;

  // Leased assets sit on someone else's balance sheet.
  if (input.ownership && input.ownership !== 'Owned') return null;

  // In service beats bought: an asset in a crate for three months has not been
  // wearing out. Falls back to the purchase date, which is what most rows have.
  const start = toMs(input.commissionDate) ?? toMs(input.purchaseDate);
  if (start === null) return null;

  const asOf = at instanceof Date ? at.getTime() : at;
  const usefulLifeYears =
    input.usefulLifeYears ?? parseUsefulLifeFromMethod(input.method) ?? DEFAULT_USEFUL_LIFE_YEARS;
  const salvage = Math.min(input.salvageValue ?? DEFAULT_SALVAGE_VALUE, price);
  const method = parseDepreciationMethod(input.method);

  // Before it was bought it had not been paid for either: report it at cost
  // rather than pretending to a negative age.
  const ageDays = Math.max(0, (asOf - start) / DAY);
  const lifeDays = usefulLifeYears * DAYS_PER_YEAR;
  const lifeUsed = lifeDays > 0 ? Math.min(1, ageDays / lifeDays) : 1;

  let bookValue: number;
  if (method === 'straight-line') {
    bookValue = price - (price - salvage) * lifeUsed;
  } else {
    // Double-declining balance: twice the straight-line rate, applied to the
    // written-down value, floored at salvage. Continuous rather than annual
    // steps so the value trend is a curve and not a staircase.
    const rate = 2 / usefulLifeYears;
    const years = ageDays / DAYS_PER_YEAR;
    bookValue = Math.max(salvage, price * Math.pow(1 - rate, years));
  }

  bookValue = Math.max(salvage, Math.round(bookValue));

  return {
    purchasePrice: price,
    bookValue,
    accumulated: Math.max(0, price - bookValue),
    lifeUsed,
    method,
    usefulLifeYears,
    fullyDepreciated: bookValue <= salvage,
  };
}

/** Book value alone, for the callers that want only the number. */
export function bookValueOn(input: DepreciationInput, at: Date | number = Date.now()): number | null {
  return depreciationOn(input, at)?.bookValue ?? null;
}

/**
 * Age bucket for the aging table — one place the boundaries live, so a
 * dashboard and a register can't quietly draw the line between "1-3" and
 * "3-5" years differently.
 */
export type AgeBucket = '<1' | '1-3' | '3-5' | '5-7' | '7+';

export function ageBucket(years: number): AgeBucket {
  if (years < 1) return '<1';
  if (years < 3) return '1-3';
  if (years < 5) return '3-5';
  if (years < 7) return '5-7';
  return '7+';
}

/**
 * Estimated end-of-life date — `Asset` carries no such field, so this is
 * arithmetic, not a stored value, on the same "no measurement needed" basis
 * as `bookValueOn`: purchase (or commissioning) date plus the useful life
 * that already governs the depreciation schedule. Callers must present this
 * as an estimate — nothing in the model asserts an asset will actually be
 * retired on this date.
 */
export function estimatedEolDate(input: DepreciationInput, at: Date | number = Date.now()): Date | null {
  const state = depreciationOn(input, at);
  if (!state) return null;

  const start = toMs(input.commissionDate) ?? toMs(input.purchaseDate);
  if (start === null) return null;

  return new Date(start + state.usefulLifeYears * DAYS_PER_YEAR * DAY);
}

/**
 * "Near EOL" — within the last year of useful life. The same threshold
 * `dashboard.service.ts`'s lifecycle widget already uses
 * (`lifeUsed >= 1 - 1/usefulLifeYears`), reproduced here so a second caller
 * of this module can't drift onto a different definition of "near".
 */
export function isNearEol(state: Pick<DepreciationState, 'lifeUsed' | 'usefulLifeYears'>): boolean {
  return state.lifeUsed >= 1 - 1 / (state.usefulLifeYears || 1);
}

/**
 * The year-by-year schedule, for the per-asset commercial panel.
 *
 * Each row closes where the next opens, so the column adds up — a schedule
 * whose rows do not reconcile is worse than no schedule.
 */
export function depreciationScheduleFor(input: DepreciationInput): DepreciationScheduleRow[] {
  const start = toMs(input.commissionDate) ?? toMs(input.purchaseDate);
  const first = depreciationOn(input, start ?? Date.now());
  if (!first || start === null) return [];

  const startYear = new Date(start).getUTCFullYear();
  const rows: DepreciationScheduleRow[] = [];

  for (let i = 0; i < Math.ceil(first.usefulLifeYears); i++) {
    const opening = i === 0 ? first.purchasePrice : (rows[i - 1]?.closing ?? 0);
    const closing = bookValueOn(input, start + (i + 1) * DAYS_PER_YEAR * DAY) ?? opening;
    rows.push({ year: startYear + i, opening, charge: Math.max(0, opening - closing), closing });
  }

  return rows;
}

/**
 * The portfolio's value month by month — the dashboard's headline chart.
 *
 * `purchase` counts only what had been bought by that month, so the cost line
 * steps up as the estate grows rather than back-dating today's estate to a year
 * ago and reporting a fleet that did not exist.
 */
export function portfolioValueSeries(
  assets: DepreciationInput[],
  months: { at: Date }[],
): DepreciationPoint[] {
  return months.map(({ at }) => {
    let purchase = 0;
    let book = 0;

    for (const asset of assets) {
      const start = toMs(asset.commissionDate) ?? toMs(asset.purchaseDate);
      if (start === null || start > at.getTime()) continue;

      const state = depreciationOn(asset, at);
      if (!state) continue;

      purchase += state.purchasePrice;
      book += state.bookValue;
    }

    return {
      at: at.toISOString(),
      purchase: Math.round(purchase),
      book: Math.round(book),
      accumulated: Math.round(purchase - book),
    };
  });
}
