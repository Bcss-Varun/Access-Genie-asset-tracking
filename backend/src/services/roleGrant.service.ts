import {
  ALL_ACTIONS,
  MODULE_KEYS,
  PERMISSION_ACTIONS,
  ROLES,
  defaultActionsFor,
  resolveModules,
  type ModuleKey,
  type PermissionAction,
  type PermissionMatrix,
  type RoleId,
} from '@access-genie/shared';
import { RoleGrant, User, type RoleGrantDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { revokeAllForUser } from './token.service.js';
import { logger } from '../config/logger.js';

/**
 * Effective module grants per role.
 *
 * The matrix in `shared` is the default; this layer records where a deployment
 * differs. "Our facility managers also need Analytics" is a real, ordinary
 * request, and the alternative — inventing new roles at runtime — would leave
 * every `requireModule(...)` in the API referring to a role set that no longer
 * describes the system.
 *
 * Read on every authenticated request, so it is cached in the process. The
 * cache is a plain map rather than anything clever because the whole collection
 * is at most nine rows, and it is invalidated on write rather than expiring:
 * a permission change must take effect on the next request, not in thirty
 * seconds.
 */

let cache: Map<RoleId, ModuleKey[]> | null = null;

/** Drop the cache. Called after any write, and by the tests. */
export function invalidateRoleGrants(): void {
  cache = null;
}

async function load(): Promise<Map<RoleId, ModuleKey[]>> {
  if (cache) return cache;

  const rows = await RoleGrant.find().lean<RoleGrantDoc[]>();
  const next = new Map<RoleId, ModuleKey[]>();

  for (const row of rows) {
    // A stored module that is no longer a real module is dropped rather than
    // trusted: the enum is code, and code moves on.
    const modules = row.modules.filter((m): m is ModuleKey => (MODULE_KEYS as readonly string[]).includes(m));
    next.set(row._id as RoleId, modules);
  }

  cache = next;
  return next;
}

/**
 * What this role may enter, taking overrides into account.
 *
 * `super_admin` is never overridden. It holds `'*'` in the matrix, and letting
 * it be narrowed is how a deployment locks every administrator out of the
 * screen that would let them undo it.
 */
export async function grantedModules(roleId: RoleId): Promise<ModuleKey[]> {
  if (roleId === 'super_admin') return resolveModules(roleId);

  const overrides = await load();
  return overrides.get(roleId) ?? resolveModules(roleId);
}

export interface RoleView {
  id: RoleId;
  name: string;
  tier: string;
  modules: ModuleKey[];
  /** Whether this role's grants differ from the shipped matrix. */
  customised: boolean;
  /** The shipped default, so the UI can offer "reset". */
  defaultModules: ModuleKey[];
  editable: boolean;
  userCount: number;
  /** What the role may do inside each module it holds. */
  permissions: PermissionMatrix;
}

/** The role catalogue with effective grants — what the permission matrix renders. */
export async function listRoles(): Promise<RoleView[]> {
  const [overrides, counts] = await Promise.all([
    load(),
    User.aggregate<{ _id: RoleId; count: number }>([{ $group: { _id: '$roleId', count: { $sum: 1 } } }]),
  ]);
  const byRole = new Map(counts.map((c) => [c._id, c.count]));

  const views = Object.values(ROLES).map((role) => {
    const defaults = resolveModules(role.id);
    const override = role.id === 'super_admin' ? undefined : overrides.get(role.id);

    return {
      id: role.id,
      name: role.name,
      tier: role.tier,
      modules: override ?? defaults,
      customised: override !== undefined,
      defaultModules: defaults,
      editable: role.id !== 'super_admin',
      userCount: byRole.get(role.id) ?? 0,
      permissions: {} as PermissionMatrix,
    };
  });

  // The action matrix per role, resolved exactly the way the gate resolves it,
  // so the screen shows what the API will actually enforce rather than a second
  // opinion about it.
  for (const view of views) {
    view.permissions = await permissionMatrix(view.id);
  }

  return views;
}

/**
 * Change what a role may reach.
 *
 * Everyone holding the role is signed out, for the same reason changing a
 * user's role signs *them* out: a permission removed at 4pm must not survive in
 * an open session until its token expires.
 */
export async function setRoleGrants(roleId: RoleId, modules: ModuleKey[]): Promise<RoleView> {
  if (!ROLES[roleId]) throw ApiError.notFound('Role');
  if (roleId === 'super_admin') {
    throw ApiError.badRequest('Super Admin holds every module by definition and cannot be narrowed');
  }

  // A role with no modules cannot reach any screen, including the one that
  // would restore it. Refused rather than saved as an unusable state.
  if (modules.length === 0) {
    throw ApiError.badRequest('A role must grant at least one module — otherwise nobody holding it can sign in usefully');
  }

  await RoleGrant.findByIdAndUpdate(
    roleId,
    { $set: { modules, updatedAt: new Date() } },
    { upsert: true, new: true, runValidators: true },
  );
  invalidateRoleGrants();

  await signOutRole(roleId);
  logger.info('Role grants changed', { roleId, modules });

  return roleView(roleId);
}

/** Drop the override, returning the role to the shipped matrix. */
export async function resetRoleGrants(roleId: RoleId): Promise<RoleView> {
  if (!ROLES[roleId]) throw ApiError.notFound('Role');

  await RoleGrant.findByIdAndDelete(roleId);
  invalidateRoleGrants();

  await signOutRole(roleId);
  return roleView(roleId);
}

async function signOutRole(roleId: RoleId): Promise<void> {
  const holders = await User.find({ roleId }).select('_id').lean();
  await Promise.all(holders.map((u) => revokeAllForUser(u._id)));
}

async function roleView(roleId: RoleId): Promise<RoleView> {
  const all = await listRoles();
  const found = all.find((r) => r.id === roleId);
  if (!found) throw ApiError.notFound('Role');
  return found;
}

// ── Action permissions ───────────────────────────────────────────────────────

/**
 * What a role may *do* inside a module, as opposed to whether it may enter.
 *
 * The module grant above answers "is Assets reachable"; this answers "may a
 * technician delete one". Both are needed: gating only on the module means every
 * role that can see a screen can do everything on it, which is the state this
 * platform was in before.
 *
 * Resolution order, and the reason for each step:
 *
 *   1. No module grant at all → no actions. A module you cannot enter has no
 *      actions to hold.
 *   2. A stored override for that module → exactly that list, including an empty
 *      one, which legitimately means "reachable, nothing permitted".
 *   3. Otherwise → the role's defaults from `shared/governance.ts`. This is what
 *      keeps rows written before this feature behaving as they always did.
 *
 * `super_admin` is never narrowed, for the same reason its module grant is not:
 * a deployment that narrows it locks every administrator out of the screen that
 * would let them undo it.
 */
export async function grantedActions(roleId: RoleId, module: ModuleKey): Promise<PermissionAction[]> {
  if (roleId === 'super_admin') return [...ALL_ACTIONS];

  const modules = await grantedModules(roleId);
  if (!modules.includes(module)) return [];

  const rows = await RoleGrant.findById(roleId).lean<RoleGrantDoc>();
  const stored = rows?.actions?.[module];
  if (Array.isArray(stored)) {
    return stored.filter((a): a is PermissionAction => (PERMISSION_ACTIONS as readonly string[]).includes(a));
  }

  return defaultActionsFor(roleId);
}

/** The whole matrix for a role — what the Roles screen renders and edits. */
export async function permissionMatrix(roleId: RoleId): Promise<PermissionMatrix> {
  const modules = await grantedModules(roleId);
  const out: PermissionMatrix = {};
  for (const module of modules) out[module] = await grantedActions(roleId, module);
  return out;
}

/** Replace the action lists for a role. Modules it does not hold are ignored. */
export async function setPermissions(roleId: RoleId, matrix: PermissionMatrix): Promise<PermissionMatrix> {
  if (roleId === 'super_admin') {
    throw ApiError.badRequest('Super Admin permissions cannot be narrowed.');
  }

  const modules = await grantedModules(roleId);
  const actions: Record<string, string[]> = {};
  for (const [module, list] of Object.entries(matrix)) {
    if (!modules.includes(module as ModuleKey)) continue;
    actions[module] = (list ?? []).filter((a) => (PERMISSION_ACTIONS as readonly string[]).includes(a));
  }

  await RoleGrant.findByIdAndUpdate(
    roleId,
    { $set: { actions, updatedAt: new Date() }, $setOnInsert: { modules: [...modules] } },
    { upsert: true },
  );

  // A permission change must take effect on the next request, not when a cache
  // happens to expire. Nothing else is needed: `requireAuth` resolves the
  // caller's grants from this service on every request, so live sessions pick
  // the change up without being signed out.
  invalidateRoleGrants();

  return permissionMatrix(roleId);
}
