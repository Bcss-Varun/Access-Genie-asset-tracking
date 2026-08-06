import type { ComponentType } from 'react';
import type { KpiId, ModuleKey } from '@access-genie/shared';
import type { WidgetProps } from '@/components/dashboards/widgets/types';
import { MyWork, WoPipeline, WorkQueue } from '@/components/dashboards/widgets/work';
import { AlertsByType, AlertsToTriage, ExpiringCerts } from '@/components/dashboards/widgets/alerts';
import { CategoryMix, EolWatch, EstateStatus, LocationMix, TopRisks } from '@/components/dashboards/widgets/assets';
import { AiInsights, AiNarrative, RiskDistribution, UtilizationTrend } from '@/components/dashboards/widgets/intelligence';
import { ValueByCategory } from '@/components/dashboards/widgets/finance';
import { CategoryDonut, DepreciationByCategory, LiveStatus, ValueTrend } from '@/components/dashboards/widgets/value';
import {
  AssetsByLocation,
  LifecycleOverview,
  MaintenanceAnalytics,
  ScoreHistory,
  UtilizationPanel,
} from '@/components/dashboards/widgets/analytics';
import { AbcAnalysis, ReorderAlerts } from '@/components/dashboards/widgets/inventory';
import { RecentActivity } from '@/components/dashboards/widgets/activity';

/**
 * Everything the dashboard can show.
 *
 * One entry per widget, and the entry — not the page — declares where the
 * widget may sit and what grant it needs. That is what makes the dashboard
 * role-adaptive without a single conditional in the page: the resolver filters
 * this list against the session's modules, and a role that cannot read finance
 * simply never has a finance widget to place.
 *
 * `column` is a constraint, not a preference. A wide chart in the 320px rail
 * would be unreadable, so the rail-only and main-only widgets are declared as
 * such and the customize panel offers each one where it fits.
 */
export interface WidgetDef {
  id: string;
  title: string;
  /** One line in the "add widget" list — says what the widget answers. */
  description: string;
  module: ModuleKey;
  column: 'main' | 'rail' | 'both';
  /** Whether the widget fills both main-column tracks. */
  wide?: boolean;
  Component: ComponentType<WidgetProps>;
}

