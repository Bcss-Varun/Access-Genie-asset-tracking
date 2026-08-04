import { UserPreference, type SavedViewDoc, type UserPreferenceDoc } from '../models/index.js';

/**
 * Per-user interface state.
 *
 * This is the code that replaced `localStorage`. It is deliberately tiny — a
 * read, a merge-patch, and saved-view CRUD — because the point is not the
 * feature but where the state lives: one document per user in the same cluster
 * as everything else, so a preference set on a laptop is already in place on a
 * phone, and a browser that clears its storage loses nothing.
 */

export interface PreferencesPayload {
  theme: 'light' | 'dark' | 'system';
  activeFacility: string | null;
  activeScope: string | null;
  savedViews: SavedViewDoc[];
  dismissed: string[];
  notifications: Record<string, { email: boolean; push: boolean; inApp: boolean }>;
  digest: string;
}

/** The shape sent back to the client, with the model's optionals normalized. */
function toPayload(
  doc: Pick<
    UserPreferenceDoc,
    'theme' | 'activeFacility' | 'activeScope' | 'savedViews' | 'dismissed' | 'notifications' | 'digest'
  >,
): PreferencesPayload {
  return {
    theme: doc.theme,
    activeFacility: doc.activeFacility ?? null,
    activeScope: doc.activeScope ?? null,
    savedViews: doc.savedViews ?? [],
    dismissed: doc.dismissed ?? [],
    // An empty map is meaningful: it means "never chosen", and the screen falls
    // back to its own per-category defaults rather than switching everything off.
    notifications: doc.notifications ?? {},
    digest: doc.digest ?? 'Daily digest',
  };
}

/**
 * Defaults for a user who has never changed anything — no document required.
 *
 * `theme` must agree with the schema default in models/UserPreference.ts: this
 * is what a user with no document sees, that is what they get the moment they
 * save any other preference, and a disagreement would silently flip the theme
 * on an unrelated write.
 */
const DEFAULTS: PreferencesPayload = {
  theme: 'light',
  activeFacility: null,
  activeScope: null,
  savedViews: [],
  dismissed: [],
  notifications: {},
  digest: 'Daily digest',
};

export async function getPreferences(userId: string): Promise<PreferencesPayload> {
  const doc = await UserPreference.findById(userId).lean();
  return doc ? toPayload(doc) : { ...DEFAULTS };
}

export interface PreferencesPatch {
  theme?: 'light' | 'dark' | 'system';
  activeFacility?: string | null;
  activeScope?: string | null;
  dismissed?: string[];
  notifications?: Record<string, { email: boolean; push: boolean; inApp: boolean }>;
  digest?: string;
}

/**
 * Merge-patch: only the keys present are touched.
 *
 * The upsert is what lets the client write a preference before anything has
 * read one — no "create your profile first" step, and no race between the two
 * on a first sign-in from two tabs.
 */
export async function updatePreferences(userId: string, patch: PreferencesPatch): Promise<PreferencesPayload> {
  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};

  for (const key of ['theme', 'activeFacility', 'activeScope', 'dismissed', 'notifications', 'digest'] as const) {
    if (!(key in patch)) continue;
    const value = patch[key];
    // `null` means "clear it" — distinct from omitting the key, which means
    // "leave whatever is there".
    if (value === null) unset[key] = '';
    else set[key] = value;
  }

  const doc = await UserPreference.findByIdAndUpdate(
    userId,
    { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { upsert: true, new: true, setDefaultsOnInsert: true, lean: true },
  );

  return doc ? toPayload(doc) : { ...DEFAULTS };
}

/** Slug plus a counter: unique per user, and still readable in a URL. */
function nextViewId(name: string, taken: SavedViewDoc[]): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'view';
  let candidate = `v-${slug}`;
  let n = 2;
  while (taken.some((v) => v.id === candidate)) candidate = `v-${slug}-${n++}`;
  return candidate;
}

export type SavedViewInput = Omit<SavedViewDoc, 'id'>;

/**
 * Save a view, replacing any the user already has under that name.
 *
 * Overwriting rather than duplicating matches what the button says — "save
 * current view" — and stops the chip strip filling with near-identical entries
 * as someone iterates on a filter.
 */
export async function saveView(userId: string, input: SavedViewInput): Promise<PreferencesPayload> {
  const existing = (await UserPreference.findById(userId).lean())?.savedViews ?? [];
  const kept = existing.filter((v) => v.name !== input.name);
  const view: SavedViewDoc = { ...input, id: nextViewId(input.name, kept) };

  const doc = await UserPreference.findByIdAndUpdate(
    userId,
    { $set: { savedViews: [...kept, view] } },
    { upsert: true, new: true, setDefaultsOnInsert: true, lean: true },
  );

  return doc ? toPayload(doc) : { ...DEFAULTS, savedViews: [view] };
}

export async function renameView(userId: string, viewId: string, name: string): Promise<PreferencesPayload> {
  const doc = await UserPreference.findOneAndUpdate(
    { _id: userId, 'savedViews.id': viewId },
    { $set: { 'savedViews.$.name': name } },
    { new: true, lean: true },
  );
  return doc ? toPayload(doc) : getPreferences(userId);
}

export async function removeView(userId: string, viewId: string): Promise<PreferencesPayload> {
  const doc = await UserPreference.findByIdAndUpdate(
    userId,
    { $pull: { savedViews: { id: viewId } } },
    { new: true, lean: true },
  );
  return doc ? toPayload(doc) : { ...DEFAULTS };
}
