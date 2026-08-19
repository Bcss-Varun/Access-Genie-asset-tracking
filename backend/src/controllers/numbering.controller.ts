import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../services/audit.service.js';
import { NumberingRule, ScopeNodeModel, nextId, type NumberingRuleDoc } from '../models/index.js';
import * as numbering from '../services/numbering.service.js';
import type {
  CreateNumberingRuleInput,
  PreviewNumberingInput,
  UpdateNumberingRuleInput,
} from '../validators/numbering.validator.js';

/** Mongo's duplicate-key error, which the partial unique index raises. */
const isDuplicate = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;

export const list = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await numbering.listRules());
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateNumberingRuleInput;

  if (body.scopeId) {
    const node = await ScopeNodeModel.findById(body.scopeId).lean();
    if (!node) throw ApiError.badRequest(`No location ${body.scopeId} exists to scope this rule to.`);
  }

  try {
    const doc = await NumberingRule.create({ ...body, _id: await nextId('numberingRule', 'NUM'), createdBy: req.auth?.user.name ?? '' });
    recordAudit(req, { action: 'numbering_rule.create', target: doc._id, category: 'Configuration' });
    sendData(res, await numbering.toView(doc.toObject()), 201);
  } catch (err) {
    if (isDuplicate(err)) throw numbering.describeDuplicate(body.entity);
    throw err;
  }
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const body = req.body as UpdateNumberingRuleInput;

  if (body.scopeId) {
    const node = await ScopeNodeModel.findById(body.scopeId).lean();
    if (!node) throw ApiError.badRequest(`No location ${body.scopeId} exists to scope this rule to.`);
  }

  try {
    const doc = await NumberingRule.findByIdAndUpdate(id, { $set: body }, { new: true }).lean<NumberingRuleDoc>();
    if (!doc) throw ApiError.notFound('Numbering rule');
    recordAudit(req, { action: 'numbering_rule.update', target: id, category: 'Configuration' });
    sendData(res, await numbering.toView(doc));
  } catch (err) {
    if (isDuplicate(err)) {
      const existing = await NumberingRule.findById(id).lean<NumberingRuleDoc>();
      throw numbering.describeDuplicate(existing?.entity ?? 'this entity');
    }
    throw err;
  }
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const doc = await NumberingRule.findByIdAndDelete(id).lean();
  if (!doc) throw ApiError.notFound('Numbering rule');
  recordAudit(req, { action: 'numbering_rule.delete', target: id, category: 'Configuration' });
  res.status(204).send();
});

/**
 * Render a pattern without saving or consuming a number.
 *
 * Server-side so the screen cannot disagree with what the generator will
 * actually produce — the whole point of not minting IDs in the frontend.
 */
export const preview = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as PreviewNumberingInput;
  const scope = body.scopeId ? await ScopeNodeModel.findById(body.scopeId).lean() : null;

  const draft = {
    _id: 'preview',
    prefix: body.prefix.toUpperCase(),
    pattern: body.pattern,
    startAt: body.startAt,
    sequenceScope: body.sequenceScope,
  } as NumberingRuleDoc;

  const context = { scopeId: body.scopeId, facilityName: scope?.name, category: body.category };
  const samples = [0, 1, 2].map((offset) =>
    numbering.renderPattern(body.pattern, draft, context, Math.max(1, body.startAt) + offset),
  );

  sendData(res, { samples });
});
