import { randomUUID } from 'node:crypto';
import type { ApiMeta, AuditStatus } from '@access-genie/shared';
import { AUDIT_TRANSITIONS } from '@access-genie/shared';
import { Asset, Audit, AuditFinding, nextId, type AuditEngagementDoc, type AuditFindingDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { assertAssetVisible, assertLocationVisible, type VisibleScope } from './tenancy.service.js';
import { csvFilter, paginate, parsePagination } from '../utils/query.js';
import { fireEvent } from './notificationRule.service.js';
import type {
  AddEvidenceInput,
  CreateAuditInput,
  CreateFindingInput,
  UpdateAuditInput,
  UpdateFindingInput,
} from '../validators/audit.validator.js';

/**
 * Audit Center.
 *
 * An audit is worked through a fixed lifecycle (`AUDIT_TRANSITIONS`) and
 * accumulates findings as it goes. `findingsCount`/`openFindingsCount` are
 * kept on the audit document itself — recomputed from `AuditFinding` on every
 * write that changes one — so the list screen reads them without a fan-out
 * aggregate per row.
 */

const AUDIT_SORTABLE = ['createdAt', 'dueDate', 'status', 'name'];
const FINDING_SORTABLE = ['createdAt', 'severity', 'status'];

export interface AuditQuery {
  page?: string;
  limit?: string;
  sort?: string;
  q?: string;
  status?: string;
  type?: string;
  scopeId?: string;
}

export async function listAudits(
  scope: VisibleScope,
  query: AuditQuery,
): Promise<{ items: AuditEngagementDoc[]; meta: ApiMeta }> {
  const filter: Record<string, unknown> = {};
  const status = csvFilter(query.status);
  if (status) filter.status = status;
  const type = csvFilter(query.type);
  if (type) filter.type = type;
  if (query.scopeId) filter.scopeId = query.scopeId;
  if (query.q) filter.$text = { $search: query.q };
  if (!scope.coversAll) filter.scopeId = { $in: [...scope.ids] };

  const pagination = parsePagination(query, AUDIT_SORTABLE, '-createdAt');
  return paginate(Audit, filter, pagination);
}

async function auditOrFail(id: string, scope: VisibleScope): Promise<InstanceType<typeof Audit>> {
  const audit = await Audit.findById(id);
  if (!audit) throw ApiError.notFound('Audit');
  assertLocationVisible(scope, audit.scopeId, 'Audit');
  return audit;
}

export async function getAudit(scope: VisibleScope, id: string): Promise<AuditEngagementDoc> {
  const audit = await auditOrFail(id, scope);
  return audit.toObject();
}

export async function createAudit(
  scope: VisibleScope,
  input: CreateAuditInput,
  createdBy: string,
): Promise<AuditEngagementDoc> {
  assertLocationVisible(scope, input.scopeId, 'Scope');

  const _id = await nextId('audit', 'ADT');
  const created = await Audit.create({
    ...input,
    _id,
    startDate: new Date(input.startDate),
    dueDate: new Date(input.dueDate),
    status: 'Planned',
    findingsCount: 0,
    openFindingsCount: 0,
    createdBy,
  });
  return created.toObject();
}

export async function updateAudit(scope: VisibleScope, id: string, patch: UpdateAuditInput): Promise<AuditEngagementDoc> {
  const audit = await auditOrFail(id, scope);
  if (patch.scopeId) assertLocationVisible(scope, patch.scopeId, 'Scope');

  Object.assign(audit, patch);
  if (patch.startDate) audit.startDate = new Date(patch.startDate);
  if (patch.dueDate) audit.dueDate = new Date(patch.dueDate);

  await audit.save();
  return audit.toObject();
}

export async function transitionAudit(scope: VisibleScope, id: string, next: AuditStatus): Promise<AuditEngagementDoc> {
  const audit = await auditOrFail(id, scope);
  if (audit.status === next) return audit.toObject();

  if (!AUDIT_TRANSITIONS[audit.status].includes(next)) {
    throw ApiError.badRequest(`Cannot move an audit from "${audit.status}" to "${next}"`);
  }

  audit.status = next;
  if (next === 'Completed') audit.completedAt = new Date();

  await audit.save();
  return audit.toObject();
}

/** Recompute the denormalised counters from the findings that actually exist. */
async function refreshCounters(auditId: string): Promise<void> {
  const [findingsCount, openFindingsCount] = await Promise.all([
    AuditFinding.countDocuments({ auditId }),
    AuditFinding.countDocuments({ auditId, status: { $in: ['Open', 'In Progress'] } }),
  ]);
  await Audit.findByIdAndUpdate(auditId, { $set: { findingsCount, openFindingsCount } });
}

// ── Findings ─────────────────────────────────────────────────────────────────

export async function listFindings(
  scope: VisibleScope,
  auditId: string,
  query: { page?: string; limit?: string; sort?: string; status?: string; severity?: string },
): Promise<{ items: AuditFindingDoc[]; meta: ApiMeta }> {
  await auditOrFail(auditId, scope);

  const filter: Record<string, unknown> = { auditId };
  const status = csvFilter(query.status);
  if (status) filter.status = status;
  const severity = csvFilter(query.severity);
  if (severity) filter.severity = severity;

  const pagination = parsePagination(query, FINDING_SORTABLE, '-createdAt');
  return paginate(AuditFinding, filter, pagination);
}

/**
 * Findings across every audit, filterable by asset.
 *
 * The nested `/audits/:auditId/findings` list answers "what did this audit
 * find"; dependent modules (an asset's detail page, a facility's compliance
 * tab) ask the opposite question — "what has been found against this asset,
 * regardless of which audit raised it" — which this answers without the
 * caller needing to already know the audit id.
 */
export async function listFindingsAcrossAudits(
  scope: VisibleScope,
  query: { page?: string; limit?: string; sort?: string; status?: string; severity?: string; assetId?: string },
): Promise<{ items: AuditFindingDoc[]; meta: ApiMeta }> {
  const filter: Record<string, unknown> = {};
  const status = csvFilter(query.status);
  if (status) filter.status = status;
  const severity = csvFilter(query.severity);
  if (severity) filter.severity = severity;
  if (query.assetId) {
    await assertAssetVisible(scope, query.assetId, 'Asset');
    filter.assetId = query.assetId;
  } else if (!scope.coversAll) {
    // No asset named: narrow to audits within the caller's estate rather than
    // asking every asset-linked finding in the organisation to prove itself.
    const visibleAudits = await Audit.find({ scopeId: { $in: [...scope.ids] } }).distinct('_id');
    filter.auditId = { $in: visibleAudits };
  }

  const pagination = parsePagination(query, FINDING_SORTABLE, '-createdAt');
  return paginate(AuditFinding, filter, pagination);
}

export async function createFinding(
  scope: VisibleScope,
  auditId: string,
  input: CreateFindingInput,
  createdBy: string,
): Promise<AuditFindingDoc> {
  const audit = await auditOrFail(auditId, scope);

  let assetName: string | undefined;
  if (input.assetId) {
    const asset = await Asset.findById(input.assetId).lean();
    if (!asset) throw ApiError.badRequest(`Asset ${input.assetId} does not exist`);
    await assertAssetVisible(scope, input.assetId, 'Asset');
    assetName = asset.name;
  }

  const _id = await nextId('auditFinding', 'AFN');
  const created = await AuditFinding.create({
    ...input,
    _id,
    auditId,
    assetName,
    dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
    status: 'Open',
    evidence: [],
    createdBy,
  });

  await refreshCounters(auditId);

  void fireEvent(
    'audit.finding_raised',
    { subjectId: _id, scopeId: audit.scopeId, actorId: createdBy, actorName: createdBy, severity: input.severity },
    `Audit finding raised: ${input.title}`,
    `${createdBy} raised a ${input.severity} finding on audit ${audit.name}${assetName ? ` against ${assetName}` : ''}.`,
  );

  return created.toObject();
}

async function findingOrFail(auditId: string, findingId: string): Promise<InstanceType<typeof AuditFinding>> {
  const finding = await AuditFinding.findOne({ _id: findingId, auditId });
  if (!finding) throw ApiError.notFound('Finding');
  return finding;
}

export async function updateFinding(
  scope: VisibleScope,
  auditId: string,
  findingId: string,
  patch: UpdateFindingInput,
  actor: string,
): Promise<AuditFindingDoc> {
  await auditOrFail(auditId, scope);
  const finding = await findingOrFail(auditId, findingId);

  const wasOpen = finding.status === 'Open' || finding.status === 'In Progress';
  Object.assign(finding, patch);
  if (patch.dueDate) finding.dueDate = new Date(patch.dueDate);

  if (patch.status === 'Resolved' || patch.status === 'Waived') {
    finding.resolvedAt = new Date();
    finding.resolvedBy = actor;
  }

  await finding.save();

  const isOpenNow = finding.status === 'Open' || finding.status === 'In Progress';
  if (wasOpen !== isOpenNow) await refreshCounters(auditId);

  return finding.toObject();
}

export async function addEvidence(
  scope: VisibleScope,
  auditId: string,
  findingId: string,
  input: AddEvidenceInput,
  uploadedBy: string,
): Promise<AuditFindingDoc> {
  await auditOrFail(auditId, scope);
  const finding = await findingOrFail(auditId, findingId);

  finding.evidence.push({ ...input, _id: randomUUID(), uploadedBy, uploadedAt: new Date() });
  await finding.save();
  return finding.toObject();
}
