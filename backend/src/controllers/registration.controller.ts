import type { Request, Response } from 'express';
import { validatedQuery } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireScope } from '../middleware/scope.js';
import { ApiError } from '../utils/ApiError.js';
import { sendData, sendList } from '../utils/response.js';
import * as registration from '../services/registration.service.js';
import * as assetService from '../services/asset.service.js';
import { recordAudit } from '../services/audit.service.js';
import { createAssetSchema, type CreateAssetInput } from '../validators/asset.validator.js';
import type { RegistrationDraftInput, TemplateListQuery } from '../validators/registration.validator.js';

/** The field catalogue — what a template editor picks from. */
export const catalog = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, registration.fieldCatalog());
});

/** Defaults derived from the caller's own scope: their site, their name. */
export const defaults = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  sendData(res, await registration.registrationDefaults(req.auth.user));
});

/**
 * The form definition for one source.
 *
 * `GET /assets/registration/form?source=template&templateId=TPL-3`
 *
 * The client asks what to render rather than deciding for itself, so a change
 * to the catalogue or to a template reaches every client without a deploy.
 */
export const form = asyncHandler(async (req: Request, res: Response) => {
  const source = String(req.query.source ?? 'blank') as 'blank' | 'template' | 'clone' | 'import';
  const templateId = req.query.templateId ? String(req.query.templateId) : undefined;

  const [resolved, derived] = await Promise.all([
    registration.resolveFields(source, templateId),
    registration.derivedFields(source, templateId),
  ]);
  sendData(res, {
    source,
    templateId: templateId ?? null,
    fields: resolved.map((r) => ({ ...r.field, required: r.required, defaultValue: r.defaultValue })),
    // Not asked for, but saved: minted numbers and anything the template fixed.
    derived,
  });
});

/** Check a draft without committing it — powers per-section progress. */
export const validateDraft = asyncHandler(async (req: Request, res: Response) => {
  const draft = req.body as RegistrationDraftInput;
  const fields = await registration.resolveFields(draft.source, draft.templateId);
  sendData(res, registration.validateDraft(draft.values, fields));
});

/**
 * Commit a registration.
 *
 * Validates against the resolved field list first and returns the same
 * section-shaped result on failure, so the client never has to translate
 * between a "check" response and a "commit" response.
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  const actor = req.auth.user.name;
  const draft = req.body as RegistrationDraftInput;

  const fields = await registration.resolveFields(draft.source, draft.templateId);
  const result = registration.validateDraft(draft.values, fields);
  if (!result.valid) {
    throw ApiError.validation(
      'This asset is not ready to register',
      result.errors.map((e) => ({ path: e.key, message: e.message })),
    );
  }

  const payload = await registration.buildCreateInput(draft, fields, actor);

  // Parse the built payload through the canonical create schema rather than
  // casting to it. Two things depend on this and both were silently missing
  // while it was a cast: the schema's defaults (`purchasePrice: 0`,
  // `serialNumber: ''`, `status`, `healthScore`) are applied here and nowhere
  // else, and it is the only check that the field catalogue still maps onto the
  // asset the model will accept. A failure here is a mapping bug, not user
  // error, so it says so.
  const parsed = createAssetSchema.safeParse(payload);
  if (!parsed.success) {
    throw ApiError.validation(
      'Registration could not be mapped onto an asset',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }

  const asset = await assetService.createAsset(requireScope(req), parsed.data as CreateAssetInput, actor);

  if (draft.source === 'template' && draft.templateId) await registration.noteTemplateUse(draft.templateId);

  recordAudit(req, {
    action: 'asset.register',
    target: asset._id,
    category: 'Assets',
    metadata: { source: draft.source, templateId: draft.templateId, clonedFrom: draft.cloneOfId },
  });
  sendData(res, asset, 201);
});

/** Everything about an existing asset except what identifies that one unit. */
export const cloneSource = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await registration.clonePrefill(req.params.id as string));
});

// ── Templates ────────────────────────────────────────────────────────────────

export const listTemplates = asyncHandler(async (_req: Request, res: Response) => {
  const query = validatedQuery<TemplateListQuery>(res);
  const items = await registration.listTemplates(query);
  // Templates are configuration, not operational data — there are tens of them,
  // never thousands — so the list is unpaginated and the envelope says so.
  sendList(res, items, {
    page: 1,
    limit: items.length,
    total: items.length,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
});

export const getTemplate = asyncHandler(async (req: Request, res: Response) => {
  sendData(res, await registration.getTemplate(req.params.id as string));
});

export const createTemplate = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw ApiError.unauthorized();
  const tpl = await registration.createTemplate(req.body as Record<string, unknown>, req.auth.user.name);

  recordAudit(req, { action: 'template.create', target: tpl._id, category: 'Assets' });
  sendData(res, tpl, 201);
});

export const updateTemplate = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const tpl = await registration.updateTemplate(id, req.body as Record<string, unknown>);

  recordAudit(req, { action: 'template.update', target: id, category: 'Assets' });
  sendData(res, tpl);
});

export const archiveTemplate = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const tpl = await registration.archiveTemplate(id);

  recordAudit(req, { action: 'template.archive', target: id, category: 'Assets' });
  sendData(res, tpl);
});
