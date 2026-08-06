import type { DashboardSummary } from '@access-genie/shared';

/**
 * What every widget receives.
 *
 * The summary is the aggregate read — scoped, period-aware, computed in
 * MongoDB. Widgets that need row-level detail the summary does not carry (the
 * insight feed, spare-part levels) read the hydrated `@/lib/dataset` bindings
 * directly, which cost nothing extra because the shell has already loaded them.
 */
export interface WidgetProps {
  summary: DashboardSummary;
}
