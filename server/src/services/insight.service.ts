import type { FilterQuery } from 'mongoose';
import type { ApiMeta } from '@access-genie/shared';
import { Insight, type InsightDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { csvFilter, escapeRegex, paginate, parsePagination } from '../utils/query.js';
import type { ListQueryInput } from '../validators/common.js';

const SORTABLE = ['createdAt', 'confidence', 'impactInr', 'severity'];

type InsightListQuery = ListQueryInput & {
  type?: string;
  severity?: string;
  status?: string;
  assetId?: string;
};

export async function listInsights(query: InsightListQuery): Promise<{ items: InsightDoc[]; meta: ApiMeta }> {
  const filter: FilterQuery<InsightDoc> = {};

  const type = csvFilter(query.type);
  if (type) filter.type = type;

  const severity = csvFilter(query.severity);
  if (severity) filter.severity = severity;

  // Default to the open feed — an insight already actioned or dismissed is
  // history, and showing it by default is how a feed becomes noise.
  const status = csvFilter(query.status);
  filter.status = status ?? 'open';

  if (query.assetId) filter.assetId = query.assetId;

  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ title: rx }, { summary: rx }, { assetName: rx }];
  }

  const pagination = parsePagination(query, SORTABLE, '-createdAt');
  return paginate(Insight, filter, pagination);
}

export async function getInsight(id: string): Promise<InsightDoc> {
  const insight = await Insight.findById(id).lean<InsightDoc>();
  if (!insight) throw ApiError.notFound('Insight');
  return insight;
}

/** Mark an insight actioned or dismissed — the feed's two terminal states. */
export async function setInsightStatus(id: string, status: 'actioned' | 'dismissed'): Promise<InsightDoc> {
  const insight = await Insight.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean<InsightDoc>();
  if (!insight) throw ApiError.notFound('Insight');
  return insight;
}

/** Headline numbers for the AI insights page. */
export async function getInsightStats() {
  const [bySeverity, byType, impact] = await Promise.all([
    Insight.aggregate<{ _id: string; count: number }>([
      { $match: { status: 'open' } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]),
    Insight.aggregate<{ _id: string; count: number }>([
      { $match: { status: 'open' } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Insight.aggregate<{ _id: null; total: number; avgConfidence: number }>([
      { $match: { status: 'open' } },
      { $group: { _id: null, total: { $sum: '$impactInr' }, avgConfidence: { $avg: '$confidence' } } },
    ]),
  ]);

  return {
    open: bySeverity.reduce((sum, s) => sum + s.count, 0),
    critical: bySeverity.find((s) => s._id === 'Critical')?.count ?? 0,
    opportunities: bySeverity.find((s) => s._id === 'Opportunity')?.count ?? 0,
    impactInr: Math.round(impact[0]?.total ?? 0),
    avgConfidence: Math.round(impact[0]?.avgConfidence ?? 0),
    byType: byType.map((t) => ({ type: t._id, count: t.count })),
  };
}
