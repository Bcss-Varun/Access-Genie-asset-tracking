import type { FilterQuery } from 'mongoose';
import type { AlertStatus, ApiMeta } from '@access-genie/shared';
import { Activity, Alert, Asset, OPEN_ALERT_STATUSES, nextId, type AlertDoc } from '../models/index.js';
import type { AlertHistoryEntry } from '../models/Alert.js';
import { ApiError } from '../utils/ApiError.js';
import { assertAssetVisible, assetClause, type VisibleScope } from './tenancy.service.js';
import { csvFilter, escapeRegex, paginate, parsePagination } from '../utils/query.js';
import type { AlertListQuery, CreateAlertInput } from '../validators/alert.validator.js';

const SORTABLE = ['createdAt', 'severity', 'status', 'updatedAt'];

function buildFilter(query: AlertListQuery): FilterQuery<AlertDoc> {
  const filter: FilterQuery<AlertDoc> = {};

  const status = csvFilter(query.status);
  if (status) filter.status = status;

  const severity = csvFilter(query.severity);
  if (severity) filter.severity = severity;

  const type = csvFilter(query.type);
  if (type) filter.type = type;

  if (query.assetId) filter.assetId = query.assetId;

  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ title: rx }, { type: rx }, { assetName: rx }, { _id: rx }];
  }

  return filter;
}

export async function listAlerts(
  scope: VisibleScope,
  query: AlertListQuery,
): Promise<{ items: AlertDoc[]; meta: ApiMeta }> {
  const pagination = parsePagination(query, SORTABLE, '-createdAt');
  // An alert belongs to the asset it was raised against.
  return paginate(Alert, { ...buildFilter(query), ...(await assetClause(scope)) }, pagination);
}

export async function getAlert(scope: VisibleScope, id: string): Promise<AlertDoc> {
  const alert = await Alert.findById(id).lean<AlertDoc>();
  if (!alert) throw ApiError.notFound('Alert');
  await assertAssetVisible(scope, alert.assetId, 'Alert');
  return alert;
}

export async function createAlert(scope: VisibleScope, input: CreateAlertInput, actor: string): Promise<AlertDoc> {
  // Denormalize the asset name so the alert list renders without a join, and
  // so the alert still reads correctly if the asset is later retired.
  let assetName: string | undefined;
  if (input.assetId) {
    const asset = await Asset.findById(input.assetId).lean();
    if (!asset) throw ApiError.badRequest(`Asset ${input.assetId} does not exist`);
    // Raising an alert against an asset outside your estate would put it in a
    // queue you cannot see — and in someone else's that did not ask for it.
    await assertAssetVisible(scope, input.assetId, 'Asset');
    assetName = asset.name;
  }

  const id = await nextId('alert', 'ALT');
  const now = new Date();
  const alert = await Alert.create({
    ...input,
    _id: id,
    assetName,
    status: 'Open',
    history: [{ action: 'raised', by: actor, at: now }],
  });

  // The asset's own timeline should say an alert was raised against it — Asset
  // 360 reads activity, and an alert it never mentions is one its owner misses.
  await recordAssetActivity(alert.assetId, `Alert ${id} raised: ${alert.title} (${alert.severity})`, actor, now);
  return alert.toObject();
}

/** One timeline row on the alert's asset, when it has one. */
async function recordAssetActivity(assetId: string | undefined, description: string, actor: string, at = new Date()) {
  if (!assetId) return;
  await Activity.create({ assetId, type: 'Alert', description, actor, timestamp: at });
}

/**
 * Load an alert for a write, refusing one outside the caller's estate.
 *
 * Reads were already scoped (`getAlert`), but every write path loaded by id
 * alone — so a Pune facility manager could acknowledge, resolve or take
 * ownership of a Hyderabad alert they cannot even see in their list.
 */
async function loadForWrite(scope: VisibleScope, id: string) {
  const alert = await Alert.findById(id);
  if (!alert) throw ApiError.notFound('Alert');
  await assertAssetVisible(scope, alert.assetId, 'Alert');
  return alert;
}

/**
 * Alert lifecycle. Each transition records who performed it — an alert trail
 * that cannot answer "who acknowledged this and when" is not much of a trail.
 */
const ALLOWED_TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  Open: ['Acknowledged', 'Escalated', 'Resolved'],
  Acknowledged: ['Escalated', 'Resolved'],
  Escalated: ['Acknowledged', 'Resolved'],
  Resolved: [],
};

const ACTION_FOR: Record<Exclude<AlertStatus, 'Open'>, AlertHistoryEntry['action']> = {
  Acknowledged: 'acknowledged',
  Escalated: 'escalated',
  Resolved: 'resolved',
};

