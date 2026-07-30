// ─────────────────────────────────────────────────────────────────────────────
// Saved views — the replacement for Groups & Fleets.
//
// A "group" of executive laptops was a hand-maintained list of asset IDs: buy
// three more and the list is silently wrong. A view is a *rule*, so it stays
// true as assets are registered and retired. That is the whole argument for
// deleting the Groups module rather than merging it (docs/22 §22.4.2).
//
// For a view to genuinely replace a group it has to be three things: named,
// durable beyond the page you created it on, and usable as a target for bulk
// actions. All three are handled here + in SavedViewsProvider.
// ────────────────
// ─────────────────────────────────────────────────────────────

import { deriveCommercial, evaluateGates, isLocated, requiredGates } from '@/lib/onboarding';
import type { RegisteredAsset } from '@/types/onboarding';

/** The exception queues, generated straight from the readiness gates. */
export type Lens =
  | 'all' | 'draft' | 'approval' | 'untracked' | 'warranty' | 'unowned' | 'attention';

export const LENS_FILTERS: Record<Lens, (a: RegisteredAsset) => boolean> = {
  all: () => true,
  draft: (a) => a.onboarding.state === 'Draft',
  approval: (a) => a.onboarding.state === 'Pending Approval',
  untracked: (a) =>
    a.onboarding.trackingIntent !== 'not-tracked' &&
    !a.onboarding.bindings.some((b) => !b.retiredAt && b.state === 'Verified'),
  warranty: (a) => {
    const d = deriveCommercial(a.onboarding.commercial);
    return d.warrantyStatus === 'Expiring' || d.warrantyStatus === 'Expired';
  },
  unowned: (a) => !a.custodian || !a.onboarding.department || !isLocated(a),
  // Active assets carrying an unmet gate — the queue that matters at scale.
  attention: (a) =>
    a.onboarding.state === 'Active' && requiredGates(evaluateGates(a)).some((g) => g.state !== 'met'),
};

export interface SavedView {
  id: string;
  name: string;
  search: string;
  status: string;
  category: string;
  lens: Lens;
  /** Ships with the product — cannot be renamed or deleted. */
  builtIn?: boolean;
}

export const BUILT_IN_VIEWS: SavedView[] = [
  { id: 'v-all', name: 'All Assets', status: 'All', category: 'All', search: '', lens: 'all', builtIn: true },
  { id: 'v-draft', name: '📝 Setup incomplete', status: 'All', category: 'All', search: '', lens: 'draft', builtIn: true },
  { id: 'v-approval', name: '⏳ Awaiting approval', status: 'All', category: 'All', search: '', lens: 'approval', builtIn: true },
  { id: 'v-untracked', name: '🏷 Untracked', status: 'All', category: 'All', search: '', lens: 'untracked', builtIn: true },
  { id: 'v-warranty', name: '📅 Warranty expiring', status: 'All', category: 'All', search: '', lens: 'warranty', builtIn: true },
  { id: 'v-unowned', name: '👤 Unassigned', status: 'All', category: 'All', search: '', lens: 'unowned', builtIn: true },
  { id: 'v-attention', name: '⚠ Needs attention', status: 'All', category: 'All', search: '', lens: 'attention', builtIn: true },
  { id: 'v-maint', name: 'In Maintenance', status: 'Maintenance', category: 'All', search: '', lens: 'all', builtIn: true },
  { id: 'v-missing', name: 'Missing', status: 'Missing', category: 'All', search: '', lens: 'all', builtIn: true },
];

/**
 * A view as a query string — this is what makes it shareable. Send the link and
 * the recipient sees the same set, resolved against live data rather than
 * against a frozen list of IDs.
 */
export function viewToQuery(v: Pick<SavedView, 'search' | 'status' | 'category' | 'lens'>): string {
  const p = new URLSearchParams();
  if (v.search) p.set('q', v.search);
  if (v.status !== 'All') p.set('status', v.status);
  if (v.category !== 'All') p.set('category', v.category);
  if (v.lens !== 'all') p.set('view', v.lens);
  return p.toString();
}

/** Human description of what a view selects — shown on the chip's tooltip. */
export function describeView(v: SavedView): string {
  const parts: string[] = [];
  if (v.lens !== 'all') parts.push(`queue: ${v.lens}`);
  if (v.status !== 'All') parts.push(`status: ${v.status.replace('_', ' ')}`);
  if (v.category !== 'All') parts.push(`category: ${v.category}`);
  if (v.search) parts.push(`matching “${v.search}”`);
  return parts.length ? parts.join(' · ') : 'Every asset in scope';
}
