import type { FilterQuery } from 'mongoose';
import type { AlertStatus, ApiMeta } from '@access-genie/shared';
import { Activity, Alert, Asset, OPEN_ALERT_STATUSES, nextId, type AlertDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
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

export async function listAlerts(query: AlertListQuery): Promise<{ items: AlertDoc[]; meta: ApiMeta }> {
  const pagination = parsePagination(query, SORTABLE, '-createdAt');
  return paginate(Alert, buildFilter(query), pagination);
}

export async function getAlert(id: string): Promise<AlertDoc> {
  const alert = await Alert.findById(id).lean<AlertDoc>();
  if (!alert) throw ApiError.notFound('Alert');
  return alert;
}

export async function createAlert(input: CreateAlertInput): Promise<AlertDoc> {
  const id = await nextId('alert', 'ALT');

  // Denormalize the asset name so the alert list renders without a join, and
  // so the alert still reads correctly if the asset is later retired.
  let assetName: string | undefined;
  if (input.assetId) {
    const asset = await Asset.findById(input.assetId).lean();
    if (!asset) throw ApiError.badRequest(`Asset ${input.assetId} does not exist`);
    assetName = asset.name;
  }

  const alert = await Alert.create({ ...input, _id: id, assetName, status: 'Open' });
  return alert.toObject();
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

export async function transitionAlert(
  id: string,
  next: AlertStatus,
  actor: string,
  note?: string,
): Promise<AlertDoc> {
  const alert = await Alert.findById(id);
  if (!alert) throw ApiError.notFound('Alert');

  if (alert.status === next) return alert.toObject();

  if (!ALLOWED_TRANSITIONS[alert.status].includes(next)) {
    throw ApiError.badRequest(`Cannot move an alert from "${alert.status}" to "${next}"`);
  }

  const previous = alert.status;
  alert.status = next;

  if (next === 'Acknowledged') {
    alert.acknowledgedBy = actor;
    alert.acknowledgedAt = new Date();
  }
  if (next === 'Resolved') {
    alert.resolvedBy = actor;
    alert.resolvedAt = new Date();
  }

  await alert.save();

  if (alert.assetId) {
    await Activity.create({
      assetId: alert.assetId,
      type: 'Alert',
      description: `Alert ${id} ${previous} → ${next}${note ? `: ${note}` : ''}`,
      actor,
      timestamp: new Date(),
    });
  }

  return alert.toObject();
}

/** Bulk acknowledge — the alert centre's "select all, acknowledge" action. */
export async function acknowledgeMany(ids: string[], actor: string): Promise<number> {
  const result = await Alert.updateMany(
    { _id: { $in: ids }, status: { $in: ['Open', 'Escalated'] } },
    { $set: { status: 'Acknowledged', acknowledgedBy: actor, acknowledgedAt: new Date() } },
  );
  return result.modifiedCount;
}

export async function getAlertStats() {
  const [bySeverity, byStatus, open] = await Promise.all([
    Alert.aggregate<{ _id: string; count: number }>([
      { $match: { status: { $in: OPEN_ALERT_STATUSES } } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]),
    Alert.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Alert.countDocuments({ status: { $in: OPEN_ALERT_STATUSES } }),
  ]);

  return {
    open,
    critical: bySeverity.find((s) => s._id === 'Critical')?.count ?? 0,
    warning: bySeverity.find((s) => s._id === 'Warning')?.count ?? 0,
    info: bySeverity.find((s) => s._id === 'Info')?.count ?? 0,
    byStatus: byStatus.map((s) => ({ status: s._id, count: s.count })),
  };
}
