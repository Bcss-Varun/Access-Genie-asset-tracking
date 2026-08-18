import { z } from 'zod';
import { MAINTENANCE_PERIODS } from '@access-genie/shared';
import { blankToUndefined, csvString, isoDateString } from './common.js';

/**
 * `GET /maintenance-dashboard` query.
 *
 * Every field is optional and every one of them narrows: no parameters means
 * the whole organisation over the last 30 days. The three location parameters
 * are all scope-node ids — the screen presents them as cascading selectors, and
 * the service takes the deepest one supplied.
 *
 * Enum members are not validated here on purpose. A stale bookmark carrying a
 * value that has since been renamed should still render a dashboard, so the
 * CSV fields are parsed permissively and the service drops what it does not
 * recognise. A malformed *date*, by contrast, is refused: silently ignoring it
 * would answer a question nobody asked.
 */
export const maintenanceDashboardQuerySchema = z.object({
  period: z.enum(MAINTENANCE_PERIODS).optional(),
  from: blankToUndefined(isoDateString).optional(),
  to: blankToUndefined(isoDateString).optional(),

  organization: blankToUndefined(z.string().trim().max(64)).optional(),
  facility: blankToUndefined(z.string().trim().max(64)).optional(),
  location: blankToUndefined(z.string().trim().max(64)).optional(),

  type: csvString,
  priority: csvString,
  status: csvString,
  category: csvString,
  assetId: blankToUndefined(z.string().trim().max(64)).optional(),
  /** `?overdue=true` — the Overdue tile's drill-down. */
  overdue: z.enum(['true', 'false']).optional(),
});

export type MaintenanceDashboardQueryInput = z.infer<typeof maintenanceDashboardQuerySchema>;
