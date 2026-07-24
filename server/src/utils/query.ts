import type { FilterQuery, Model, SortOrder } from 'mongoose';
import { buildMeta } from './response.js';
import type { ApiMeta } from '@access-genie/shared';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

export interface PaginationInput {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
}

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
  sort: Record<string, SortOrder>;
}

/**
 * Normalize `?page=&limit=&sort=` into safe values.
 * `limit` is capped so a client cannot ask for the whole collection, and the
 * sort key is checked against an allow-list so it can never reach into an
 * unindexed (or private) field.
 */
export function parsePagination(query: PaginationInput, sortableFields: string[], fallbackSort = '-createdAt'): Pagination {
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
  const rawLimit = Number.parseInt(String(query.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);

  const requested = String(query.sort ?? fallbackSort);
  const desc = requested.startsWith('-');
  const field = desc ? requested.slice(1) : requested;
  const safeField = sortableFields.includes(field) ? field : fallbackSort.replace(/^-/, '');
  const safeDesc = sortableFields.includes(field) ? desc : fallbackSort.startsWith('-');

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    sort: { [safeField]: safeDesc ? -1 : 1 },
  };
}

/** Escape a user-supplied string so it is a literal inside a RegExp. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `?status=Active,Maintenance` → `{ $in: ['Active', 'Maintenance'] }`. */
export function csvFilter(value: unknown): { $in: string[] } | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const values = value.split(',').map((v) => v.trim()).filter(Boolean);
  return values.length ? { $in: values } : undefined;
}

/** Run the count and the page query together and return both. */
export async function paginate<T>(
  model: Model<T>,
  filter: FilterQuery<T>,
  pagination: Pagination,
): Promise<{ items: T[]; meta: ApiMeta }> {
  const [items, total] = await Promise.all([
    model.find(filter).sort(pagination.sort).skip(pagination.skip).limit(pagination.limit).lean<T[]>(),
    model.countDocuments(filter),
  ]);

  return { items, meta: buildMeta(pagination.page, pagination.limit, total) };
}
