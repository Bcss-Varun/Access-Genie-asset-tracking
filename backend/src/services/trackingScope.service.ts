import type { VisibleScope } from './tenancy.service.js';
import { assertAssetVisible, visibleAssetIds } from './tenancy.service.js';
import { ApiError } from '../utils/ApiError.js';

/** Legacy tracking records use facility names. Ambiguous names fail closed. */
export function trackingFacilities(scope: VisibleScope): string[] {
  const facilities = scope.rows.filter(row => row.level === 'facility');
  return facilities.filter(row => scope.ids.has(row._id)
    && facilities.filter(other => other.name === row.name).length === 1).map(row => row.name);
}
export function facilityClause(scope: VisibleScope, field = 'facility'): Record<string, unknown> {
  return scope.coversAll ? {} : { [field]: { $in: trackingFacilities(scope) } };
}
export async function trackingClause(scope: VisibleScope): Promise<Record<string, unknown>> {
  if (scope.coversAll) return {};
  return { $or: [{ assetId: { $in: await visibleAssetIds(scope) } },
    { assetId: { $in: [null, ''] }, ...facilityClause(scope) }] };
}
export function assertTrackingFacility(scope: VisibleScope, facility?: string): void {
  if (!scope.coversAll && (!facility || !trackingFacilities(scope).includes(facility))) throw ApiError.notFound('Facility');
}
export async function assertTrackingRecord(scope: VisibleScope, row: { assetId?: string; facility?: string } | null): Promise<void> {
  if (!row) throw ApiError.notFound('Tracking record');
  if (row.assetId) await assertAssetVisible(scope, row.assetId);
  else assertTrackingFacility(scope, row.facility);
}
export function assertGlobalTracking(scope: VisibleScope): void {
  if (!scope.coversAll) throw ApiError.forbidden('This shared tracking configuration requires the full estate scope.');
}
