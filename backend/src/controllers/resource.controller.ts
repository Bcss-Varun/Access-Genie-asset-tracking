import type { Request, RequestHandler, Response } from 'express';
import type { FilterQuery, Model, UpdateQuery } from 'mongoose';
import { z, type ZodType } from 'zod';
import { listQuerySchema, type ListQueryInput } from '../validators/common.js';
import { validate, validatedQuery } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { csvFilter, paginate, parsePagination } from '../utils/query.js';
import { aliasId, sendData, sendList } from '../utils/response.js';
import { nextId } from '../models/Counter.js';
import { recordAudit } from '../services/audit.service.js';
import { requireScope } from '../middleware/scope.js';
import { assetClause, locationClause } from '../services/tenancy.service.js';

/**
 * A read endpoint for a reference collection.
 *
 * Roughly thirty collections in this platform are read-mostly lookups — asset
 * classes, PM schedules, certifications, devices, print jobs. Each needs the
 * same four things: paginate, filter on a handful of indexed fields, optional
 * free-text search, and fetch one by id. Hand-writing that thirty times would
 * be thirty chances to get pagination or the sort allow-list subtly wrong.
 *
 * So it is written once, here, and each collection supplies only what is
 * genuinely specific to it: which fields may be filtered, which may be sorted,
 * and whether it carries a text index.
 *
 * A collection graduates out of this factory the moment it grows behaviour of
 * its own — see asset.service.ts or trackingAlert.service.ts for what that
 * looks like.
 */
export interface ResourceOptions {
  /**
   * Query keys that filter the field of the same name. Comma-separated values
   * become an `$in`, so `?state=Open,Assigned` works everywhere.
   */
  filters?: string[];
  /** Query keys that filter a *differently named* field. */
  aliases?: Record<string, string>;
  /** Fields the client may sort by — an allow-list, never free-form input. */
  sortable: string[];
  /** Default order, e.g. `-createdAt`. */
  defaultSort: string;
  /** Set when the collection has a text index, which enables `?q=`. */
  text?: boolean;
  /**
   * Small, bounded reference sets (facilities, zones, templates) are returned
   * whole: paginating a 20-row lookup only makes the client reassemble it.
   */
  paginated?: boolean;
  /** Human name used in "… not found" messages. */
  label: string;
  /**
   * Re-expose `_id` under a domain name for collections keyed by a business
   * identifier the contract also names (e.g. a movement trail by `assetId`).
   */
  idAlias?: string;
  /**
   * How this collection sits inside the tenant boundary.
   *
   * Reference data that belongs to the organisation rather than to a site —
   * help articles, role definitions, taxonomy — declares nothing and is
   * returned whole. Anything asset-derived must declare how it joins, or a
   * facility manager reads the whole estate's rows through it:
   *
   *   `location`  — the record carries a scope-node id (default `location.id`)
   *   `asset`     — the record references an asset (default `assetId`)
   *   `assetKey`  — the record is *keyed by* the asset id (`_id`)
   */
  scope?: { by: 'location' | 'asset' | 'assetKey'; field?: string };
  /**
   * Makes the collection writable.
   *
   * Most of these started life as read-only lookups because the screens that
   * showed them only ever mutated React state — an API key "revoked" in the UI
   * came back on reload. Persisting those actions needs the same three
   * handlers each time (validate, mint an id, write, audit), so they are built
   * here alongside the reads rather than hand-written per collection.
   */
  writable?: WritableOptions;
}

export interface WritableOptions {
  /** Body schema for `POST`. Omit to leave the collection create-less. */
  create?: ZodType;
  /** Body schema for `PATCH`. Omit to leave records immutable once written. */
  update?: ZodType;
  /**
   * Counter name and prefix for minting `_id`, e.g. `['apiKey', 'KEY']` →
   * `KEY-9`. Omit when the client supplies the id in the create body.
   */
  idSequence?: [name: string, prefix: string];
  /**
   * Audit action stem, e.g. `api_key` → `api_key.create`. Every write to a
   * writable resource is recorded; there is no way to configure that off.
   */
  audit: { action: string; category: string };
  /** Fields stamped on create — `createdAt` on most, `raisedAt` on a few. */
  timestamps?: { createdAt?: string; updatedAt?: string };
  /** `DELETE` marks this field with the current time instead of removing the row. */
  softDelete?: string;
}

