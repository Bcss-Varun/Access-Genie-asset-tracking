import { formatMoney } from '@/lib/utils';
import type { AnalyticsUnit, ReportFieldType } from '@access-genie/shared';

/**
 * Chart tokens for Analytics & Reporting.
 *
 * Two palettes, kept apart on purpose.
 *
 * **Status** is the product's existing status vocabulary — the same greens,
 * ambers and reds every other module paints a status with. It is *reserved*: it
 * never stands in for "series 3", because a reader who has learned that amber
 * means "due soon" everywhere else should not meet it here as an arbitrary
 * category. Its members sit below 3:1 against a white surface, so every mark
 * drawn in them carries a visible label and a count — which is the relief that
 * requirement asks for, and is why these charts label rather than rely on hue.
 *
 * **Series** is for the one place this module genuinely needs two distinguishable
 * lines on the same axis (work raised against work completed). Two hues, fixed
 * order, never cycled: indigo and teal clear the colour-vision separation
 * threshold comfortably and both hold 3:1 against the surface. Anything needing
 * a third series is a sign the chart should be split, not extended.
 *
 * Single-series magnitude charts use `SEQUENTIAL` — one hue, no legend, because
 * the title already names the series.
 */

export const STATUS_HEX: Record<string, string> = {
  Active: '#10b981',
  Maintenance: '#f59e0b',
  Missing: '#ef4444',
  'End Of Life': '#64748b',
  End_Of_Life: '#64748b',
  Staging: '#6366f1',
};

/** The fallback for a status the palette has no entry for. */
export const NEUTRAL_HEX = '#94a3b8';

/** Fixed order. A chart never picks the second hue before the first. */
export const SERIES_HEX = ['#4f46e5', '#0d9488'] as const;

/** One hue for magnitude, used for every single-series bar and area. */
export const SEQUENTIAL_HEX = '#6366f1';

export const statusColor = (status: string) => STATUS_HEX[status] ?? NEUTRAL_HEX;

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

/** Compact counts, so an axis of five-figure numbers stays readable. */
export function formatCount(value: number): string {
  if (Math.abs(value) >= 1_00_00_000) return `${Math.round(value / 1_00_00_000)}Cr`;
  if (Math.abs(value) >= 1_00_000) return `${Math.round(value / 1_00_000)}L`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1_000)}k`;
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

/** Format by the unit a KPI declares, rather than by guessing from the number. */
export function formatByUnit(value: number, unit: AnalyticsUnit): string {
  if (unit === 'currency') return formatMoney(value);
  if (unit === 'percent') return `${Math.round(value * 10) / 10}%`;
  return formatCount(value);
}

/** The same, for a report column's declared type. */
export function formatByFieldType(value: unknown, type: ReportFieldType): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value !== 'number') return String(value);
  if (type === 'currency') return formatMoney(value);
  if (type === 'percent') return `${Math.round(value * 10) / 10}%`;
  return formatCount(value);
}

/** Full precision, for a table cell where the compact form would hide detail. */
export function formatExact(value: number): string {
  return new Intl.NumberFormat('en-IN').format(Math.round(value * 100) / 100);
}
