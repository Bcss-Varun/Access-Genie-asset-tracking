import type { DashboardLayout, DashboardSummary, KpiId, ModuleKey, RoleId } from '@access-genie/shared';
import { ROLE_LAYOUTS } from './layouts';
import { KPI_META, WIDGETS, WIDGETS_BY_ID, type WidgetDef } from './registry';

/**
 * Turning "what this person saved" plus "what this role opens on" into the
 * dashboard that actually renders.
 *
 * Three filters, in this order, and the order matters:
 *
 *   1. **Saved layout wins over the role default.** Absent means never
 *      customised, which is different from an empty layout — someone who
 *      deliberately removed every widget gets an empty dashboard, not a reset.
 *   2. **Unknown ids are dropped.** A layout saved by an older build may name a
 *      widget that has since been renamed or removed. Silently forgetting it is
 *      the only behaviour that does not strand the user on a screen that cannot
 *      render.
 *   3. **Grants are enforced last**, so a layout is never rewritten by a
 *      temporary permission change: lose the finance grant and the tile
 *      disappears; regain it and it comes back exactly where it was.
 *
 * A fourth rule is about honesty rather than access: a KPI the server did not
 * send is not rendered as zero. The response omits what the caller may not read
 * *and* what the estate cannot answer, and both cases mean "no tile" rather
 * than "0".
 */
export interface ResolvedDashboard {
  kpis: { id: KpiId; label: string; href?: string }[];
  main: WidgetDef[];
  rail: WidgetDef[];
  /** True when the user has a layout of their own rather than the role default. */
  customized: boolean;
}

export function defaultLayoutFor(roleId: RoleId): DashboardLayout {
  return ROLE_LAYOUTS[roleId] ?? ROLE_LAYOUTS.super_admin;
}

export function resolveDashboard({
  roleId,
  modules,
  saved,
  summary,
}: {
  roleId: RoleId;
  modules: ModuleKey[];
  saved: DashboardLayout | null;
  summary: DashboardSummary | undefined;
}): ResolvedDashboard {
  const layout = saved ?? defaultLayoutFor(roleId);
  const granted = (module: ModuleKey) => modules.includes(module);

  const kpis = layout.kpis
    .filter((id): id is KpiId => id in KPI_META)
    .filter((id) => granted(KPI_META[id].module))
    // The server is the authority on which figures exist for this caller and
    // this scope. No entry, no tile.
    .filter((id) => summary?.kpis[id] !== undefined)
    .map((id) => ({ id, label: KPI_META[id].label, href: KPI_META[id].href }));

  const resolve = (ids: string[], column: 'main' | 'rail') =>
    ids
      .map((id) => WIDGETS_BY_ID.get(id))
      .filter((w): w is WidgetDef => w !== undefined)
      .filter((w) => w.column === column || w.column === 'both')
      .filter((w) => granted(w.module));

  return {
    kpis,
    main: resolve(layout.main, 'main'),
    rail: resolve(layout.rail, 'rail'),
    customized: saved !== null,
  };
}

/** Widgets this session may add to a column but has not placed there yet. */
export function availableWidgets(
  layout: DashboardLayout,
  modules: ModuleKey[],
  column: 'main' | 'rail',
): WidgetDef[] {
  const placed = new Set([...layout.main, ...layout.rail]);
  return WIDGETS.filter((w) => w.column === column || w.column === 'both')
    .filter((w) => modules.includes(w.module))
    .filter((w) => !placed.has(w.id));
}

/** KPIs this session may add but has not placed. */
export function availableKpis(
  layout: DashboardLayout,
  modules: ModuleKey[],
  summary: DashboardSummary | undefined,
): { id: KpiId; label: string }[] {
  const placed = new Set(layout.kpis);
  return (Object.keys(KPI_META) as KpiId[])
    .filter((id) => !placed.has(id))
    .filter((id) => modules.includes(KPI_META[id].module))
    .filter((id) => summary?.kpis[id] !== undefined)
    .map((id) => ({ id, label: KPI_META[id].label }));
}

/** Move an entry within a list. Out-of-range moves are no-ops, not errors. */
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}
