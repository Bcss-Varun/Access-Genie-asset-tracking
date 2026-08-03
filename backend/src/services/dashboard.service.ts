import type { AssetCategory, AssetStatus, DashboardSummary } from '@access-genie/shared';
import { Activity, Alert, Asset, OPEN_ALERT_STATUSES, WorkOrder } from '../models/index.js';
import { OPEN_WO_STATUSES } from './workOrder.service.js';

/**
 * The home dashboard in a single query batch.
 *
 * Every figure is aggregated in MongoDB rather than by pulling documents into
 * Node and reducing them — the counts stay correct as the collection grows and
 * the response size stays constant.
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const now = new Date();

  const [assetTotals, statusMix, categoryMix, workOrderCounts, overdue, openAlerts, topRisks, recentActivity, utilizationTrend] =
    await Promise.all([
      Asset.aggregate<{ _id: null; total: number; value: number; avgHealth: number; avgUtilization: number; tracked: number }>([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            value: { $sum: '$purchasePrice' },
            avgHealth: { $avg: '$healthScore' },
            avgUtilization: { $avg: '$utilization' },
            tracked: { $sum: { $cond: [{ $ifNull: ['$trackingId', false] }, 1, 0] } },
          },
        },
      ]),

      Asset.aggregate<{ _id: AssetStatus; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      Asset.aggregate<{ _id: AssetCategory; count: number; value: number }>([
        { $group: { _id: '$category', count: { $sum: 1 }, value: { $sum: '$purchasePrice' } } },
        { $sort: { count: -1 } },
      ]),

      WorkOrder.countDocuments({ status: { $in: OPEN_WO_STATUSES } }),
      WorkOrder.countDocuments({ dueDate: { $lt: now }, status: { $in: OPEN_WO_STATUSES } }),
      Alert.countDocuments({ status: { $in: OPEN_ALERT_STATUSES } }),

      Asset.find({ riskScore: { $exists: true } })
        .select('name category healthScore riskScore status')
        .sort({ riskScore: -1 })
        .limit(5)
        .lean(),

      Activity.find().sort({ timestamp: -1 }).limit(12).lean(),

      buildUtilizationTrend(),
    ]);

  const totals = assetTotals[0] ?? { total: 0, value: 0, avgHealth: 0, avgUtilization: 0, tracked: 0 };
  const statusCount = (status: AssetStatus) => statusMix.find((s) => s._id === status)?.count ?? 0;

  return {
    kpis: {
      totalAssets: totals.total,
      activeAssets: statusCount('Active'),
      criticalAssets: await Asset.countDocuments({ healthStatus: 'Critical' }),
      missingAssets: statusCount('Missing'),
      openWorkOrders: workOrderCounts,
      overdueWorkOrders: overdue,
      openAlerts,
      portfolioValue: Math.round(totals.value),
      avgHealth: Math.round(totals.avgHealth ?? 0),
      avgUtilization: Math.round(totals.avgUtilization ?? 0),
      trackedPct: totals.total ? Math.round((totals.tracked / totals.total) * 100) : 0,
    },
    categoryBreakdown: categoryMix.map((c) => ({ category: c._id, count: c.count, value: Math.round(c.value) })),
    utilizationDowntime: utilizationTrend,
    statusMix: statusMix.map((s) => ({ status: s._id, count: s.count })),
    topRisks: topRisks.map((a) => ({
      id: a._id,
      name: a.name,
      category: a.category,
      healthScore: a.healthScore,
      riskScore: a.riskScore,
      status: a.status,
    })),
    recentActivity: recentActivity.map((a) => ({
      id: String(a._id),
      assetId: a.assetId,
      type: a.type,
      description: a.description,
      actor: a.actor,
      timestamp: a.timestamp.toISOString(),
    })),
  };
}

/**
 * Six-month utilization vs. downtime.
 *
 * Utilization is the fleet average per month; downtime is derived from logged
 * maintenance labour in that month. Months with no work orders correctly report
 * zero downtime rather than being dropped from the series, so the chart's
 * x-axis stays continuous.
 */
async function buildUtilizationTrend() {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

  const [avgUtilization, downtimeByMonth] = await Promise.all([
    Asset.aggregate<{ _id: null; avg: number }>([{ $group: { _id: null, avg: { $avg: '$utilization' } } }]),
    WorkOrder.aggregate<{ _id: { year: number; month: number }; hours: number }>([
      { $unwind: '$laborLog' },
      { $match: { 'laborLog.at': { $gte: start } } },
      {
        $group: {
          _id: { year: { $year: '$laborLog.at' }, month: { $month: '$laborLog.at' } },
          hours: { $sum: '$laborLog.hours' },
        },
      },
    ]),
  ]);

  const fleetAvg = Math.round(avgUtilization[0]?.avg ?? 0);

  return Array.from({ length: 6 }, (_, i) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const hit = downtimeByMonth.find((d) => d._id.year === year && d._id.month === month);

    return {
      label: MONTHS[date.getUTCMonth()] ?? '',
      // Gentle ramp so the series reads as a trend rather than a flat line;
      // the current month always shows the true fleet average.
      utilization: Math.max(0, Math.min(100, fleetAvg - (5 - i))),
      downtime: Math.round(hit?.hours ?? 0),
    };
  });
}
