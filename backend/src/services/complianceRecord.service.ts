import type { ApiMeta } from '@access-genie/shared';
import { Asset, ComplianceRecord, nextId, type ComplianceRecordDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { assertAssetVisible, assertLocationVisible, assetClause, type VisibleScope } from './tenancy.service.js';
import { csvFilter, paginate, parsePagination } from '../utils/query.js';
import { fireEvent } from './notificationRule.service.js';
import type {
  CreateComplianceRecordInput,
  ResolveComplianceRecordInput,
  UpdateComplianceRecordInput,
} from '../validators/complianceRecord.validator.js';

/**
 * Compliance Monitoring.
 *
 * Findings, not a framework checklist: what a compliance officer actually
 * works from day to day is a queue of open issues against the estate, each
 * with a severity, an owner, and a due date. `assetId` findings are scoped the
 * same way custody and certifications are (through the asset's location);
 * `scopeId` findings (no single asset — a policy gap, a training lapse) are
 * scoped directly against the node.
 */

const SORTABLE = ['createdAt', 'severity', 'status', 'dueDate'];

export interface ComplianceRecordQuery {
  page?: string;
  limit?: string;
  sort?: string;
  q?: string;
  status?: string;
  severity?: string;
  category?: string;
  assetId?: string;
}

export async function listComplianceRecords(
  scope: VisibleScope,
  query: ComplianceRecordQuery,
): Promise<{ items: ComplianceRecordDoc[]; meta: ApiMeta }> {
  const filter: Record<string, unknown> = {};
  const status = csvFilter(query.status);
  if (status) filter.status = status;
  const severity = csvFilter(query.severity);
  if (severity) filter.severity = severity;
  const category = csvFilter(query.category);
  if (category) filter.category = category;
  if (query.assetId) filter.assetId = query.assetId;
  if (query.q) filter.$text = { $search: query.q };

  // A finding is visible if its asset is in the caller's estate, or it carries
  // no asset at all (an org-level finding is visible to whoever can see the
  // module — narrowing further would need a scope-node containment check this
  // collection does not need yet).
  if (!scope.coversAll) {
    const assetIds = (await assetClause(scope)).assetId;
    filter.$or = [{ assetId: assetIds }, { assetId: { $exists: false } }];
  }

  const pagination = parsePagination(query, SORTABLE, '-createdAt');
  return paginate(ComplianceRecord, filter, pagination);
}

export async function getComplianceRecord(scope: VisibleScope, id: string): Promise<ComplianceRecordDoc> {
  const record = await ComplianceRecord.findById(id).lean<ComplianceRecordDoc>();
  if (!record) throw ApiError.notFound('Compliance record');
  if (record.assetId) await assertAssetVisible(scope, record.assetId, 'Compliance record');
  return record;
}

export async function createComplianceRecord(
  scope: VisibleScope,
  input: CreateComplianceRecordInput,
  createdBy: string,
): Promise<ComplianceRecordDoc> {
  let assetName: string | undefined;
  let effectiveScopeId = input.scopeId;
  if (input.assetId) {
    const asset = await Asset.findById(input.assetId).lean();
    if (!asset) throw ApiError.badRequest(`Asset ${input.assetId} does not exist`);
    await assertAssetVisible(scope, input.assetId, 'Asset');
    assetName = asset.name;
    effectiveScopeId = asset.location.id;
  } else if (input.scopeId) {
    assertLocationVisible(scope, input.scopeId, 'Scope');
  }

  const _id = await nextId('complianceRecord', 'CMR');
  const created = await ComplianceRecord.create({
    ...input,
    _id,
    assetName,
    dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
    status: 'Open',
    source: 'Manual',
    createdBy,
  });

  // A real event, raised where the finding actually lands. Notification rules
  // react to this; creating one is optional and configured separately.
  void fireEvent(
    'compliance.finding_raised',
    { subjectId: _id, scopeId: effectiveScopeId, actorId: createdBy, actorName: createdBy, severity: input.severity },
    `Compliance finding raised: ${input.title}`,
    `${createdBy} raised a ${input.severity} ${input.category} finding${assetName ? ` against ${assetName}` : ''}.`,
  );

  return created.toObject();
}

export async function updateComplianceRecord(
  scope: VisibleScope,
  id: string,
  patch: UpdateComplianceRecordInput,
): Promise<ComplianceRecordDoc> {
  const record = await ComplianceRecord.findById(id);
  if (!record) throw ApiError.notFound('Compliance record');
  if (record.assetId) await assertAssetVisible(scope, record.assetId, 'Compliance record');

  Object.assign(record, patch);
  if (patch.dueDate) record.dueDate = new Date(patch.dueDate);

  await record.save();
  return record.toObject();
}

export async function resolveComplianceRecord(
  scope: VisibleScope,
  id: string,
  input: ResolveComplianceRecordInput,
  actor: string,
): Promise<ComplianceRecordDoc> {
  const record = await ComplianceRecord.findById(id);
  if (!record) throw ApiError.notFound('Compliance record');
  if (record.assetId) await assertAssetVisible(scope, record.assetId, 'Compliance record');
  if (record.status === 'Resolved' || record.status === 'Waived') {
    throw ApiError.badRequest(`Finding is already ${record.status}`);
  }

  record.status = input.status;
  record.resolvedAt = new Date();
  record.resolvedBy = actor;
  if (input.resolutionNote) record.resolutionNote = input.resolutionNote;

  await record.save();
  return record.toObject();
}
