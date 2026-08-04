import { MODULE_KEYS, ROLES, resolveModules, type ModuleKey, type RoleId } from '@access-genie/shared';
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
}

/** The role catalogue with effective grants — what the permission matrix renders. */
export async function listRoles(): Promise<RoleView[]> {
  const [overrides, counts] = await Promise.all([
    load(),
    User.aggregate<{ _id: RoleId; count: number }>([{ $group: { _id: '$roleId', count: { $sum: 1 } } }]),
  ]);
  const byRole = new Map(counts.map((c) => [c._id, c.count]));

  return Object.values(ROLES).map((role) => {
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
    };
  });
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
