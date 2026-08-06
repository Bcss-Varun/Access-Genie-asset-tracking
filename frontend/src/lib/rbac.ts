// ─────────────────────────────────────────────────────────────────────────────
// Identity, the role matrix, and the location tree.
//
// The role matrix is a *contract*, not data: the API's `requireModule` guard and
// this client read the same table from `@access-genie/shared`, so a permission
// can never drift between "what the menu shows" and "what the endpoint allows".
// It is re-exported here because the screens have always imported it from this
// module.
//
// The people directory and the scope tree *are* data, and arrive with the
// dataset — see lib/dataset.ts for how the hydrated-binding arrangement works.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ROLES,
  resolveModules as resolveRoleModules,
  type ModuleKey,
  type PublicUser,
  type Role,
  type RoleId,
  type ScopeNode,
  type Session,
} from '@access-genie/shared';

/** The role matrix — the same table the API enforces with. */
export const roles: Record<RoleId, Role> = ROLES;

/** Expand a role's module grant (`'*'` → every module). */
export function resolveModules(roleId: RoleId): ModuleKey[] {
  return resolveRoleModules(roleId);
}

export function hasModule(session: Session, module: ModuleKey): boolean {
  return session.modules.includes(module);
}

export function buildSession(user: PublicUser): Session {
  return { user, role: roles[user.roleId], modules: resolveModules(user.roleId) };
}

// ── People ───────────────────────────────────────────────────────────────────
/** Active users — custodian pickers, assignment fields and the team views. */
export let allUsers: PublicUser[] = [];

export const userById = (id: string): PublicUser | undefined => allUsers.find((u) => u.id === id);

// ── Location tree ────────────────────────────────────────────────────────────
/** Org ▸ Region ▸ Facility ▸ Building ▸ Zone. A stub until the dataset arrives. */
export let scopeTree: ScopeNode = {
  id: 'ORG-1',
  name: 'Organization',
  level: 'org',
  assetCount: 0,
  children: [],
};

/** Called by the dataset hydration; see lib/dataset.ts. */
export function hydrateDirectory(users: PublicUser[], tree: ScopeNode | null): void {
  allUsers = users ?? [];
  if (tree) scopeTree = tree;
}

/** Flatten the scope tree to a list with depth. */
export function flattenScope(node: ScopeNode = scopeTree, depth = 0): { node: ScopeNode; depth: number }[] {
  const out = [{ node, depth }];
  for (const child of node.children ?? []) out.push(...flattenScope(child, depth + 1));
  return out;
}

/**
 * The levels the scope switcher offers.
 *
 * The hierarchy has two halves that serve different purposes. Org, region and
 * facility describe *the business* — the parent company and the sites under it,
 * which is what someone means when they ask to look at one part of the group.
 * Building, floor and zone describe *where a thing physically sits* inside a
 * site; they are how an asset records its location, not a lens anyone wants to
 * view the company through.
 *
 * The switcher listed all six, so choosing a view meant scrolling past "1st
 * Floor", "rack 1" and "Rack 2" to reach the site you wanted. It offers the
 * organisational levels only — the physical ones still exist, are still what
 * assets are filed under, and are still counted into the site above them.
 */
const SWITCHABLE_LEVELS: ScopeNode['level'][] = ['group', 'org', 'region', 'facility'];

/** The two levels the dashboard's Organization filter offers: the group and the companies in it. */
export const ORGANIZATION_LEVELS: ScopeNode['level'][] = ['group', 'org'];

/** Everything below an organisation — what the dashboard's Location filter offers. */
export const LOCATION_LEVELS: ScopeNode['level'][] = ['region', 'facility', 'building'];

/**
 * The organisations selectable in the dashboard's Organization filter.
 *
 * The group itself is first ("everything"), then each company under it. A
 * deployment with a single organisation and no group node yields one entry,
 * and the filter renders as a static label rather than a dropdown of one.
 */
export function organizationScopes(): { node: ScopeNode; depth: number }[] {
  return flattenScope().filter(({ node }) => ORGANIZATION_LEVELS.includes(node.level));
}

/**
 * Sites inside one organisation.
 *
 * Scoped to the selected organisation rather than the whole tree, which is what
 * keeps the two filters from contradicting each other: you cannot pick a
 * facility belonging to a company you are not looking at.
 */
export function locationScopesWithin(organizationId: string): { node: ScopeNode; depth: number }[] {
  const org = findScope(organizationId);
  if (!org) return [];
  return flattenScope(org, 0)
    .filter(({ node }) => LOCATION_LEVELS.includes(node.level))
    .map(({ node, depth }) => ({ node, depth: Math.max(0, depth - 1) }));
}

/** The organisation a scope node sits in — the Organization filter's value for any selection. */
export function organizationOf(scopeId: string): ScopeNode | undefined {
  const path: ScopeNode[] = [];
  const walk = (node: ScopeNode, trail: ScopeNode[]): boolean => {
    const next = [...trail, node];
    if (node.id === scopeId) {
      path.push(...next);
      return true;
    }
    return (node.children ?? []).some((child) => walk(child, next));
  };
  walk(scopeTree, []);

  // The deepest organisation on the path, falling back to the group so a
  // selection made above any company still resolves to something.
  return [...path].reverse().find((n) => n.level === 'org') ?? path.find((n) => n.level === 'group');
}

/**
 * Org and the sites beneath it, for the switcher.
 *
 * Depth is recomputed over the filtered set rather than carried through from
 * the full tree, so a facility sitting directly under the org indents one step
 * rather than inheriting the indentation of levels that are no longer shown.
 */
export function switchableScopes(): { node: ScopeNode; depth: number }[] {
  const walk = (node: ScopeNode, depth: number): { node: ScopeNode; depth: number }[] => {
    const included = SWITCHABLE_LEVELS.includes(node.level);
    const here = included ? [{ node, depth }] : [];
    // A site nested under something hidden still belongs in the list, so the
    // walk continues through excluded nodes without spending a depth level.
    const below = (node.children ?? []).flatMap((child) => walk(child, included ? depth + 1 : depth));
    return [...here, ...below];
  };
  return walk(scopeTree, 0);
}

export function findScope(id: string, node: ScopeNode = scopeTree): ScopeNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const hit = findScope(id, child);
    if (hit) return hit;
  }
  return undefined;
}
