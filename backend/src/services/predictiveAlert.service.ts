import type { PipelineStage } from 'mongoose';
import {
  OPEN_PREDICTIVE_STATUSES,
  PREDICTIVE_ALERT_SOURCES,
  PREDICTIVE_ALERT_STATUSES,
  PREDICTIVE_ALERT_TRANSITIONS,
  PREDICTIVE_ALERT_TYPES,
  PREDICTIVE_SEVERITIES,
  type ApiMeta,
  type PredictiveAlertDetail,
  type PredictiveAlertFacets,
  type PredictiveAlertPlacement,
  type PredictiveAlertSource,
  type PredictiveAlertStats,
  type PredictiveAlertStatus,
  type PredictiveAlertType,
  type PredictiveSeverity,
} from '@access-genie/shared';
import {
  Activity,
  Asset,
  PredictiveAlert,
  ScopeNodeModel,
  WorkOrder,
  nextId,
  type PredictiveAlertDoc,
  type ScopeNodeDoc,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import { markEstateChanged } from './derivation.scheduler.js';
import { descendantIds } from './scopeFilter.service.js';
import { buildMeta } from '../utils/response.js';
import { escapeRegex, parsePagination } from '../utils/query.js';
import { createWorkOrder } from './workOrder.service.js';
import type {
  CreatePredictiveAlertInput,
  PredictiveAlertListQuery,
  RaisePredictiveWorkOrderInput,
} from '../validators/predictiveAlert.validator.js';

/**
 * Predictive Alerts.
 *
 * This module stores and works alerts. It does not produce them, and the
 * distinction is the whole design: there is no predictive model in the platform
 * yet, so anything this file invented would be a number with nothing behind it.
 * What it provides instead is the half that a model cannot bring with it — an
 * identity, a lifecycle, an audit trail, and a route from "this will fail" to a
 * real work order somebody is holding.
 *
 * Three rules carry most of the behaviour:
 *
 * **Every figure on screen is counted from stored rows.** The summary cards run
 * the same filters as the list beneath them, so the numbers describe the cut in
 * view. Nothing is a constant and nothing is a client-side tally.
 *
 * **Creating work is creating a work order.** `raiseWorkOrder` goes through
 * `workOrder.service.createWorkOrder`, which is the same path the Work Orders
 * screen uses — so the order gets its id from the same sequence, its lifecycle
 * transition, its activity entry and its history, and appears on the board. An
 * alert that incremented a counter would be a lie that survives until reload.
 *
 * **Provenance is never invented.** A manually raised alert cannot carry a
 * detector, and the API refuses the combination rather than quietly storing it.
 */

const SORTABLE = ['detectedAt', 'confidence', 'severity', 'status', 'createdAt', 'updatedAt', 'assetName'];
const ASSET_COLLECTION = Asset.collection.name;

/**
 * The confidence at or above which an alert counts as high-confidence.
 *
 * One constant, used by the summary card, the `minConfidence` default and the
 * card's own label — a threshold the screen states differently from the query
 * that produced it is a screen nobody can audit.
 */
export const HIGH_CONFIDENCE_THRESHOLD = 80;

// ─────────────────────────────────────────────────────────────────────────────
// Placement
// ─────────────────────────────────────────────────────────────────────────────

interface Hierarchy {
  byId: Map<string, ScopeNodeDoc>;
  rows: ScopeNodeDoc[];
}

async function loadHierarchy(): Promise<Hierarchy> {
  const rows = await ScopeNodeModel.find().lean<ScopeNodeDoc[]>();
  return { rows, byId: new Map(rows.map((r) => [r._id, r])) };
}

function nearestAncestor(byId: Map<string, ScopeNodeDoc>, start: string, level: string): ScopeNodeDoc | null {
  const seen = new Set<string>();
  let node = byId.get(start);
  while (node && !seen.has(node._id)) {
    seen.add(node._id); // a cycle in the adjacency list would otherwise spin forever
    if (node.level === level) return node;
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return null;
}

/**
 * Facility and organisation, resolved from the asset.
 *
 * Not stored on the alert, for the same reason work orders and inspections do
 * not store it: an asset that moves would leave every historic record naming the
 * wrong site, with nothing to detect the drift.
 */
function placementFor(hierarchy: Hierarchy, location: { id?: string; name?: string } | undefined): PredictiveAlertPlacement {
  const locationId = location?.id ?? null;
  const facility = locationId ? nearestAncestor(hierarchy.byId, locationId, 'facility') : null;
  const organization = locationId ? nearestAncestor(hierarchy.byId, locationId, 'org') : null;

  return {
    facilityId: facility?._id ?? null,
    facilityName: facility?.name ?? 'Unassigned',
    organizationId: organization?._id ?? null,
    organizationName: organization?.name ?? 'Unassigned',
    locationId,
    locationName: location?.name ?? 'Unassigned',
  };
}

type JoinedAlert = PredictiveAlertDoc & { __asset?: { location?: { id?: string; name?: string } } };

function present(rows: JoinedAlert[], hierarchy: Hierarchy): PredictiveAlertDoc[] {
  return rows.map((row) => {
    const { __asset, ...rest } = row;
    return { ...rest, placement: placementFor(hierarchy, __asset?.location) } as PredictiveAlertDoc;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────────────────────

function csvEnum<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] | undefined {
  if (!raw) return undefined;
  const wanted = new Set(raw.split(',').map((part) => part.trim()));
  const matched = allowed.filter((value) => wanted.has(value));
  return matched.length > 0 ? matched : undefined;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

async function facilitySubtree(facilityId: string): Promise<string[] | null> {
  const rows = await ScopeNodeModel.find().lean<ScopeNodeDoc[]>();
  const node = rows.find((r) => r._id === facilityId);
  if (!node) throw ApiError.notFound('Facility');
  // A parentless node covers everything, so it resolves to no filter rather
  // than a set that would wrongly exclude assets with no location.
  if (!node.parentId) return null;
  return [...descendantIds(rows, facilityId)];
}

/**
 * The stages every alert read shares — list, stats and facets alike.
 *
 * Built once so the summary cards cannot drift from the table beneath them: if
 * "Open alerts" and the list disagree about what the filter means, the cards
 * stop being read at all.
 */
async function matchStages(query: Partial<PredictiveAlertListQuery>): Promise<PipelineStage[]> {
  const stages: PipelineStage[] = [];
  const match: Record<string, unknown> = {};

  const status = csvEnum(query.status, PREDICTIVE_ALERT_STATUSES);
  const severity = csvEnum(query.severity, PREDICTIVE_SEVERITIES);
  const type = csvEnum(query.type, PREDICTIVE_ALERT_TYPES);
  const source = csvEnum(query.source, PREDICTIVE_ALERT_SOURCES);

  if (severity) match.severity = { $in: severity };
  if (type) match.type = { $in: type };
  if (source) match.source = { $in: source };

  // `?open=true` narrows whatever status filter is already set rather than
  // replacing it — asking for "open" and "Dismissed" at once is a contradiction,
  // and returning the dismissed ones anyway would be answering a question nobody
  // asked.
  if (query.open === 'true') {
    match.status = { $in: status ? status.filter((s) => OPEN_PREDICTIVE_STATUSES.includes(s)) : OPEN_PREDICTIVE_STATUSES };
  } else if (status) {
    match.status = { $in: status };
  }

  if (query.assetId) match.assetId = query.assetId;
  if (query.minConfidence !== undefined) match.confidence = { $gte: query.minConfidence };

  const from = parseDate(query.from);
  const to = parseDate(query.to);
  if (from || to) {
    // `to` is an inclusive day when a bare date is given: `?to=2026-08-17` must
    // include that day's alerts, not stop at its first millisecond.
    const end = to && !String(query.to).includes('T') ? new Date(to.getTime() + 86_399_999) : to;
    match.detectedAt = { ...(from ? { $gte: from } : {}), ...(end ? { $lte: end } : {}) };
  }

  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    match.$or = [{ title: rx }, { assetName: rx }, { reason: rx }, { _id: rx }, { assetId: rx }];
  }

  if (Object.keys(match).length > 0) stages.push({ $match: match });

  stages.push(
    { $lookup: { from: ASSET_COLLECTION, localField: 'assetId', foreignField: '_id', as: '__asset' } },
    { $unwind: { path: '$__asset', preserveNullAndEmptyArrays: true } },
  );

  if (query.facility) {
    const ids = await facilitySubtree(query.facility);
    if (ids) stages.push({ $match: { '__asset.location.id': { $in: ids } } });
  }

  // Severity and status both sort by meaning, not alphabetically — "Critical"
  // before "High" is the order, and no alphabet agrees with either.
  stages.push({
    $addFields: {
      __severityRank: {
        $switch: {
          branches: PREDICTIVE_SEVERITIES.map((value, index) => ({ case: { $eq: ['$severity', value] }, then: index })),
          default: PREDICTIVE_SEVERITIES.length,
        },
      },
      __statusRank: {
        $switch: {
          branches: PREDICTIVE_ALERT_STATUSES.map((value, index) => ({ case: { $eq: ['$status', value] }, then: index })),
          default: PREDICTIVE_ALERT_STATUSES.length,
        },
      },
    },
  });

  return stages;
}

function sortStage(sort: Record<string, unknown>): Record<string, 1 | -1> {
  const out: Record<string, 1 | -1> = {};
  for (const [field, direction] of Object.entries(sort)) {
    const key = field === 'severity' ? '__severityRank' : field === 'status' ? '__statusRank' : field;
    // Severity ascends by rank, which reads as "worst first" — the opposite of
    // what `-severity` would mean taken literally, and the only ordering anyone
    // wants from a triage board.
    out[key] = direction === -1 || direction === 'desc' ? -1 : 1;
  }
  out._id = 1; // stable paging: ties must not reshuffle between pages
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export async function listPredictiveAlerts(
  query: PredictiveAlertListQuery,
): Promise<{ items: PredictiveAlertDoc[]; meta: ApiMeta }> {
  const pagination = parsePagination(query, SORTABLE, '-detectedAt');
  const stages = await matchStages(query);

  const [rows, hierarchy] = await Promise.all([
    PredictiveAlert.aggregate<{ items: JoinedAlert[]; total: { count: number }[] }>([
      ...stages,
      {
        $facet: {
          items: [{ $sort: sortStage(pagination.sort) }, { $skip: pagination.skip }, { $limit: pagination.limit }],
          total: [{ $count: 'count' }],
        },
      },
    ]).exec(),
    loadHierarchy(),
  ]);

  const facet = rows[0];
  return {
    items: present(facet?.items ?? [], hierarchy),
    meta: buildMeta(pagination.page, pagination.limit, facet?.total[0]?.count ?? 0),
  };
}

export async function getPredictiveAlert(id: string): Promise<PredictiveAlertDoc> {
  const [alert, hierarchy] = await Promise.all([
    PredictiveAlert.findById(id).lean<PredictiveAlertDoc>(),
    loadHierarchy(),
  ]);
  if (!alert) throw ApiError.notFound('Predictive alert');

  const asset = await Asset.findById(alert.assetId).select('location').lean<{ location?: { id?: string; name?: string } }>();
  return { ...alert, placement: placementFor(hierarchy, asset?.location) } as PredictiveAlertDoc;
}

/**
 * The four summary cards. Takes the same filters as the list.
 *
 * All four counted in one aggregation rather than four round trips — this
 * database runs a pool of one, so every extra query is another serialised wait.
 *
 * `assetsAtRisk` counts distinct assets, not alerts: three signals on one
 * chiller is one machine in trouble, and counting it three times overstates the
 * estate's exposure. `workOrdersCreated` sums the linked ids rather than
 * counting alerts in the `Work Order Created` status, because one alert can
 * raise more than one order and because an alert later resolved keeps the orders
 * it raised.
 */
export async function getPredictiveAlertStats(
  query: Partial<PredictiveAlertListQuery> = {},
): Promise<PredictiveAlertStats> {
  const stages = await matchStages(query);
  const threshold = query.minConfidence ?? HIGH_CONFIDENCE_THRESHOLD;

  const [rows] = await PredictiveAlert.aggregate<{
    open: { count: number }[];
    highConfidence: { count: number }[];
    assetsAtRisk: { count: number }[];
    workOrders: { count: number }[];
    total: { count: number }[];
  }>([
    ...stages,
    {
      $facet: {
        open: [{ $match: { status: { $in: OPEN_PREDICTIVE_STATUSES } } }, { $count: 'count' }],
        // High-confidence *and* still open: a dismissed 94% alert is not an
        // outstanding risk, and leaving it in the count means the card never
        // falls no matter how much triage gets done.
        highConfidence: [
          { $match: { status: { $in: OPEN_PREDICTIVE_STATUSES }, confidence: { $gte: threshold } } },
          { $count: 'count' },
        ],
        assetsAtRisk: [
          { $match: { status: { $in: OPEN_PREDICTIVE_STATUSES } } },
          { $group: { _id: '$assetId' } },
          { $count: 'count' },
        ],
        workOrders: [
          { $project: { n: { $size: { $ifNull: ['$workOrderIds', []] } } } },
          { $group: { _id: null, count: { $sum: '$n' } } },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]).exec();

  return {
    open: rows?.open[0]?.count ?? 0,
    highConfidence: rows?.highConfidence[0]?.count ?? 0,
    assetsAtRisk: rows?.assetsAtRisk[0]?.count ?? 0,
    workOrdersCreated: rows?.workOrders[0]?.count ?? 0,
    confidenceThreshold: threshold,
    total: rows?.total[0]?.count ?? 0,
  };
}

/**
 * Filter-bar options, counted from the alerts that exist.
 *
 * Severities, types and statuses are returned in full with zero counts, because
 * they are a fixed vocabulary and a filter that appears only once something
 * matches it cannot be used to check that nothing does. Facilities, assets and
 * sources are returned only where alerts exist — offering a cut that can only
 * ever return nothing is noise.
 */
export async function getPredictiveAlertFacets(): Promise<PredictiveAlertFacets> {
  const [rows, hierarchy] = await Promise.all([
    PredictiveAlert.aggregate<{
      bySeverity: { _id: PredictiveSeverity; count: number }[];
      byType: { _id: PredictiveAlertType; count: number }[];
      byStatus: { _id: PredictiveAlertStatus; count: number }[];
      bySource: { _id: PredictiveAlertSource; count: number }[];
      byAsset: { _id: string; name: string; count: number }[];
      byLocation: { _id: string | null; count: number }[];
    }>([
      { $lookup: { from: ASSET_COLLECTION, localField: 'assetId', foreignField: '_id', as: '__asset' } },
      { $unwind: { path: '$__asset', preserveNullAndEmptyArrays: true } },
      {
        $facet: {
          bySeverity: [{ $group: { _id: '$severity', count: { $sum: 1 } } }],
          byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          bySource: [{ $group: { _id: '$source', count: { $sum: 1 } } }],
          byAsset: [
            { $group: { _id: '$assetId', name: { $first: '$assetName' }, count: { $sum: 1 } } },
            { $sort: { name: 1 } },
            { $limit: 200 },
          ],
          byLocation: [{ $group: { _id: '$__asset.location.id', count: { $sum: 1 } } }],
        },
      },
    ]).exec(),
    loadHierarchy(),
  ]);

  const facet = rows[0];
  const countsFrom = <T extends string>(list: { _id: T; count: number }[] | undefined) =>
    new Map((list ?? []).map((row) => [row._id, row.count]));

  const severityCounts = countsFrom(facet?.bySeverity);
  const typeCounts = countsFrom(facet?.byType);
  const statusCounts = countsFrom(facet?.byStatus);
  const sourceCounts = countsFrom(facet?.bySource);

  // Location ids roll up: an alert on a rack counts against its warehouse.
  const facilityCounts = new Map<string, { name: string; count: number }>();
  for (const row of facet?.byLocation ?? []) {
    const facility = row._id ? nearestAncestor(hierarchy.byId, row._id, 'facility') : null;
    if (!facility) continue;
    const existing = facilityCounts.get(facility._id);
    if (existing) existing.count += row.count;
    else facilityCounts.set(facility._id, { name: facility.name, count: row.count });
  }

  return {
    severities: PREDICTIVE_SEVERITIES.map((severity) => ({ severity, count: severityCounts.get(severity) ?? 0 })),
    types: PREDICTIVE_ALERT_TYPES.map((type) => ({ type, count: typeCounts.get(type) ?? 0 })),
    statuses: PREDICTIVE_ALERT_STATUSES.map((status) => ({ status, count: statusCounts.get(status) ?? 0 })),
    sources: PREDICTIVE_ALERT_SOURCES.filter((source) => (sourceCounts.get(source) ?? 0) > 0).map((source) => ({
      source,
      count: sourceCounts.get(source) ?? 0,
    })),
    facilities: [...facilityCounts.entries()]
      .map(([id, value]) => ({ id, name: value.name, count: value.count }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    assets: (facet?.byAsset ?? []).map((row) => ({ id: row._id, name: row.name, count: row.count })),
  };
}

/**
 * Everything the detail view needs, in one request.
 *
 * The alert, the asset it names, the work orders it raised with their current
 * state, and the other alerts this asset has carried. Assembled server-side
 * because the alternative is four requests from a drawer, on a database whose
 * connection pool serialises all four.
 *
 * `asset` is nullable rather than an error: an alert about a machine that was
 * later retired is still a record worth reading, and 404ing the whole drawer
 * because a join missed would hide the alert as well as the asset.
 */
export async function getPredictiveAlertDetail(id: string): Promise<PredictiveAlertDetail> {
  const alert = await getPredictiveAlert(id);

  const [asset, workOrders, history] = await Promise.all([
    Asset.findById(alert.assetId)
      .select('name category status criticality healthScore manufacturer model serialNumber location lifecycleStage')
      .lean<{
        _id: string;
        name: string;
        category: string;
        status: string;
        criticality?: string;
        healthScore?: number;
        manufacturer?: string;
        model?: string;
        serialNumber?: string;
        location?: { name?: string };
        lifecycleStage?: string;
      }>(),
    WorkOrder.find({ _id: { $in: alert.workOrderIds } })
      .select('title status priority assignedTo dueDate')
      .lean<{ _id: string; title: string; status: string; priority: string; assignedTo: string; dueDate: Date }[]>(),
    PredictiveAlert.find({ assetId: alert.assetId, _id: { $ne: alert._id } })
      .select('title type severity status confidence detectedAt workOrderIds')
      .sort({ detectedAt: -1 })
      .limit(20)
      .lean<
        {
          _id: string;
          title: string;
          type: PredictiveAlertType;
          severity: PredictiveSeverity;
          status: PredictiveAlertStatus;
          confidence: number;
          detectedAt: Date;
          workOrderIds: string[];
        }[]
      >(),
  ]);

  return {
    alert: alert as unknown as PredictiveAlertDetail['alert'],
    asset: asset
      ? {
          id: asset._id,
          name: asset.name,
          category: asset.category,
          status: asset.status,
          criticality: asset.criticality,
          healthScore: asset.healthScore,
          manufacturer: asset.manufacturer,
          model: asset.model,
          serialNumber: asset.serialNumber,
          location: asset.location?.name ?? 'Unassigned',
          lifecycleStage: asset.lifecycleStage,
        }
      : null,
    // Ordered as the alert links them, so the first order raised reads first.
    workOrders: alert.workOrderIds
      .map((workOrderId) => workOrders.find((order) => order._id === workOrderId))
      .filter((order): order is NonNullable<typeof order> => Boolean(order))
      .map((order) => ({
        id: order._id,
        title: order.title,
        status: order.status,
        priority: order.priority,
        assignedTo: order.assignedTo,
        dueDate: order.dueDate.toISOString(),
      })),
    assetHistory: history.map((row) => ({
      id: row._id,
      title: row.title,
      type: row.type,
      severity: row.severity,
      status: row.status,
      confidence: row.confidence,
      detectedAt: row.detectedAt.toISOString(),
      workOrderIds: row.workOrderIds ?? [],
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raise an alert.
 *
 * **This is the ingestion endpoint.** A predictive engine integrating later
 * posts exactly this body with `source: 'Predictive Engine'` and a `detector`,
 * and needs no other change on this side — which is the point of building the
 * lifecycle before the model exists.
 *
 * Two things are refused rather than stored, and both are about provenance:
 * a manual alert claiming a detector, and a machine alert that names none. The
 * screen distinguishes measured predictions from judgement calls by exactly that
 * field, so letting it be wrong would make the distinction decorative.
 */
export async function createPredictiveAlert(
  input: CreatePredictiveAlertInput,
  actor: string,
): Promise<PredictiveAlertDoc> {
  const asset = await Asset.findById(input.assetId).lean();
  if (!asset) throw ApiError.badRequest(`Asset ${input.assetId} does not exist`);

  if (input.source === 'Manual' && input.detector) {
    throw ApiError.badRequest('A manually raised alert cannot name a detector — that would attribute a judgement to a model.');
  }
  if (input.source !== 'Manual' && !input.detector) {
    throw ApiError.badRequest(`An alert from "${input.source}" must name the detector that produced it.`);
  }

  const detectedAt = input.detectedAt ? new Date(input.detectedAt) : new Date();
  const predictedFailureAt = input.predictedFailureAt ? new Date(input.predictedFailureAt) : undefined;

  // A failure predicted before it was detected is a clock or a payload bug, and
  // storing it produces a countdown that renders as already elapsed.
  if (predictedFailureAt && predictedFailureAt.getTime() < detectedAt.getTime()) {
    throw ApiError.badRequest('The predicted failure date cannot be before the detection date.');
  }

  const now = new Date();
  const id = await nextId('predictiveAlert', 'PA');

  await PredictiveAlert.create({
    ...input,
    _id: id,
    assetName: asset.name,
    status: 'Open',
    detectedAt,
    predictedFailureAt,
    workOrderIds: [],
    history: [
      {
        from: null,
        to: 'Open',
        at: now,
        actor,
        note: input.detector ? `Raised by ${input.detector.name}${input.detector.version ? ` v${input.detector.version}` : ''}` : 'Raised manually',
      },
    ],
    createdBy: actor,
  });

  await Activity.create({
    assetId: input.assetId,
    type: 'Alert',
    description: `Predictive alert ${id} raised: ${input.title} (${input.confidence}% confidence)`,
    actor,
    timestamp: now,
  });

  logger.info('Predictive alert raised', { alert: id, asset: input.assetId, source: input.source, confidence: input.confidence });
  return getPredictiveAlert(id);
}

/**
 * Move an alert through its lifecycle.
 *
 * One function behind every transition, so the allowed moves are checked in one
 * place and the trail is written the same way every time. The per-status stamps
 * — who acknowledged, who dismissed and why — live here rather than in each
 * caller, because a lifecycle that records some transitions and not others is
 * not an audit trail.
 */
async function transition(
  id: string,
  next: PredictiveAlertStatus,
  actor: string,
  options: { note?: string; reason?: string } = {},
): Promise<PredictiveAlertDoc> {
  const alert = await PredictiveAlert.findById(id);
  if (!alert) throw ApiError.notFound('Predictive alert');

  // Idempotent: acknowledging an acknowledged alert is a double-click, not an
  // error, and answering 400 to it makes every optimistic UI wrong.
  if (alert.status === next) return getPredictiveAlert(id);

  if (!PREDICTIVE_ALERT_TRANSITIONS[alert.status].includes(next)) {
    throw ApiError.badRequest(`A ${alert.status} alert cannot be moved to ${next}.`);
  }

  const previous = alert.status;
  const now = new Date();
  alert.status = next;

  if (next === 'Acknowledged') {
    alert.acknowledgedBy = actor;
    alert.acknowledgedAt = now;
  }
  if (next === 'Dismissed') {
    alert.dismissedBy = actor;
    alert.dismissedAt = now;
    alert.dismissedReason = options.reason;
  }
  if (next === 'Resolved') {
    alert.resolvedBy = actor;
    alert.resolvedAt = now;
  }
  if (next === 'Open') {
    // Reopening clears the dismissal, or the record keeps asserting a judgement
    // that has been reversed.
    alert.dismissedBy = undefined;
    alert.dismissedAt = undefined;
    alert.dismissedReason = undefined;
  }

  alert.history.push({ from: previous, to: next, at: now, actor, note: options.reason ?? options.note });
  await alert.save();

  await Activity.create({
    assetId: alert.assetId,
    type: 'Alert',
    description: `Predictive alert ${id} ${previous} → ${next}${options.reason ? `: ${options.reason}` : ''}`,
    actor,
    timestamp: now,
  });

  return getPredictiveAlert(id);
}

export const acknowledgePredictiveAlert = (id: string, actor: string, note?: string) =>
  transition(id, 'Acknowledged', actor, { note });

export const dismissPredictiveAlert = (id: string, actor: string, reason: string) =>
  transition(id, 'Dismissed', actor, { reason });

export const reopenPredictiveAlert = (id: string, actor: string, note?: string) =>
  transition(id, 'Open', actor, { note });

export const resolvePredictiveAlert = (id: string, actor: string, note?: string) =>
  transition(id, 'Resolved', actor, { note });

/**
 * Raise a real work order from an alert.
 *
 * This is the action the module exists for, so it does the whole job rather than
 * half of it:
 *
 *   - the order is created through `workOrder.service.createWorkOrder`, the same
 *     path the Work Orders screen posts to, so it gets a real id, a history
 *     entry, an activity record and its lifecycle side effects;
 *   - its `source` is `Predictive Maintenance` and its `type` is `Predictive`,
 *     which is what the board filters on;
 *   - the description carries `[predictive-alert:PA-n]`, so an order opened from
 *     the board says where it came from without a join;
 *   - the id is pushed onto the alert and the alert moves to
 *     `Work Order Created`.
 *
 * Idempotent by intent, not by accident: an alert that already raised an order
 * that is still open returns that order instead of a second one. Pressing the
 * button twice must not put two tickets for one prediction into the queue. An
 * alert whose orders were all closed *can* raise another — the condition
 * recurring after the work was done is a real case, and refusing it would leave
 * the only route a manual work order that loses the link.
 */
export async function raiseWorkOrderFromAlert(
  id: string,
  input: RaisePredictiveWorkOrderInput,
  actor: string,
): Promise<{ alert: PredictiveAlertDoc; workOrderId: string; reused: boolean }> {
  const alert = await PredictiveAlert.findById(id);
  if (!alert) throw ApiError.notFound('Predictive alert');

  if (alert.status === 'Dismissed') {
    throw ApiError.badRequest('This alert was dismissed. Reopen it before raising work against it.');
  }

  if (alert.workOrderIds.length > 0) {
    const open = await WorkOrder.findOne({
      _id: { $in: alert.workOrderIds },
      status: { $nin: ['Completed', 'Cancelled'] },
    })
      .select('_id')
      .lean<{ _id: string }>();

    if (open) return { alert: await getPredictiveAlert(id), workOrderId: open._id, reused: true };
  }

  const recommendation = alert.recommendation;
  const dueInDays = input.dueInDays ?? recommendation.dueInDays;
  const dueDate = new Date(Date.now() + dueInDays * 86_400_000);

  const workOrder = await createWorkOrder(
    {
      title: input.title?.trim() || `${alert.title} — ${alert.assetName}`,
      assetId: alert.assetId,
      status: 'New',
      priority: input.priority ?? recommendation.priority,
      type: 'Predictive',
      assignedTo: input.assignedTo?.trim() || 'Unassigned',
      scheduledDate: input.scheduledDate ?? null,
      dueDate: dueDate.toISOString(),
      description:
        `Raised from predictive alert ${alert._id} (${alert.confidence}% confidence, ${alert.severity}).\n\n` +
        `Prediction: ${alert.reason}\n\n` +
        `Recommended action: ${recommendation.action}` +
        (input.notes ? `\n\nNotes: ${input.notes}` : '') +
        `\n\n[predictive-alert:${alert._id}]`,
      estimatedHours: input.estimatedHours ?? recommendation.estimatedHours,
      source: 'Predictive Maintenance',
      requiredSkill: recommendation.requiredSkill,
      checklist: [],
      parts: [],
    },
    actor,
  );

  alert.workOrderIds.push(workOrder._id);

  // The status only moves forward. An alert already Resolved that raises follow-up
  // work stays Resolved — dragging it back into the triage queue would undo a
  // decision somebody made.
  if (alert.status === 'Open' || alert.status === 'Acknowledged') {
    const previous = alert.status;
    alert.status = 'Work Order Created';
    alert.history.push({
      from: previous,
      to: 'Work Order Created',
      at: new Date(),
      actor,
      note: `Work order ${workOrder._id} raised`,
    });
  } else {
    alert.history.push({
      from: alert.status,
      to: alert.status,
      at: new Date(),
      actor,
      note: `Follow-up work order ${workOrder._id} raised`,
    });
  }

  await alert.save();

  logger.info('Work order raised from predictive alert', { alert: id, workOrder: workOrder._id, actor });
  markEstateChanged('predictive-alert-work-order');

  return { alert: await getPredictiveAlert(id), workOrderId: workOrder._id, reused: false };
}

/**
 * Delete an alert.
 *
 * For a row that should never have existed — a bad import, a misconfigured
 * detector — not for one that has been dealt with. An alert with work orders
 * behind it is refused: deleting it would strand orders whose description names
 * an alert nobody can open. Dismiss it instead, which is what the lifecycle is
 * for.
 */
export async function deletePredictiveAlert(id: string): Promise<void> {
  const alert = await PredictiveAlert.findById(id).lean<PredictiveAlertDoc>();
  if (!alert) throw ApiError.notFound('Predictive alert');

  if (alert.workOrderIds.length > 0) {
    throw ApiError.badRequest(
      `This alert raised ${alert.workOrderIds.length} work order(s) and cannot be deleted. Dismiss or resolve it instead.`,
    );
  }

  await PredictiveAlert.findByIdAndDelete(id);
  logger.info('Predictive alert deleted', { alert: id });
}