export const WIDGETS: WidgetDef[] = [
  // ── Work ──────────────────────────────────────────────────────────────────
  {
    id: 'work.queue',
    title: 'Work queue',
    description: 'Open work orders, soonest due first, with overdue marked.',
    module: 'maintenance',
    column: 'main',
    wide: true,
    Component: WorkQueue,
  },
  {
    id: 'work.pipeline',
    title: 'Work-order pipeline',
    description: 'How work is distributed across new, assigned, in progress and done.',
    module: 'maintenance',
    column: 'main',
    Component: WoPipeline,
  },
  {
    id: 'work.mine',
    title: 'My work',
    description: 'The work orders assigned to you personally.',
    module: 'maintenance',
    column: 'both',
    Component: MyWork,
  },

  // ── Alerts & compliance ───────────────────────────────────────────────────
  {
    id: 'alerts.triage',
    title: 'Alerts to triage',
    description: 'Everything unresolved, most severe first.',
    module: 'alerts',
    column: 'main',
    wide: true,
    Component: AlertsToTriage,
  },
  {
    id: 'alerts.byType',
    title: 'Alerts by type',
    description: 'What is generating the alert traffic.',
    module: 'alerts',
    column: 'main',
    Component: AlertsByType,
  },
  {
    id: 'compliance.certs',
    title: 'Certifications expiring',
    description: 'Certificates lapsing within 90 days.',
    module: 'compliance',
    column: 'both',
    Component: ExpiringCerts,
  },

  // ── Assets ────────────────────────────────────────────────────────────────
  {
    id: 'assets.topRisks',
    title: 'Top risk assets',
    description: 'The assets carrying the most risk right now.',
    module: 'assets',
    column: 'both',
    Component: TopRisks,
  },
  {
    id: 'assets.status',
    title: 'Estate status',
    description: 'Active, in maintenance, idle and missing at a glance.',
    module: 'assets',
    column: 'main',
    Component: EstateStatus,
  },
  {
    id: 'assets.category',
    title: 'Portfolio by category',
    description: 'Count and value of the estate by asset category.',
    module: 'assets',
    column: 'main',
    Component: CategoryMix,
  },
  {
    id: 'assets.location',
    title: 'Where things are',
    description: 'Assets grouped by the location recorded against them.',
    module: 'tracking',
    column: 'main',
    Component: LocationMix,
  },
  {
    id: 'assets.eol',
    title: 'Warranty & end-of-life',
    description: 'Warranties lapsing and assets planned for replacement.',
    module: 'assets',
    column: 'main',
    wide: true,
    Component: EolWatch,
  },

  // ── Intelligence ──────────────────────────────────────────────────────────
  {
    id: 'ai.insights',
    title: 'AI insights',
    description: 'The ranked insight feed, with act and dismiss in place.',
    module: 'ai',
    column: 'both',
    Component: AiInsights,
  },
  {
    id: 'ai.narrative',
    title: 'What changed',
    description: 'This period’s largest movements, written out in a sentence.',
    module: 'workspace',
    column: 'both',
    Component: AiNarrative,
  },
  {
    id: 'ai.risk',
    title: 'Risk distribution',
    description: 'How risk is spread across the estate, in four bands.',
    module: 'ai',
    column: 'main',
    Component: RiskDistribution,
  },
  {
    id: 'ai.utilization',
    title: 'Utilization vs downtime',
    description: 'Fleet utilization against logged maintenance labour.',
    module: 'ai',
    column: 'main',
    wide: true,
    Component: UtilizationTrend,
  },

  // ── Graphs ────────────────────────────────────────────────────────────────
  {
    id: 'finance.valueTrend',
    title: 'Asset value trend',
    description: 'Purchase, current and depreciated value over twelve months.',
    module: 'analytics',
    column: 'main',
    wide: true,
    Component: ValueTrend,
  },
  {
    id: 'finance.depreciation',
    title: 'Depreciation by category',
    description: 'How much of each category has been written down.',
    module: 'analytics',
    column: 'main',
    Component: DepreciationByCategory,
  },
  {
    id: 'assets.donut',
    title: 'Asset distribution',
    description: 'The category mix as a share of the estate, with value.',
    module: 'assets',
    column: 'main',
    Component: CategoryDonut,
  },
  {
    id: 'assets.live',
    title: 'Live asset status',
    description: 'In use, idle, in transit, under maintenance — right now.',
    module: 'assets',
    column: 'main',
    Component: LiveStatus,
  },
  {
    id: 'assets.byLocation',
    title: 'Assets by location',
    description: 'The ten locations holding the most assets.',
    module: 'assets',
    column: 'main',
    Component: AssetsByLocation,
  },
  {
    id: 'assets.lifecycle',
    title: 'Asset lifecycle',
    description: 'End of life, fully depreciated, warranty, AMC and lease thresholds.',
    module: 'assets',
    column: 'both',
    Component: LifecycleOverview,
  },
  {
    id: 'maintenance.analytics',
    title: 'Maintenance analytics',
    description: 'Six months of work by type, with cost, MTTR and MTBF.',
    module: 'maintenance',
    column: 'main',
    wide: true,
    Component: MaintenanceAnalytics,
  },
  {
    id: 'assets.utilization',
    title: 'Asset utilization',
    description: 'Fleet average, the spread across bands, and the least used.',
    module: 'ai',
    column: 'main',
    Component: UtilizationPanel,
  },
  {
    id: 'assets.scoreHistory',
    title: 'Health & utilization trend',
    description: 'Daily averages, recorded from the day snapshots began.',
    module: 'ai',
    column: 'main',
    wide: true,
    Component: ScoreHistory,
  },

  // ── Money & parts ─────────────────────────────────────────────────────────
  {
    id: 'finance.value',
    title: 'Purchase vs book value',
    description: 'What the estate cost against what it is still worth.',
    module: 'analytics',
    column: 'main',
    wide: true,
    Component: ValueByCategory,
  },
  {
    id: 'inventory.abc',
    title: 'ABC analysis',
    description: 'Where the tied-up spare-parts capital sits.',
    module: 'inventory',
    column: 'main',
    Component: AbcAnalysis,
  },
  {
    id: 'inventory.reorder',
    title: 'Reorder alerts',
    description: 'SKUs at or below their reorder point.',
    module: 'inventory',
    column: 'main',
    wide: true,
    Component: ReorderAlerts,
  },

  // ── Everything else ───────────────────────────────────────────────────────
  {
    id: 'activity.recent',
    title: 'Recent activity',
    description: 'The append-only estate feed, newest first.',
    module: 'workspace',
    column: 'rail',
    Component: RecentActivity,
  },
];

