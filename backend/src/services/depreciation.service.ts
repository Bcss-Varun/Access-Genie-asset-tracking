import {
  depreciationOn,
  portfolioValueSeries,
  type DepreciationInput,
  type DepreciationPoint,
  type DepreciationState,
} from '@access-genie/shared';

/**
 * Depreciation, assembled from where this codebase actually keeps the inputs.
 *
 * The arithmetic itself is in `@access-genie/shared` so the client's asset
 * panel and this service cannot drift. What lives here is the gathering: an
 * asset's commercial terms may sit on the asset, inside its embedded
 * registration record, or only on its class template, and the answer depends on
 * which of those is present.
 *
 * Precedence, most specific first:
 *
 *   price / dates      asset.onboarding.commercial → the asset's own columns
 *   useful life        commercial → the class → five years
 *   method             asset.depreciationMethod → the class → straight-line
 *   ownership          commercial → assumed owned
 *
 * The onboarding record wins because it is what someone typed during
 * registration for this specific asset; the class is the default they were
 * accepting when they did not.
 */

export interface ClassTerms {
  usefulLifeYears: number;
  method: string;
}

/**
 * Useful life and method per class.
 *
 * Asset classes were removed, so there are no class-level terms to load and this
 * is always empty. It is kept rather than deleted because `depreciationFor` is
 * built around the lookup missing: an asset falls back to its own
 * `onboarding.commercial` terms, then to the module defaults. That fallback was
 * always the common path — most assets never had class-level overrides — so
 * removing the source changes which branch runs, not the arithmetic.
 *
 * If per-class financial terms return, this is the one function to reimplement.
 */
export async function loadClassTerms(): Promise<Map<string, ClassTerms>> {
  return new Map();
}

/** The embedded registration record, narrowed — it is stored loosely typed. */
type Commercial = {
  ownership?: string;
  purchaseDate?: string | Date;
  commissionDate?: string | Date;
  purchasePrice?: number;
  depreciationMethod?: string;
  usefulLifeYears?: number;
};

function commercialOf(asset: DepreciableAsset): Commercial | undefined {
  const record = asset.onboarding?.commercial;
  return record && typeof record === 'object' ? (record as Commercial) : undefined;
}

function classIdOf(asset: DepreciableAsset): string | undefined {
  const id = asset.onboarding?.classId;
  return typeof id === 'string' ? id : undefined;
}

/**
 * The columns depreciation needs.
 *
 * Structural rather than `Pick<AssetDoc, …>` because the callers select
 * different projections of an asset — the dashboard reads a narrow one — and
 * every field here is optional in at least one of them.
 */
export interface DepreciableAsset {
  purchasePrice?: number;
  purchaseDate?: Date | string;
  depreciationMethod?: string;
  onboarding?: Record<string, unknown>;
}

/** Fold an asset and its class into the inputs the shared formulas take. */
export function depreciationInputFor(
  asset: DepreciableAsset,
  classTerms: Map<string, ClassTerms>,
): DepreciationInput {
  const commercial = commercialOf(asset);
  const terms = classTerms.get(classIdOf(asset) ?? '');

  return {
    purchasePrice: commercial?.purchasePrice ?? asset.purchasePrice,
    purchaseDate: commercial?.purchaseDate ?? asset.purchaseDate,
    commissionDate: commercial?.commissionDate,
    usefulLifeYears: commercial?.usefulLifeYears ?? terms?.usefulLifeYears,
    method: commercial?.depreciationMethod ?? asset.depreciationMethod ?? terms?.method,
    ownership: commercial?.ownership,
  };
}

/** One asset's state today, or `null` when it cannot be depreciated at all. */
export function depreciationFor(
  asset: DepreciableAsset,
  classTerms: Map<string, ClassTerms>,
  at: Date | number = Date.now(),
): DepreciationState | null {
  return depreciationOn(depreciationInputFor(asset, classTerms), at);
}

/**
 * The first of each month from `from` to `to`, plus `to` itself.
 *
 * The trailing point matters: without it a chart drawn on the 20th ends on the
 * 1st and looks three weeks stale next to the tiles beside it.
 */
export function monthlyPointsBetween(from: Date, to: Date): { at: Date }[] {
  const points: { at: Date }[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));

  while (cursor.getTime() <= to.getTime()) {
    points.push({ at: new Date(cursor) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const last = points[points.length - 1];
  if (!last || last.at.getTime() < to.getTime()) points.push({ at: to });

  return points;
}

/**
 * Portfolio purchase / book / accumulated, month by month.
 *
 * No stored history is consulted, and none is needed: each point is the sum of
 * every asset's computed value on that date, counting only assets that had been
 * bought by then.
 */
export function portfolioSeries(
  assets: DepreciableAsset[],
  classTerms: Map<string, ClassTerms>,
  from: Date,
  to: Date,
): DepreciationPoint[] {
  const inputs = assets.map((a) => depreciationInputFor(a, classTerms));
  return portfolioValueSeries(inputs, monthlyPointsBetween(from, to));
}
