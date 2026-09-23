import type { FilterQuery } from 'mongoose';
import { ROLES, type ApiMeta, type PublicUser } from '@access-genie/shared';
import { User, ScopeNodeModel, nextId, type UserDoc } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { csvFilter, escapeRegex, parsePagination } from '../utils/query.js';
import { buildMeta } from '../utils/response.js';
import { revokeAllForUser } from './token.service.js';
import type { CreateUserInput, SetUserPasswordInput, UpdateUserInput } from '../validators/user.validator.js';
import type { ListQueryInput } from '../validators/common.js';
import type { UpdateProfileInput } from '../validators/auth.validator.js';

const SORTABLE = ['name', 'email', 'roleId', 'createdAt', 'lastLoginAt'];

type UserListQuery = ListQueryInput & { roleId?: string; status?: string };

/** Derive `AS` from "Ananya Sharma", `R` from "Raj". */
function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase();
}

export async function listUsers(query: UserListQuery, scopeIds?: Set<string>, platform = false): Promise<{ items: PublicUser[]; meta: ApiMeta }> {
  const filter: FilterQuery<UserDoc> = scopeIds && !platform ? { homeScopeId: { $in: [...scopeIds] }, $and: [{ roleId: { $ne: 'super_admin' } }] } : {};

  const roleId = csvFilter(query.roleId);
  if (roleId) filter.roleId = roleId;

  const status = csvFilter(query.status);
  if (status) filter.status = status;

  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { title: rx }];
  }

  const pagination = parsePagination(query, SORTABLE, 'name');

  const [docs, total] = await Promise.all([
    User.find(filter).sort(pagination.sort).skip(pagination.skip).limit(pagination.limit),
    User.countDocuments(filter),
  ]);

  return {
    items: docs.map((d) => d.toPublic()),
    meta: buildMeta(pagination.page, pagination.limit, total),
  };
}

export async function getUser(id: string): Promise<PublicUser> {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User');
  return user.toPublic();
}

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  if (!await ScopeNodeModel.exists({ _id: input.homeScopeId })) throw ApiError.badRequest('Home scope does not exist');
  const existing = await User.findOne({ email: input.email }).lean();
  if (existing) throw ApiError.conflict('A user with this email already exists');

  const id = await nextId('user', 'U');

  const user = await User.create({
    _id: id,
    name: input.name,
    email: input.email,
    passwordHash: input.password, // hashed by the pre-save hook
    initials: input.initials ?? deriveInitials(input.name),
    roleId: input.roleId,
    extraModules: input.extraModules,
    title: input.title,
    homeScopeId: input.homeScopeId,
    status: 'active',
  });

  return user.toPublic();
}

export async function updateUser(id: string, input: UpdateUserInput, actorId: string): Promise<PublicUser> {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User');

  // Guard rails against locking yourself out of the platform.
  if (id === actorId && input.status === 'suspended') {
    throw ApiError.badRequest('You cannot suspend your own account');
  }
  if (id === actorId && input.roleId && input.roleId !== user.roleId) {
    throw ApiError.badRequest('You cannot change your own role');
  }

  if (input.homeScopeId && !await ScopeNodeModel.exists({ _id: input.homeScopeId })) throw ApiError.badRequest('Home scope does not exist');
  const roleChanged = input.roleId !== undefined && input.roleId !== user.roleId;
  const suspended = input.status === 'suspended' && user.status !== 'suspended';

  if (user.roleId === 'super_admin' && user.status === 'active' && (suspended || roleChanged) && await User.countDocuments({ roleId: 'super_admin', status: 'active' }) <= 1) throw ApiError.conflict('Cannot disable the last active super admin');
  Object.assign(user, input);
  if (input.name) user.initials = deriveInitials(input.name);
  await user.save();

  // A role change or a suspension must take effect now, not whenever the
  // user's existing sessions happen to expire.
  if (roleChanged || suspended || input.homeScopeId !== undefined || input.extraModules !== undefined) await revokeAllForUser(id);

  return user.toPublic();
}

/**
 * Set someone's password on their behalf — the "they forgot it" path.
 *
 * Distinct from `auth.service.changePassword`, which requires the caller to
 * prove they know the current password: that check is exactly what a locked-out
 * user cannot pass, which is the whole reason this exists. Ends every session
 * the account has open, the same as a role change or a suspension — a password
 * an administrator just set is not one an old, still-live session should have
 * skipped past.
 */
export async function setUserPassword(id: string, input: SetUserPasswordInput): Promise<PublicUser> {
  const user = await User.findById(id).select('+passwordHash');
  if (!user) throw ApiError.notFound('User');

  user.passwordHash = input.password; // hashed by the pre-save hook
  await user.save();
  await revokeAllForUser(id);

  return user.toPublic();
}

export async function deleteUser(id: string, actorId: string): Promise<void> {
  if (id === actorId) throw ApiError.badRequest('You cannot delete your own account');

  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User');

  // The last super admin leaving would make the platform unadministrable.
  if (user.roleId === 'super_admin') {
    const remaining = await User.countDocuments({ roleId: 'super_admin', status: 'active' });
    if (remaining <= 1) throw ApiError.conflict('Cannot remove the last active super admin');
  }

  await user.deleteOne();
  await revokeAllForUser(id);
}

/** The role catalogue, for the admin UI's role picker. */
export function listRoles() {
  return Object.values(ROLES).map((role) => ({
    ...role,
    modules: role.modules === '*' ? 'all' : role.modules,
  }));
}

/**
 * Update your own profile.
 *
 * Separate from `updateUser` on purpose. That function is an administrator
 * acting on someone else and carries the guards that go with it — role changes,
 * suspensions, session revocation. This one is a person editing their own
 * details, so it takes the id from the session and cannot touch anything that
 * grants access.
 */
export async function updateOwnProfile(id: string, input: UpdateProfileInput): Promise<PublicUser> {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User');

  Object.assign(user, input);
  if (input.name) user.initials = deriveInitials(input.name);
  await user.save();

  return user.toPublic();
}