export const WIDGETS_BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

/** How each KPI is labelled and where its tile drills through to. */
export const KPI_META: Record<KpiId, { label: string; href?: string; module: ModuleKey }> = {
  totalAssets: { label: 'Assets in scope', href: '/assets', module: 'assets' },
  portfolioValue: { label: 'Purchase value', href: '/financials', module: 'analytics' },
  bookValue: { label: 'Current value', href: '/financials', module: 'analytics' },
  depreciatedValue: { label: 'Depreciated value', href: '/financials', module: 'analytics' },
  avgHealth: { label: 'Fleet health', href: '/ai/health', module: 'workspace' },
  avgUtilization: { label: 'Utilization', href: '/ai/utilization', module: 'workspace' },
  riskIndex: { label: 'Risk index', href: '/ai/predictive', module: 'ai' },
  availability: { label: 'Availability', href: '/assets', module: 'workspace' },
  missingAssets: { label: 'Missing', href: '/assets?status=Missing', module: 'workspace' },
  assetsUnderMaintenance: { label: 'Under maintenance', href: '/maintenance', module: 'workspace' },
  trackedPct: { label: 'Tagged', href: '/tracking', module: 'tracking' },
  movementVolume: { label: 'Movements', href: '/tracking/journey', module: 'tracking' },
  openWorkOrders: { label: 'Open work orders', href: '/maintenance', module: 'maintenance' },
  overdueWorkOrders: { label: 'Overdue work', href: '/maintenance', module: 'maintenance' },
  completedWorkOrders: { label: 'Work closed', href: '/maintenance', module: 'maintenance' },
  mttrHours: { label: 'MTTR', href: '/maintenance', module: 'maintenance' },
  mtbfDays: { label: 'MTBF', href: '/maintenance', module: 'maintenance' },
  maintenanceCost: { label: 'Maintenance cost', href: '/maintenance', module: 'maintenance' },
  pmCompliance: { label: 'PM compliance', href: '/pm', module: 'maintenance' },
  openAlerts: { label: 'Open alerts', href: '/alerts', module: 'alerts' },
  criticalAlerts: { label: 'Critical alerts', href: '/alerts', module: 'alerts' },
  alertResponseMins: { label: 'Response time', href: '/alerts', module: 'alerts' },
  geofenceBreaches: { label: 'Geofence breaches', href: '/tracking/geofences', module: 'tracking' },
  custodyExceptions: { label: 'Custody exceptions', href: '/custody', module: 'compliance' },
  assetsAtRisk: { label: 'Assets at risk', href: '/ai/predictive', module: 'ai' },
  predictedFailures: { label: 'Predicted failures', href: '/predictive', module: 'ai' },
  anomalies24h: { label: 'Anomalies (24h)', href: '/ai/anomaly', module: 'ai' },
  aiSavings: { label: 'AI savings', href: '/ai-insights', module: 'ai' },
  stockValue: { label: 'Stock value', href: '/inventory', module: 'inventory' },
  stockouts: { label: 'Stockouts', href: '/reorder', module: 'inventory' },
  belowReorder: { label: 'Below reorder', href: '/reorder', module: 'inventory' },
  fillRate: { label: 'Fill rate', href: '/inventory', module: 'inventory' },
  myOpenWork: { label: 'My open work', href: '/my-work', module: 'maintenance' },
  myDueToday: { label: 'Due today', href: '/my-work', module: 'maintenance' },
  myOverdue: { label: 'My overdue', href: '/my-work', module: 'maintenance' },
  myClosedThisPeriod: { label: 'Closed by me', href: '/my-work', module: 'maintenance' },
};