export interface ResourceHandlers {
  /** Validates `?page/limit/sort/q` plus the configured filters. */
  validateQuery: RequestHandler;
  list: RequestHandler;
  getOne: RequestHandler;
  /** Present only when `writable.create` is configured; throws otherwise. */
  create: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
  /** `validate({ body })` for the configured create/update schemas. */
  validateCreate: RequestHandler;
  validateUpdate: RequestHandler;
}

/** Build the Zod schema for a resource's query string from its filter config. */
function querySchemaFor(options: ResourceOptions): ZodType {
  const keys = [...(options.filters ?? []), ...Object.keys(options.aliases ?? {})];
  const shape = Object.fromEntries(keys.map((key) => [key, z.string().trim().min(1).optional()]));
  return listQuerySchema.extend(shape);
}

/** Translate the validated query into a Mongo filter. */
function buildFilter<T>(query: Record<string, unknown>, options: ResourceOptions): FilterQuery<T> {
  const filter: Record<string, unknown> = {};

  for (const key of options.filters ?? []) {
    const value = csvFilter(query[key]);
    if (value) filter[key] = value.$in.length === 1 ? value.$in[0] : value;
  }

  for (const [key, field] of Object.entries(options.aliases ?? {})) {
    const value = csvFilter(query[key]);
    if (value) filter[field] = value.$in.length === 1 ? value.$in[0] : value;
  }

  if (options.text && typeof query.q === 'string' && query.q) {
    filter.$text = { $search: query.q };
  }

  return filter as FilterQuery<T>;
}

