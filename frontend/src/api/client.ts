import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ApiFailure, ApiMeta, ApiResponse, AuthPayload } from '@access-genie/shared';
import { ApiRequestError, toApiError } from './errors';
export { ApiRequestError } from './errors';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';
const TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT ?? 20_000);

/**
 * The access token lives in a module variable, not in localStorage.
 *
 * A token in localStorage is readable by any script that gets injected into the
 * page; a token in memory dies with the tab. The cost is that a refresh needs a
 * round-trip on page load — which is what the httpOnly refresh cookie is for.
 */
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Registered by the auth provider so a dead session can bounce to /login. */
export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

export const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // send the refresh cookie
  headers: { 'Content-Type': 'application/json' },
  timeout: TIMEOUT_MS,
});

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/**
 * Refresh-on-401.
 *
 * Concurrent 401s share a single refresh promise, so ten parallel queries
 * failing at once produce one refresh call rather than ten — which matters
 * because refresh tokens rotate, and ten racing rotations would invalidate
 * each other and log the user out.
 */
let refreshPromise: Promise<AuthPayload> | null = null;

export async function refreshAuth(): Promise<AuthPayload> {
  refreshPromise ??= axios
    .post<ApiResponse<AuthPayload>>(`${BASE_URL}/auth/refresh`, null, { withCredentials: true, timeout: TIMEOUT_MS })
    .then((res) => {
      if (!res.data.success) throw new Error('Refresh rejected');
      setAccessToken(res.data.data.accessToken);
      return res.data.data;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

interface RetryableRequest extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiFailure>) => {
    const request = error.config as RetryableRequest | undefined;
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;

    const isAuthEndpoint = request?.url?.includes('/auth/');
    const shouldRefresh = status === 401 && !request?._retried && !isAuthEndpoint;

    if (shouldRefresh && request) {
      try {
        const { accessToken: token } = await refreshAuth();
        request._retried = true;
        request.headers.Authorization = `Bearer ${token}`;
        return await http.request(request);
      } catch {
        setAccessToken(null);
        onSessionExpired?.();
      }
    }

    // A 401 we could not refresh past means the session is genuinely over.
    if (status === 401 && !isAuthEndpoint && code !== 'TOKEN_EXPIRED') {
      setAccessToken(null);
      onSessionExpired?.();
    }

    return Promise.reject(toApiError(error));
  },
);

// ── Typed helpers ────────────────────────────────────────────────────────────
// Every endpoint returns the `{ success, data }` envelope; these unwrap it so
// call sites deal in domain objects rather than transport shapes.

export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await http.get<ApiResponse<T>>(url, { params });
  if (!data.success) throw new ApiRequestError(data.error.message, data.error.code, 200);
  return data.data;
}

/** For paginated endpoints — returns the items *and* the `meta` block. */
export async function apiList<T>(url: string, params?: Record<string, unknown>): Promise<{ items: T[]; meta: ApiMeta }> {
  const { data } = await http.get<ApiResponse<T[]>>(url, { params });
  if (!data.success) throw new ApiRequestError(data.error.message, data.error.code, 200);
  return { items: data.data, meta: data.meta ?? { page: 1, limit: data.data.length, total: data.data.length, totalPages: 1, hasNext: false, hasPrev: false } };
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await http.post<ApiResponse<T>>(url, body);
  if (!data.success) throw new ApiRequestError(data.error.message, data.error.code, 200);
  return data.data;
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await http.patch<ApiResponse<T>>(url, body);
  if (!data.success) throw new ApiRequestError(data.error.message, data.error.code, 200);
  return data.data;
}

/**
 * Most deletes answer `204 No Content` and the call site ignores the result,
 * which is why the default type parameter is `void`. A few return the record
 * they just changed — removing a saved view answers with the caller's whole
 * preferences document — so the envelope is unwrapped when there is one.
 */
export async function apiDelete<T = void>(url: string): Promise<T> {
  const { data } = await http.delete<ApiResponse<T> | ''>(url);
  if (!data) return undefined as T;
  if (!data.success) throw new ApiRequestError(data.error.message, data.error.code, 200);
  return data.data;
}
