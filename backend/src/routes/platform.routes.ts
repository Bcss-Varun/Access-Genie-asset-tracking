import { Router } from 'express';
import { createResource } from '../controllers/resource.controller.js';
import {
  ApiKey,
  Backup,
  ComplianceFramework,
  EscalationPolicy,
  ExportJob,
  Invoice,
  OnCallShift,
  Passkey,
  ReportPack,
  RetentionPolicy,
  SupportTicket,
  Team,
  Webhook,
} from '../models/index.js';
import { requireModule, validate } from '../middleware/index.js';
import { idParamSchema } from '../validators/common.js';
import * as apiKeyController from '../controllers/apiKey.controller.js';
import {
  createApiKeySchema,
  createEscalationPolicySchema,
  createExportJobSchema,
  createSupportTicketSchema,
  createTeamSchema,
  createWebhookSchema,
  updateApiKeySchema,
  updateEscalationPolicySchema,
  updateRetentionPolicySchema,
  updateSupportTicketSchema,
  updateTeamSchema,
  updateWebhookSchema,
} from '../validators/platform.validator.js';

/**
 * Platform administration and governance.
 *
 * These are the records an administrator manages *about* the system — teams,
 * credentials, webhooks, backups, invoices, exports, support, and the compliance
 * policies the organisation is held to. None carries domain rules of its own, so
 * they go through the resource factory; each keeps the module gate its screens
 * have.
 *
 * The ones whose screens have buttons are mounted `writable`. That was the gap
 * this file had: revoking a key or raising a ticket changed React state and
 * nothing else, so the action was undone by the next reload.
 */
const router = Router();

/** Read-only mount — the default for a reference collection. */
const mount = (
  path: string,
  handlers: ReturnType<typeof createResource>,
  ...modules: Parameters<typeof requireModule>
) => {
  router.get(path, requireModule(...modules), handlers.validateQuery, handlers.list);
};

/**
 * Read plus write. `POST`/`PATCH`/`DELETE` are mounted only when the resource
 * declares the matching schema, so a route can never reach a handler the
 * factory left unconfigured.
 */
const mountWritable = (
  path: string,
  handlers: ReturnType<typeof createResource>,
  options: { create?: boolean; update?: boolean; remove?: boolean },
  ...modules: Parameters<typeof requireModule>
) => {
  mount(path, handlers, ...modules);
  const gate = requireModule(...modules);

  if (options.create) router.post(path, gate, handlers.validateCreate, handlers.create);
  if (options.update) {
    router.patch(`${path}/:id`, gate, validate({ params: idParamSchema }), handlers.validateUpdate, handlers.update);
  }
  if (options.remove) {
    router.delete(`${path}/:id`, gate, validate({ params: idParamSchema }), handlers.remove);
  }
};

// ── Organisation ─────────────────────────────────────────────────────────────
mountWritable('/teams', createResource(Team, {
  label: 'Team',
  filters: ['department'],
  sortable: ['name', 'department'],
  defaultSort: 'name',
  paginated: false,
  writable: {
    create: createTeamSchema,
    update: updateTeamSchema,
    idSequence: ['team', 'TEAM'],
    audit: { action: 'team', category: 'Configuration' },
  },
}), { create: true, update: true, remove: true }, 'admin');

// ── Credentials & delivery ───────────────────────────────────────────────────
// Organisation keys are administrative; a personal token belongs to whoever is
// signed in, so that view is gated on the session rather than the admin grant.
//
// Issuing and revoking do not go through the factory: the secret is minted
// server-side and shown once, and a revoked key is kept so the audit log still
// resolves. See apiKey.controller.ts.
mount('/api-keys', createResource(ApiKey, {
  label: 'API key',
  filters: ['scope'],
  sortable: ['name', 'createdAt', 'lastUsed'],
  defaultSort: '-createdAt',
  paginated: false,
}), 'admin', 'system');

router.post(
  '/api-keys',
  requireModule('admin', 'system'),
  validate({ body: createApiKeySchema }),
  apiKeyController.create,
);
router.patch(
  '/api-keys/:id',
  requireModule('admin', 'system'),
  validate({ params: idParamSchema, body: updateApiKeySchema }),
  apiKeyController.update,
);
router.delete(
  '/api-keys/:id',
  requireModule('admin', 'system'),
  validate({ params: idParamSchema }),
  apiKeyController.revoke,
);

