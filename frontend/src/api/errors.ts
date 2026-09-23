import type { AxiosError } from 'axios';

/** A transport-independent error that forms and pages can safely render. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string> = {},
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toApiError(error: AxiosError<unknown>): ApiRequestError {
  const payload = error.response?.data;
  // Gate every nested read: gateways can return HTML, and malformed API bodies
  // must not replace the original failure with a JavaScript exception.
  if (isRecord(payload) && payload.success === false && isRecord(payload.error)
    && typeof payload.error.message === 'string' && typeof payload.error.code === 'string') {
    const details = Array.isArray(payload.error.details) ? payload.error.details : [];
    const fieldErrors = Object.fromEntries(details.flatMap((detail) =>
      isRecord(detail) && typeof detail.path === 'string' && typeof detail.message === 'string'
        ? [[detail.path, detail.message]] : [],
    ));
    return new ApiRequestError(
      payload.error.message, payload.error.code, error.response?.status ?? 500, fieldErrors,
      typeof payload.requestId === 'string' ? payload.requestId : undefined,
    );
  }

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new ApiRequestError('The request timed out. Check your connection and try again.', 'TIMEOUT', 0);
  }

  return new ApiRequestError(
    'Cannot reach the Access Genie API. Please try again shortly.',
    'NETWORK_ERROR', error.response?.status ?? 0,
  );
}
