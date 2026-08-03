import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../utils/ApiError.js';

interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Validate a request against Zod schemas before the controller runs, so every
 * controller can treat its inputs as already-correct and typed.
 *
 * Parsed output replaces the raw input where Express allows it, which is what
 * makes coercion (`"25"` → `25`) and stripping of unknown keys actually reach
 * the handler. In Express 5 `req.query` is a getter, so the parsed query is
 * exposed as `res.locals.query` instead of being assigned back.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, res, next) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) res.locals.query = schemas.query.parse(req.query);
      next();
    } catch (err) {
      next(err); // ZodError → 422 in the error middleware
    }
  };
}

/**
 * Read the validated query a `validate({ query })` call produced.
 * Throws rather than falling back to raw input: a silent fallback would let a
 * missing `validate()` call slip through as "no filters" instead of failing.
 */
export function validatedQuery<T>(res: { locals: Record<string, unknown> }): T {
  const query = res.locals.query;
  if (query === undefined) {
    throw ApiError.internal('Route is missing its query validation middleware');
  }
  return query as T;
}
