import type { AssetCategory } from '@access-genie/shared';

/**
 * The glyph for each asset category.
 *
 * This used to be a ternary chain copied into nine files — the registry, the
 * label sheet, lifecycle, two maintenance screens, insights, tracking and the
 * dashboard kit. Every copy stopped at a different point in the list, so the
 * same asset showed a different icon depending on the screen, and two of them
 * still branched on a "Facilities" category that has never existed. Adding a
 * category meant finding all nine; nobody was going to.
 *
 * `Record<AssetCategory, string>` is the point: add a category to the contract
 * without adding it here and this file fails to compile, which is the only
 * reliable way to keep the two in step.
 */
export const CATEGORY_ICONS: Record<AssetCategory, string> = {
  Compute: '💻',
  Storage: '💾',
  Network: '🌐',
  Endpoints: '🖥️',
  Mobile: '📱',
  Peripherals: '⌨️',
  Accessories: '🔌',
  'Audio Visual': '📺',
  Security: '🛡️',
  Software: '💿',
  Infrastructure: '⚡',
  Sensors: '📡',
};

/** Fallback for an asset whose category predates the current list, or is absent. */
const UNKNOWN_CATEGORY = '📦';

/**
 * Accepts a plain `string` because several callers hold a category read from a
 * work order or a CSV, where the value is whatever was stored rather than
 * something the type system has vouched for.
 */
export const categoryEmoji = (category?: string): string =>
  (category && CATEGORY_ICONS[category as AssetCategory]) || UNKNOWN_CATEGORY;