mountWritable('/webhooks', createResource(Webhook, {
  label: 'Webhook',
  filters: ['enabled'],
  sortable: ['url', 'lastDelivery'],
  defaultSort: 'url',
  paginated: false,
  writable: {
    create: createWebhookSchema,
    update: updateWebhookSchema,
    idSequence: ['webhook', 'WH'],
    audit: { action: 'webhook', category: 'Configuration' },
  },
}), { create: true, update: true, remove: true }, 'admin');

// ── Platform operations ──────────────────────────────────────────────────────
mount('/backups', createResource(Backup, {
  label: 'Backup',
  sortable: ['when', 'status'],
  defaultSort: '-when',
  paginated: false,
}), 'admin');

mount('/invoices', createResource(Invoice, {
  label: 'Invoice',
  filters: ['status'],
  sortable: ['date', 'amount'],
  defaultSort: '-date',
  paginated: false,
}), 'admin');

// An export is requested, not edited: the row appears queued and the pipeline
// owns it from there, so there is a create and nothing else.
mountWritable('/exports', createResource(ExportJob, {
  label: 'Export',
  filters: ['status', 'format'],
  sortable: ['at', 'report', 'sizeKb'],
  defaultSort: '-at',
  paginated: false,
  writable: {
    create: createExportJobSchema,
    idSequence: ['exportJob', 'EXP'],
    timestamps: { createdAt: 'at' },
    audit: { action: 'export', category: 'Data' },
  },
}), { create: true }, 'analytics', 'admin');

mountWritable('/support-tickets', createResource(SupportTicket, {
  label: 'Support ticket',
  filters: ['status', 'category'],
  sortable: ['updated', 'subject', 'status'],
  defaultSort: '-updated',
  paginated: false,
  writable: {
    create: createSupportTicketSchema,
    update: updateSupportTicketSchema,
    idSequence: ['supportTicket', 'SUP'],
    timestamps: { updatedAt: 'updated' },
    audit: { action: 'support_ticket', category: 'Support' },
  },
}), { create: true, update: true }, 'workspace');

// ── Governance ───────────────────────────────────────────────────────────────
mountWritable('/escalation-policies', createResource(EscalationPolicy, {
  label: 'Escalation policy',
  filters: ['severity'],
  sortable: ['name', 'severity'],
  defaultSort: 'name',
  paginated: false,
  writable: {
    create: createEscalationPolicySchema,
    update: updateEscalationPolicySchema,
    idSequence: ['escalationPolicy', 'ESC'],
    audit: { action: 'escalation_policy', category: 'Configuration' },
  },
}), { create: true, update: true, remove: true }, 'alerts', 'compliance');

mount('/on-call', createResource(OnCallShift, {
  label: 'On-call shift',
  sortable: ['order', 'day'],
  defaultSort: 'order',
  paginated: false,
}), 'alerts', 'compliance');

mount('/compliance-frameworks', createResource(ComplianceFramework, {
  label: 'Framework',
  filters: ['status'],
  sortable: ['name', 'coverage', 'lastAssessment'],
  defaultSort: 'name',
  paginated: false,
}), 'compliance');

// Update only. A retention policy is created by whoever writes the compliance
// programme, not from a screen, and deleting one would orphan the records it
// governs.
mountWritable('/retention-policies', createResource(RetentionPolicy, {
  label: 'Retention policy',
  filters: ['legalHold'],
  sortable: ['dataClass'],
  defaultSort: 'dataClass',
  paginated: false,
  writable: {
    update: updateRetentionPolicySchema,
    audit: { action: 'retention_policy', category: 'Compliance' },
  },
}), { update: true }, 'compliance', 'admin');

mount('/report-packs', createResource(ReportPack, {
  label: 'Report pack',
  filters: ['framework'],
  sortable: ['name', 'framework'],
  defaultSort: 'name',
  paginated: false,
}), 'compliance', 'analytics');

// ── Personal ─────────────────────────────────────────────────────────────────
mount('/passkeys', createResource(Passkey, {
  label: 'Passkey',
  filters: ['userId'],
  sortable: ['added', 'name'],
  defaultSort: '-added',
  paginated: false,
}), 'workspace');

export default router;