export function createResource<T>(model: Model<T>, options: ResourceOptions): ResourceHandlers {
  const paginated = options.paginated ?? true;

  /**
   * The tenant clause for this collection, or `{}` when it holds org-level data.
   *
   * Built per request because the asset-id variant depends on which assets the
   * caller can see, which is a query — memoised on the scope object so a
   * request touching several such collections still resolves it once.
   */
  const tenantClause = async (req: Request): Promise<Record<string, unknown>> => {
    if (!options.scope) return {};
    const scope = requireScope(req);
    if (options.scope.by === 'location') return locationClause(scope, options.scope.field ?? 'location.id');
    if (options.scope.by === 'assetKey') return assetClause(scope, options.scope.field ?? '_id');
    return assetClause(scope, options.scope.field ?? 'assetId');
  };

  const list = asyncHandler(async (req: Request, res: Response) => {
    const query = validatedQuery<ListQueryInput & Record<string, string | undefined>>(res);
    const filter = { ...buildFilter<T>(query, options), ...(await tenantClause(req)) } as FilterQuery<T>;
    const pagination = parsePagination(query, options.sortable, options.defaultSort);

    const alias = <R extends { _id: unknown }>(rows: R[]) =>
      options.idAlias ? aliasId(rows, options.idAlias) : rows;

    if (!paginated) {
      const items = await model.find(filter).sort(pagination.sort).lean();
      sendData(res, alias(items as { _id: unknown }[]));
      return;
    }

    const { items, meta } = await paginate(model, filter, pagination);
    sendList(res, alias(items as { _id: unknown }[]), meta);
  });

  const getOne = asyncHandler(async (req: Request, res: Response) => {
    // The tenant clause is ANDed onto the id lookup rather than checked after
    // it, so a record outside the estate is a plain 404 — telling the caller a
    // record exists that they may not read is itself a cross-tenant disclosure.
    const record = await model
      .findOne({ _id: req.params.id as string, ...(await tenantClause(req)) } as FilterQuery<T>)
      .lean();
    if (!record) throw ApiError.notFound(options.label);
    sendData(res, options.idAlias ? aliasId([record as { _id: unknown }], options.idAlias)[0] : record);
  });

  // ── Writes ─────────────────────────────────────────────────────────────────
  const writable = options.writable;

  /** A route mounted without the matching schema is a wiring bug, not a 4xx. */
  const unconfigured = (verb: string): RequestHandler => () => {
    throw ApiError.internal(`${options.label} is not configured for ${verb}`);
  };

  const create = writable?.create
    ? asyncHandler(async (req: Request, res: Response) => {
        const body = req.body as Record<string, unknown>;

        const _id = writable.idSequence
          ? await nextId(writable.idSequence[0], writable.idSequence[1])
          : body.id;

        if (!_id) throw ApiError.badRequest(`${options.label} needs an id`);

        const now = new Date();
        const stamps: Record<string, Date> = {};
        if (writable.timestamps?.createdAt) stamps[writable.timestamps.createdAt] = now;
        if (writable.timestamps?.updatedAt) stamps[writable.timestamps.updatedAt] = now;

        // `id` is the wire name; `_id` is the storage name. Dropping it here
        // stops a stray duplicate field landing in the document.
        const { id: _ignored, ...rest } = body;

        const created = await model.create({ ...rest, ...stamps, _id });

        recordAudit(req, {
          action: `${writable.audit.action}.create`,
          target: String(_id),
          category: writable.audit.category,
        });

        sendData(res, created.toJSON(), 201);
      })
    : unconfigured('create');

  const update = writable?.update
    ? asyncHandler(async (req: Request, res: Response) => {
        const id = req.params.id as string;
        const patch = { ...(req.body as Record<string, unknown>) };
        if (writable.timestamps?.updatedAt) patch[writable.timestamps.updatedAt] = new Date();

        // `runValidators` matters here: without it a PATCH bypasses every enum
        // and range the schema declares, which is exactly the path a UI bug
        // takes to put "Activee" in a status field.
        //
        // The cast is unavoidable in a generic factory: `T` is unknown here, so
        // the compiler cannot check the patch against it. The Zod schema on the
        // route does that check, and Mongoose's validators do it again.
        const updated = await model
          .findByIdAndUpdate(id, { $set: patch } as UpdateQuery<T>, { new: true, runValidators: true })
          .lean();

        if (!updated) throw ApiError.notFound(options.label);

        recordAudit(req, {
          action: `${writable.audit.action}.update`,
          target: id,
          category: writable.audit.category,
          metadata: { fields: Object.keys(req.body as object) },
        });

        sendData(res, updated);
      })
    : unconfigured('update');

  const remove = writable
    ? asyncHandler(async (req: Request, res: Response) => {
        const id = req.params.id as string;

        // Soft delete where the record is evidence — a revoked API key still
        // has to explain the calls it made last week.
        const gone = writable.softDelete
          ? await model
              .findByIdAndUpdate(id, { $set: { [writable.softDelete]: new Date() } } as UpdateQuery<T>, { new: true })
              .lean()
          : await model.findByIdAndDelete(id).lean();

        if (!gone) throw ApiError.notFound(options.label);

        recordAudit(req, {
          action: `${writable.audit.action}.${writable.softDelete ? 'revoke' : 'delete'}`,
          target: id,
          category: writable.audit.category,
        });

        if (writable.softDelete) sendData(res, gone);
        else res.status(204).end();
      })
    : unconfigured('delete');

  return {
    validateQuery: validate({ query: querySchemaFor(options) }),
    list,
    getOne,
    create,
    update,
    remove,
    validateCreate: writable?.create ? validate({ body: writable.create }) : unconfigured('create'),
    validateUpdate: writable?.update ? validate({ body: writable.update }) : unconfigured('update'),
  };
}
