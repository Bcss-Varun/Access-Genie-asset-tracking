import type { Request, Response } from 'express';
import {
  ASSET_CATEGORIES,
  MAINTENANCE_KINDS,
  MAINTENANCE_STATUSES,
  WORK_ORDER_PRIORITIES,
  type AssetCategory,
  type MaintenanceKind,
  type MaintenanceStatus,
  type WorkOrderPriority,
} from '@access-genie/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { getMaintenanceDashboard } from '../services/maintenanceDashboard.service.js';
import type { MaintenanceDashboardQueryInput } from '../validators/maintenanceDashboard.validator.js';

/**
 * Turn a CSV parameter into the subset of an enum it names.
 *
 * Unrecognised members are dropped rather than refused — a bookmark from a
 * build where a status was spelled differently should still render — and a
 * parameter that names *nothing* valid becomes `undefined`, which the service
 * reads as "no filter" instead of as "match none".
 */
function csvEnum<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] | undefined {
  if (!raw) return undefined;
  const wanted = new Set(raw.split(',').map((part) => part.trim()));
  const matched = allowed.filter((value) => wanted.has(value));
  return matched.length > 0 ? matched : undefined;
}

/** The whole maintenance picture for one scope, one range and one cut. */
export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as MaintenanceDashboardQueryInput;

  const parseDate = (value?: string) => {
    if (!value) return undefined;
    const at = new Date(value);
    return Number.isNaN(at.getTime()) ? undefined : at;
  };

  sendData(
    res,
    await getMaintenanceDashboard({
      period: query.period,
      from: parseDate(query.from),
      to: parseDate(query.to),
      organization: query.organization,
      facility: query.facility,
      location: query.location,
      kinds: csvEnum<MaintenanceKind>(query.type, MAINTENANCE_KINDS),
      priorities: csvEnum<WorkOrderPriority>(query.priority, WORK_ORDER_PRIORITIES),
      statuses: csvEnum<MaintenanceStatus>(query.status, MAINTENANCE_STATUSES),
      categories: csvEnum<AssetCategory>(query.category, ASSET_CATEGORIES),
      assetId: query.assetId,
      overdue: query.overdue === 'true',
    }),
  );
});
