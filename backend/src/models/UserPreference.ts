import { model, Schema } from 'mongoose';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * Everything the interface used to keep in the browser.
 *
 * The theme lived in `localStorage`, the active facility in `sessionStorage`,
 * and saved views in React state that died on navigation. Each was a small
 * thing on its own; together they were the last place application state lived
 * outside the database, and they behaved accordingly — a saved view vanished
 * when you moved to another page, and signing in on a second machine gave you
 * a different-looking product.
 *
 * One document per user. It is small, read once at sign-in, and written on
 * change, so it costs a single extra document in the session payload and
 * removes browser storage from the architecture entirely.
 */

/** A named filter over the asset registry. Built-ins ship in code; these are the user's own. */
export interface SavedViewDoc {
  id: string;
  name: string;
  search: string;
  status: string;
  category: string;
  lens: string;
}

export interface UserPreferenceDoc {
  /** The owning user's id — one preferences document per person, by construction. */
  _id: string;
  theme: 'light' | 'dark' | 'system';
  /** Slug of the facility the tracking screens open on. */
  activeFacility?: string;
  /** Id of the scope node selected in the top bar. */
  activeScope?: string;
  savedViews: SavedViewDoc[];
  /** Screens the user has dismissed the "getting started" panel on. */
  dismissed: string[];
  createdAt: Date;
  updatedAt: Date;
}

const savedViewSchema = new Schema<SavedViewDoc>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    search: { type: String, default: '' },
    status: { type: String, default: 'All' },
    category: { type: String, default: 'All' },
    lens: { type: String, default: 'all' },
  },
  { _id: false },
);

const userPreferenceSchema = new Schema<UserPreferenceDoc>(
  {
    _id: { type: String, required: true, ref: 'User' },
    // Light is the shipped default — the palette is designed light and dark is
    // an override layered over it. `system` remains a real choice, not the
    // absence of one: it means "keep following the OS", which is different from
    // having picked light, so it stays selectable but is no longer the default.
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'light' },
    activeFacility: { type: String },
    activeScope: { type: String },
    savedViews: { type: [savedViewSchema], default: [] },
    dismissed: { type: [String], default: [] },
  },
  { timestamps: true, _id: false },
);

userPreferenceSchema.plugin(baseSchemaPlugin);

export const UserPreference = model<UserPreferenceDoc>('UserPreference', userPreferenceSchema);
