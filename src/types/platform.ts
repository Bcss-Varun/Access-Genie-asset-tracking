// ─────────────────────────────────────────────────────────────────────────────
// Platform types — session, RBAC, scope tree, navigation
// (demo: a fake session drives role-adaptive nav + permission-gated pages)
// ─────────────────────────────────────────────────────────────────────────────

/** Module-level permission keys. Nav groups & pages gate on these. */
export type ModuleKey =
  | 'workspace'
  | 'assets'
  | 'tracking'
  | 'ai'
  | 'maintenance'
  | 'inventory'
  | 'operations'
  | 'analytics'
  | 'alerts'
  | 'compliance'
  | 'admin'
  | 'system';

export type RoleId =
  | 'super_admin'
  | 'org_admin'
  | 'facility_manager'
  | 'maintenance_manager'
  | 'technician'
  | 'executive'
  | 'security_officer';

export interface Role {
  id: RoleId;
  name: string;
  tier: 'Platform' | 'Tenant Admin' | 'Management' | 'Field' | 'Business';
  /** Modules this role can see/enter. `*` = all modules. */
  modules: ModuleKey[] | '*';
}

export interface User {
  id: string;
  name: string;
  email: string;
  initials: string;
  roleId: RoleId;
  title: string;
  /** Home scope the user defaults into. */
  homeScopeId: string;
}

export interface Session {
  user: User;
  role: Role;
  modules: ModuleKey[]; // resolved (never '*')
}

// ── Scope tree (Org ▸ Region ▸ Facility ▸ Building ▸ Floor ▸ Zone) ────────────
export type ScopeLevel = 'org' | 'region' | 'facility' | 'building' | 'floor' | 'zone';

export interface ScopeNode {
  id: string;
  name: string;
  level: ScopeLevel;
  children?: ScopeNode[];
  /** rough asset count for the demo scope chips */
  assetCount?: number;
}

// ── Navigation ───────────────────────────────────────────────────────────────
export interface NavItem {
  label: string;
  href: string;
  icon: string; // emoji for the demo
  /** Optional badge count shown on the right. */
  badge?: number;
  /** Marks routes that are not built yet (render a "coming soon" state). */
  comingSoon?: boolean;
}

export interface NavGroup {
  id: string;
  label: string; // section header, e.g. "ASSETS"
  module: ModuleKey; // gate: shown only if session has this module
  items: NavItem[];
}
