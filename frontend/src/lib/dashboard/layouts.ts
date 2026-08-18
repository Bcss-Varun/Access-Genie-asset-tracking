import type { DashboardLayout, RoleId } from '@access-genie/shared';

/**
 * What each role opens on.
 *
 * These are compositions, not permission lists — the grant filter runs
 * afterwards in `resolve.ts`, so a layout naming a widget the role cannot read
 * is harmless. They are written for the job rather than the org chart: a
 * technician's dashboard opens on their own queue because that is their entire
 * working day, and an executive's opens on value and risk because they will
 * never assign a work order.
 *
 * Two rules run through all of them:
 *
 *   · The order is the reading order. Whatever is first is what someone sees
 *     without scrolling, and that is the decision each of these encodes.
 *   · The KPI row mixes stock and flow. A row of stock-only tiles renders
 *     without a single sparkline or delta chip, which makes a dashboard that
 *     *can* compare periods look like one that cannot.
 */
export const ROLE_LAYOUTS: Record<RoleId, DashboardLayout> = {
  // Sees everything, so the layout has to choose rather than show it all.
  super_admin: {
    kpis: ['totalAssets', 'bookValue', 'depreciatedValue', 'openWorkOrders', 'assetsUnderMaintenance', 'avgUtilization', 'avgHealth', 'openAlerts'],
    main: [
      'finance.valueTrend',
      'assets.donut',
      'assets.byLocation',
      'maintenance.analytics',
      'assets.utilization',
      'assets.live',
      'alerts.triage',
      'work.queue',
      // Last, because it is the one chart that starts empty and fills in from
      // the day snapshots begin — it should not be the first thing anyone sees.
      'assets.scoreHistory',
    ],
    rail: ['ai.narrative', 'assets.lifecycle', 'ai.insights', 'assets.topRisks', 'activity.recent'],
  },
  org_admin: {
    kpis: ['totalAssets', 'bookValue', 'depreciatedValue', 'openWorkOrders', 'assetsUnderMaintenance', 'avgUtilization', 'avgHealth', 'openAlerts'],
    main: [
      'finance.valueTrend',
      'assets.donut',
      'assets.byLocation',
      'maintenance.analytics',
      'assets.live',
      'assets.utilization',
      'alerts.triage',
    ],
    rail: ['ai.narrative', 'assets.lifecycle', 'ai.insights', 'compliance.certs', 'activity.recent'],
  },

  // Runs a building: what is broken, what is missing, what is waiting on a person.
  facility_manager: {
    kpis: ['availability', 'openWorkOrders', 'completedWorkOrders', 'assetsUnderMaintenance', 'missingAssets', 'criticalAlerts'],
    main: ['alerts.triage', 'work.queue', 'assets.live', 'assets.byLocation', 'maintenance.analytics', 'assets.status'],
    rail: ['ai.narrative', 'work.mine', 'assets.lifecycle', 'ai.insights', 'activity.recent'],
  },

  // Runs the maintenance programme: pipeline, compliance, cost, and what fails next.
  maintenance_manager: {
    kpis: ['pmCompliance', 'openWorkOrders', 'overdueWorkOrders', 'mttrHours', 'mtbfDays', 'maintenanceCost'],
    main: ['maintenance.analytics', 'work.pipeline', 'ai.utilization', 'work.queue'],
    rail: ['work.mine', 'assets.lifecycle', 'ai.insights', 'assets.topRisks', 'activity.recent'],
  },

  // Field: their own queue first, everything else second — and no estate-wide
  // charts at all, which they can neither act on nor, in most cases, read.
  technician: {
    kpis: ['myOpenWork', 'myDueToday', 'myOverdue', 'myClosedThisPeriod'],
    main: ['work.queue', 'assets.byLocation', 'assets.topRisks'],
    rail: ['work.mine', 'activity.recent'],
  },

  // Reads, never edits: portfolio, depreciation, risk, and what the models
  // claim they saved. No queues — an executive cannot action a work order.
  executive: {
    kpis: ['totalAssets', 'portfolioValue', 'bookValue', 'depreciatedValue', 'avgUtilization', 'avgHealth', 'riskIndex', 'aiSavings'],
    main: ['finance.valueTrend', 'assets.donut', 'finance.depreciation', 'assets.utilization', 'ai.risk'],
    rail: ['ai.narrative', 'assets.lifecycle', 'ai.insights', 'compliance.certs'],
  },

  // Loss prevention: breaches, custody, and where things physically are.
  security_officer: {
    kpis: ['criticalAlerts', 'openAlerts', 'geofenceBreaches', 'custodyExceptions', 'missingAssets'],
    main: ['alerts.triage', 'assets.live', 'assets.byLocation', 'alerts.byType'],
    rail: ['ai.narrative', 'compliance.certs', 'activity.recent'],
  },
};
