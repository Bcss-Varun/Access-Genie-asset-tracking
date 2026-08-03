import type { ApiErrorCode } from '@access-genie/shared';

/**
 * The only error type route code should throw. The error middleware turns it
 * into the `ApiFailure` envelope; anything else that reaches the middleware is
 * treated as an unexpected 500 and its message is withheld from the client.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details?: { path: string; message: string }[];
  /** Expected errors are safe to show the user; unexpected ones are not. */
  readonly isOperational = true;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message = 'Bad request'): ApiError {
    return new ApiError(400, 'BAD_REQUEST', message);
  }

  static validation(message: string, details?: { path: string; message: string }[]): ApiError {
    return new ApiError(422, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static tokenExpired(message = 'Access token expired'): ApiError {
    return new ApiError(401, 'TOKEN_EXPIRED', message);
  }

  static forbidden(message = 'You do not have access to this resource'): ApiError {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(resource = 'Resource'): ApiError {
    return new ApiError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message = 'Resource already exists'): ApiError {
    return new ApiError(409, 'CONFLICT', message);
  }

  static internal(message = 'Something went wrong'): ApiError {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }
}
