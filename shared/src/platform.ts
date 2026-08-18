// ─────────────────────────────────────────────────────────────────────────────
// Platform contract — identity, RBAC and the location/scope tree.
// Shared verbatim by the API (enforcement) and the web client (adaptive UI).
// The API is the enforcement point; the client only mirrors it to hide chrome.
// ─────────────────────────────────────────────────────────────────────────────

/** Module-level permission keys. Routes and nav sections gate on these. */
export const MODULE_KEYS = [
  'workspace',
  'assets',
  'tracking',
  'ai',
  'maintenance',
  'operations',
  'analytics',
  'alerts',
  'compliance',
  'admin',
  'system',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const ROLE_IDS = [
  'super_admin',
  'org_admin',
  'facility_manager',
  'maintenance_manager',
  'technician',
  'executive',
  'security_officer',
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

export type RoleTier = 'Platform' | 'Tenant Admin' | 'Management' | 'Field' | 'Business';

export interface Role {
  id: RoleId;
  name: string;
  tier: RoleTier;
  /** Modules this role may enter. `'*'` = every module. */
  modules: ModuleKey[] | '*';
}

/**
 * The role matrix. Single source of truth: the API's `requireModule` guard and
 * the client's sidebar both read it, so a permission can never drift between
 * "what the menu shows" and "what the endpoint allows".
 */
export const ROLES: Record<RoleId, Role> = {
  super_admin: { id: 'super_admin', name: 'Super Admin', tier: 'Platform', modules: '*' },
  org_admin: {
    id: 'org_admin',
    name: 'Organization Admin',
    tier: 'Tenant Admin',
    modules: ['workspace', 'assets', 'tracking', 'ai', 'maintenance', 'operations', 'analytics', 'alerts', 'compliance', 'admin'],
  },
  facility_manager: {
    id: 'facility_manager',
    name: 'Facility Manager',
    tier: 'Management',
    modules: ['workspace', 'assets', 'tracking', 'ai', 'maintenance', 'operations', 'analytics', 'alerts', 'compliance'],
  },
  maintenance_manager: {
    id: 'maintenance_manager',
    name: 'Maintenance Manager',
    tier: 'Management',
    modules: ['workspace', 'assets', 'maintenance', 'ai', 'alerts', 'analytics'],
  },
  technician: {
    id: 'technician',
    name: 'Technician',
    tier: 'Field',
    modules: ['workspace', 'assets', 'maintenance', 'tracking'],
  },
  executive: {
    id: 'executive',
    name: 'Executive',
    tier: 'Business',
    modules: ['workspace', 'ai', 'analytics', 'compliance'],
  },
  security_officer: {
    id: 'security_officer',
    name: 'Security Officer',
    tier: 'Field',
    modules: ['workspace', 'tracking', 'alerts', 'compliance'],
  },
};

/** Expand a role's module grant (`'*'` → every module). */
export function resolveModules(roleId: RoleId): ModuleKey[] {
  const role = ROLES[roleId];
  return role.modules === '*' ? [...MODULE_KEYS] : [...role.modules];
}

export function hasModule(modules: ModuleKey[], module: ModuleKey): boolean {
  return modules.includes(module);
}

// ── Identity ─────────────────────────────────────────────────────────────────

/** A user as the API returns it — never includes the password hash. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  roleId: RoleId;
  title: string;
  /** Scope node the user defaults into (see `ScopeNode`). */
  homeScopeId: string;
  /** Contact details the user maintains themselves, on the profile screen. */
  phone?: string;
  timezone?: string;
  /** Whether a verified authenticator is enrolled. The secret never leaves the server. */
  mfaEnabled?: boolean;
  status: 'active' | 'suspended';
  lastLoginAt?: string;
  createdAt: string;
}

/** Everything the client needs to render an authenticated session. */
export interface Session {
  user: PublicUser;
  role: Role;
  /** Resolved module grants — never `'*'`. */
  modules: ModuleKey[];
}

// ── Scope tree ───────────────────────────────────────────────────────────────
//
//   Group ▸ Organization ▸ Region ▸ Facility ▸ Building ▸ Floor ▸ Zone
//
// `group` is the holding company above the operating ones — what lets someone
// switch from Access Genie to a sister company and see the whole product follow
// them. It is optional: a deployment with a single organisation has no group
// node, and the tree is rooted at the org exactly as before.
//
// Note what this is *not*. Scoping is a filter over shared collections, not a
// tenancy boundary — anyone holding the grant can select any organisation in
// the tree. Real isolation (a `tenantId` on every row, enforced below the
// query layer) is a separate, larger piece of work; when it lands, this is
// where it will attach.
export const SCOPE_LEVELS = ['group', 'org', 'region', 'facility', 'building', 'floor', 'zone'] as const;
export type ScopeLevel = (typeof SCOPE_LEVELS)[number];

export interface ScopeNode {
  id: string;
  name: string;
  level: ScopeLevel;
  parentId?: string;
  assetCount?: number;
  children?: ScopeNode[];
}
