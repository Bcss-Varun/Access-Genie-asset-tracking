import type { Response } from 'express';
import type { ApiMeta } from '@access-genie/shared';

/**
 * Normalize a payload to the wire contract: `_id` becomes `id`, `__v` is
 * dropped.
 *
 * The schema plugin's `toJSON` transform does this for hydrated documents, but
 * `.lean()` returns plain objects that never pass through it — and the read
 * paths use `.lean()` precisely because they should. Doing it here instead
 * means the rule is enforced at the one place every response leaves through,
 * so no endpoint can leak a raw Mongo shape by forgetting a transform.
 */
function serialize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(serialize);

  // Dates and ObjectIds are leaves — `res.json` stringifies them correctly.
  if (value instanceof Date) return value;
  if (value === null || typeof value !== 'object') return value;
  if (typeof (value as { toHexString?: unknown }).toHexString === 'function') return String(value);

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  // `id` first, so it leads the JSON object the client receives.
  if ('_id' in source) out.id = typeof source._id === 'object' ? String(source._id) : source._id;

  for (const [key, item] of Object.entries(source)) {
    if (key === '_id' || key === '__v') continue;
    out[key] = serialize(item);
  }

  return out;
}

/** Send `{ success: true, data }`. The single success path for every route. */
export function sendData<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data: serialize(data) });
}

/** Send a paginated list with its `meta` block. */
export function sendList<T>(res: Response, data: T[], meta: ApiMeta, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data: serialize(data), meta });
}

/** Build the `meta` block from the raw pagination inputs. */
export function buildMeta(page: number, limit: number, total: number): ApiMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
