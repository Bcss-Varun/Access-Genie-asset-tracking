import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

/** Terminal 404 — reached only when no route matched. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, 'NOT_FOUND', `Cannot ${req.method} ${req.originalUrl}`));
};

/**
 * Translate anything thrown anywhere in the stack into the `ApiFailure`
 * envelope.
 *
 * Known error types are mapped to precise status codes; anything else becomes
 * a generic 500 whose message is *not* forwarded to the client, because an
 * unexpected error's message is as likely to contain a connection string as
 * it is to be useful.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let apiError: ApiError;

  if (err instanceof ApiError) {
    apiError = err;
  } else if (err instanceof ZodError) {
    apiError = ApiError.validation(
      'Request validation failed',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  } else if (err instanceof mongoose.Error.ValidationError) {
    apiError = ApiError.validation(
      'Document validation failed',
      Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    );
  } else if (err instanceof mongoose.Error.CastError) {
    apiError = ApiError.badRequest(`Invalid value for "${err.path}"`);
  } else if (isDuplicateKeyError(err)) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? 'field';
    apiError = ApiError.conflict(`A record with this ${field} already exists`);
  } else {
    apiError = ApiError.internal();
  }

  // 5xx means we broke; log the stack. 4xx means the caller did; log a line.
  if (apiError.statusCode >= 500) {
    logger.error(err instanceof Error ? err.message : 'Unknown error', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      stack: err instanceof Error ? err.stack : undefined,
    });
  } else {
    logger.warn(`${apiError.code}: ${apiError.message}`, {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
    });
  }

  res.status(apiError.statusCode).json({
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
      // The real message of an unexpected error is developer-only.
      ...(env.isProd || apiError.statusCode < 500
        ? {}
        : { debug: err instanceof Error ? err.message : String(err) }),
    },
    requestId: req.requestId,
  });
};

interface DuplicateKeyError {
  code: number;
  keyPattern?: Record<string, unknown>;
}

function isDuplicateKeyError(err: unknown): err is DuplicateKeyError {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}
