import { Role, RoleId, User, Session, ModuleKey, ScopeNode } from '@/types/platform';

// ─────────────────────────────────────────────────────────────────────────────
// Roles — each grants a set of modules (drives the role-adaptive sidebar).
// ─────────────────────────────────────────────────────────────────────────────
const ALL_MODULES: ModuleKey[] = [
  'workspace', 'assets', 'tracking', 'ai', 'maintenance', 'inventory',
  'operations', 'analytics', 'alerts', 'compliance', 'admin', 'system',
];

export const roles: Record<RoleId, Role> = {
  super_admin: { id: 'super_admin', name: 'Super Admin', tier: 'Platform', modules: '*' },
  org_admin: {
    id: 'org_admin', name: 'Organization Admin', tier: 'Tenant Admin',
    modules: ['workspace', 'assets', 'tracking', 'ai', 'maintenance', 'inventory', 'operations', 'analytics', 'alerts', 'compliance', 'admin'],
  },
  facility_manager: {
    id: 'facility_manager', name: 'Facility Manager', tier: 'Management',
    modules: ['workspace', 'assets', 'tracking', 'ai', 'maintenance', 'inventory', 'operations', 'analytics', 'alerts', 'compliance'],
  },
  maintenance_manager: {
    id: 'maintenance_manager', name: 'Maintenance Manager', tier: 'Management',
    modules: ['workspace', 'assets', 'maintenance', 'inventory', 'ai', 'alerts', 'analytics'],
  },
  technician: {
    id: 'technician', name: 'Technician', tier: 'Field',
    modules: ['workspace', 'assets', 'maintenance', 'tracking'],
  },
  executive: {
    id: 'executive', name: 'Executive', tier: 'Business',
    modules: ['workspace', 'ai', 'analytics', 'compliance'],
  },
  security_officer: {
    id: 'security_officer', name: 'Security Officer', tier: 'Field',
    modules: ['workspace', 'tracking', 'alerts', 'compliance'],
  },
};

export function resolveModules(roleId: RoleId): ModuleKey[] {
  const r = roles[roleId];
  return r.modules === '*' ? [...ALL_MODULES] : r.modules;
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo users (one per role) — the persona switcher in the user menu swaps these.
// ─────────────────────────────────────────────────────────────────────────────
export const mockUsers: User[] = [
  { id: 'U-001', name: 'John Doe', email: 'john.doe@accessgenie.ai', initials: 'JD', roleId: 'super_admin', title: 'Super Admin', homeScopeId: 'ORG-1' },
  { id: 'U-002', name: 'Sarah Jenkins', email: 'sarah.jenkins@accessgenie.ai', initials: 'SJ', roleId: 'facility_manager', title: 'Facility Manager — Central Warehouse', homeScopeId: 'FAC-WH1' },
  { id: 'U-003', name: 'Miguel Ortiz', email: 'miguel.ortiz@accessgenie.ai', initials: 'MO', roleId: 'maintenance_manager', title: 'Maintenance Manager', homeScopeId: 'FAC-WH1' },
  { id: 'U-004', name: 'Diego Martinez', email: 'diego.martinez@accessgenie.ai', initials: 'DM', roleId: 'technician', title: 'Field Technician', homeScopeId: 'FAC-WH1' },
  { id: 'U-005', name: 'Amara Osei', email: 'amara.osei@accessgenie.ai', initials: 'AO', roleId: 'executive', title: 'Chief Operating Officer', homeScopeId: 'ORG-1' },
  { id: 'U-006', name: 'Tom Fisher', email: 'tom.fisher@accessgenie.ai', initials: 'TF', roleId: 'security_officer', title: 'Security Officer', homeScopeId: 'FAC-WH1' },
];

export const defaultUser = mockUsers[0];

export function buildSession(user: User): Session {
  const role = roles[user.roleId];
  return { user, role, modules: resolveModules(user.roleId) };
}

export function hasModule(session: Session, module: ModuleKey): boolean {
  return session.modules.includes(module);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scope tree (Org ▸ Facility ▸ Building ▸ Zone) — powers the scope switcher.
// ─────────────────────────────────────────────────────────────────────────────
export const scopeTree: ScopeNode = {
  id: 'ORG-1', name: 'Access Genie Global', level: 'org', assetCount: 14205,
  children: [
    {
      id: 'REG-NA', name: 'North America', level: 'region', assetCount: 8420,
      children: [
        {
          id: 'FAC-WH1', name: 'Central Warehouse', level: 'facility', assetCount: 3120,
          children: [
            {
              id: 'BLD-A', name: 'Building A', level: 'building', assetCount: 2100,
              children: [
                { id: 'ZN-DOCK', name: 'Loading Dock', level: 'zone', assetCount: 340 },
                { id: 'ZN-WH', name: 'Main Warehouse', level: 'zone', assetCount: 1180 },
                { id: 'ZN-COLD', name: 'Cold Storage', level: 'zone', assetCount: 210 },
                { id: 'ZN-PROD', name: 'Production Bay', level: 'zone', assetCount: 370 },
              ],
            },
          ],
        },
        {
          id: 'FAC-HOSP', name: 'General Hospital', level: 'facility', assetCount: 2450,
          children: [
            { id: 'BLD-N', name: 'North Wing', level: 'building', assetCount: 1310 },
            { id: 'BLD-S', name: 'South Wing', level: 'building', assetCount: 1140 },
          ],
        },
        { id: 'FAC-DC', name: 'Primary Data Center', level: 'facility', assetCount: 2850 },
      ],
    },
    { id: 'REG-EU', name: 'Europe', level: 'region', assetCount: 5785 },
  ],
};

/** Flatten the scope tree to a list with depth, for the switcher dropdown. */
export function flattenScope(node: ScopeNode = scopeTree, depth = 0): { node: ScopeNode; depth: number }[] {
  const out = [{ node, depth }];
  for (const child of node.children ?? []) out.push(...flattenScope(child, depth + 1));
  return out;
}

export function findScope(id: string, node: ScopeNode = scopeTree): ScopeNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const hit = findScope(id, child);
    if (hit) return hit;
  }
  return undefined;
}
