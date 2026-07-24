// ─────────────────────────────────────────────────────────────────────────────
// API envelope & transport contracts.
// Every response — success or failure — is one of these two shapes, so the
// client can branch on `success` alone and never guess at an error body.
// ─────────────────────────────────────────────────────────────────────────────

import type { PublicUser, Role, ModuleKey } from './platform.js';

export interface ApiMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  /** Present on paginated list endpoints. */
  meta?: ApiMeta;
}

export interface ApiFailure {
  success: false;
  error: {
    /** Machine-readable code, e.g. `NOT_FOUND`, `VALIDATION_ERROR`. */
    code: string;
    message: string;
    /** Field-level detail from the validation layer. */
    details?: { path: string; message: string }[];
  };
  /** Correlates a client-visible failure with the server log line. */
  requestId?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Error codes the API can emit. Kept narrow so clients can switch on them. */
export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'TOKEN_EXPIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

// ── Query contracts ──────────────────────────────────────────────────────────

/** Query string accepted by every list endpoint. */
export interface ListQuery {
  page?: number;
  limit?: number;
  /** `field` ascending, `-field` descending. */
  sort?: string;
  /** Free-text search across the resource's indexed text fields. */
  q?: string;
}

export interface AssetListQuery extends ListQuery {
  status?: string;
  category?: string;
  health?: string;
  criticality?: string;
  trackingTech?: string;
  facility?: string;
}

export interface WorkOrderListQuery extends ListQuery {
  status?: string;
  priority?: string;
  type?: string;
  assetId?: string;
  assignedTo?: string;
  overdue?: boolean;
}

export interface AlertListQuery extends ListQuery {
  status?: string;
  severity?: string;
  assetId?: string;
}

// ── Auth contracts ───────────────────────────────────────────────────────────

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * The refresh token is delivered as an httpOnly cookie, never in the body —
 * so a XSS payload cannot read it. The short-lived access token is held in
 * client memory only.
 */
export interface AuthPayload {
  user: PublicUser;
  role: Role;
  modules: ModuleKey[];
  accessToken: string;
  /** Access-token lifetime in seconds; the client refreshes just before it. */
  expiresIn: number;
}

/** One entry in the demo persona switcher (`GET /auth/personas`). */
export interface Persona {
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  title: string;
  initials: string;
}