export async function transitionAlert(
  scope: VisibleScope,
  id: string,
  next: Exclude<AlertStatus, 'Open'>,
  actor: string,
  note?: string,
): Promise<AlertDoc> {
  const alert = await loadForWrite(scope, id);

  if (alert.status === next) return alert.toObject();

  if (!ALLOWED_TRANSITIONS[alert.status].includes(next)) {
    throw ApiError.badRequest(`Cannot move an alert from "${alert.status}" to "${next}"`);
  }

  const previous = alert.status;
  const now = new Date();
  alert.status = next;

  if (next === 'Acknowledged') {
    alert.acknowledgedBy = actor;
    alert.acknowledgedAt = now;
  }
  if (next === 'Escalated') {
    alert.escalatedBy = actor;
    alert.escalatedAt = now;
  }
  if (next === 'Resolved') {
    alert.resolvedBy = actor;
    alert.resolvedAt = now;
  }
  alert.history = [...(alert.history ?? []), { action: ACTION_FOR[next], by: actor, at: now, from: previous, note }];

  await alert.save();
  await recordAssetActivity(alert.assetId, `Alert ${id} ${previous} → ${next}${note ? `: ${note}` : ''}`, actor, now);

  return alert.toObject();
}

/** Bulk acknowledge — the alert centre's "select all, acknowledge" action. */
export async function acknowledgeMany(scope: VisibleScope, ids: string[], actor: string): Promise<number> {
  // Only alerts the caller can see, and only those still awaiting a response.
  const targets = await Alert.find({
    _id: { $in: ids },
    status: { $in: ['Open', 'Escalated'] },
    ...(await assetClause(scope)),
  })
    .select('_id status assetId')
    .lean<Pick<AlertDoc, '_id' | 'status' | 'assetId'>[]>();
  if (targets.length === 0) return 0;

  const now = new Date();
  let modified = 0;
  // Per alert rather than one updateMany: each records the status it came from,
  // and the guard on `status` keeps a concurrent single acknowledgement from
  // being written twice.
  for (const target of targets) {
    const result = await Alert.updateOne(
      { _id: target._id, status: target.status },
      {
        $set: { status: 'Acknowledged', acknowledgedBy: actor, acknowledgedAt: now },
        $push: { history: { action: 'acknowledged', by: actor, at: now, from: target.status } },
      },
    );
    if (result.modifiedCount === 0) continue;
    modified += 1;
    // The same asset-timeline row a single acknowledgement writes.
    await recordAssetActivity(target.assetId, `Alert ${target._id} ${target.status} → Acknowledged`, actor, now);
  }
  return modified;
}

/**
 * Give an alert an owner.
 *
 * Assigning also acknowledges it if it was still Open: somebody taking it on
 * has, by definition, seen it, and leaving it Open would keep it counted as
 * unlooked-at in every queue that measures response time.
 */
export async function assignAlert(scope: VisibleScope, id: string, assignee: string, actor: string): Promise<AlertDoc> {
  const alert = await loadForWrite(scope, id);
  if (alert.status === 'Resolved') throw ApiError.badRequest('A resolved alert cannot be reassigned');

  const now = new Date();
  const history = [...(alert.history ?? [])];
  const wasOpen = alert.status === 'Open';

  alert.assignedTo = assignee;
  alert.assignedAt = now;
  if (wasOpen) {
    alert.status = 'Acknowledged';
    alert.acknowledgedBy = actor;
    alert.acknowledgedAt = now;
    history.push({ action: 'acknowledged', by: actor, at: now, from: 'Open' });
  }
  history.push({ action: 'assigned', by: actor, at: now, assignee });
  alert.history = history;

  await alert.save();
  await recordAssetActivity(
    alert.assetId,
    `Alert ${id} assigned to ${assignee}${wasOpen ? ' (Open → Acknowledged)' : ''}`,
    actor,
    now,
  );
  return alert.toObject();
}

export async function getAlertStats(scope: VisibleScope) {
  // The same estate the list shows — a badge that counts another site's alerts
  // promises work the user can never find.
  const visible = await assetClause(scope);
  const [bySeverity, byStatus, open] = await Promise.all([
    Alert.aggregate<{ _id: string; count: number }>([
      { $match: { ...visible, status: { $in: OPEN_ALERT_STATUSES } } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]),
    Alert.aggregate<{ _id: string; count: number }>([{ $match: visible }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Alert.countDocuments({ ...visible, status: { $in: OPEN_ALERT_STATUSES } }),
  ]);

  return {
    open,
    critical: bySeverity.find((s) => s._id === 'Critical')?.count ?? 0,
    warning: bySeverity.find((s) => s._id === 'Warning')?.count ?? 0,
    info: bySeverity.find((s) => s._id === 'Info')?.count ?? 0,
    byStatus: byStatus.map((s) => ({ status: s._id, count: s.count })),
  };
}
