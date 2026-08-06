// ─────────────────────────────────────────────────────────────────────────────
// Administration ▸ Asset Classes & Templates
//
// Was "Digital Asset Passports" under Asset Management, which promised a
// per-asset record and delivered a read-only schema list. It is neither of
// those things: it is the configuration that decides how every asset of a class
// behaves — so it belongs in Administration, and it has to be editable.
//
// The card copy answers "what does this class actually decide?" in plain words,
// because "4 attributes · 2 required" told nobody anything useful.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { ASSET_CATEGORIES, type AssetCategory } from '@access-genie/shared';
import { useClassLibrary } from '@/components/providers/ClassLibraryProvider';
import { useRegistry } from '@/components/providers/RegistryProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { getMonitoringProfile } from '@/lib/asset-classes';
import { cn } from '@/lib/utils';

/**
 * What a class can be marked with.
 *
 * Scoped to IT: the hospital, film camera, chair, truck and freezer glyphs that
 * used to be here came from a general facilities list, and none of them names
 * anything this estate holds — a picker offering a chair before a monitor makes
 * the common case the hard one. Roughly in the order someone would look for
 * them: the generic one first (it is the default, and a default that sits at the
 * end of the row looks like a stray selection), then machines, network, what
 * people carry, what plugs in, and finally the room.
 */
const ICONS = [
  '📦',
  '💻', '🖥️', '🗄️', '💾', '🌐', '📡', '🛰️',
  '📱', '⌨️', '🖱️', '🖨️', '📟', '📷', '📺', '🎧',
  '🔌', '🔋', '⚡', '🛡️', '💿', '🧰', '🔬',
];

export default function AssetClassesPage() {
  const { classes, createClass } = useClassLibrary();
  const { assets } = useRegistry();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📦');
  const [category, setCategory] = useState<AssetCategory>('Compute');

  const countFor = (id: string) => assets.filter((a) => a.onboarding.classId === id && !a.onboarding.voidedAt).length;

  const [saving, setSaving] = useState(false);

  // Waits for the server's ID before navigating — the provisional one the client
  // mints is not what gets stored, and routing to it lands on "Class not found".
  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const created = await createClass(name, icon, category);
    setSaving(false);
    if (!created) return; // `createClass` has already explained why.

    toast({ title: `${created.name} created`, description: `${created.id} — now set up what it captures`, tone: 'success' });
    setCreating(false);
    setName('');
    setIcon('📦');
    setCategory('Compute');
    navigate(`/admin/classes/${created.id}`);
  };

  return (
    <div className="flex h-full flex-col space-y-6">
      <PageHeader
        title="Asset Classes & Templates"
        subtitle="What each kind of asset captures, and what it must satisfy before it goes into service."
        breadcrumb={[{ label: 'Administration' }, { label: 'Asset Classes' }]}
        actions={<Button onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : '+ New Class'}</Button>}
      />

      <div className="rounded-xl border border-primary-100 bg-primary-50/50 px-5 py-3 text-sm text-slate-600">
        <span className="font-semibold text-slate-800">Change these once, and every asset of that class follows.</span>{' '}
        A class decides which fields get captured, what has to be true before an asset can go live, how it is tracked,
        monitored, depreciated and maintained. This is why registering an asset takes six fields instead of forty.
      </div>

      {/* Create — a real form, not a toast that says "disabled in the demo" */}
      {creating && (
        <div className="glass-panel rounded-xl p-6">
          <h2 className="font-heading text-base font-bold text-slate-900">New asset class</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Name it after the thing, not the department — &ldquo;Infusion Pump&rdquo;, &ldquo;Body Camera&rdquo;,
            &ldquo;Forklift&rdquo;. You can set everything else on the next screen.
          </p>

          <div className="mt-5 flex flex-wrap items-end gap-4">
            <div className="min-w-0 flex-1">
              <label htmlFor="cls-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Class name
              </label>
              <input
                id="cls-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
                placeholder="e.g. Infusion Pump"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              />
            </div>
            {/*
              Not cosmetic: every asset registered in this class is filed under
              the category chosen here, and that is what the registry filters
              and every dashboard group by. It is asked at creation because it
              cannot be guessed from a free-text class name.
            */}
            <div className="w-52">
              <label htmlFor="cls-category" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Reports as
              </label>
              <select
                id="cls-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as AssetCategory)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              >
                {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Button onClick={() => void submit()} disabled={!name.trim() || saving}>{saving ? 'Creating…' : 'Create class'}</Button>
          </div>

          <div className="mt-4">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Icon</span>
            <div className="flex flex-wrap gap-1.5">
              {ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  aria-pressed={icon === i}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg border text-xl transition-colors',
                    icon === i ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500/25' : 'border-slate-200 hover:bg-slate-50',
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* The library */}
      {classes.length === 0 ? (
        <EmptyState
          icon="🧬"
          title="No asset classes yet"
          description="A class is the template every asset of that kind inherits from."
          action={<Button onClick={() => setCreating(true)}>+ New Class</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {classes.map((cls) => {
            const inUse = countFor(cls.id);
            const profile = getMonitoringProfile(cls.monitoringProfileId);
            return (
              <Link
                key={cls.id}
                to={`/admin/classes/${cls.id}`}
                className="glass-panel group flex flex-col rounded-xl p-5 transition-colors hover:border-primary-300 hover:bg-primary-50/30"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl">
                    {cls.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading text-base font-bold text-slate-900 group-hover:text-primary-700">
                        {cls.name}
                      </h3>
                      {cls.custom && <Badge tone="emerald">New</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      {cls.description || <span className="italic text-slate-400">No description yet</span>}
                    </p>
                  </div>
                </div>

                {/* Plain-language summary of what this class decides */}
                <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-400">Captures</dt>
                    <dd className="text-right font-medium text-slate-700">
                      {cls.attributes.length === 0 ? 'Nothing extra yet' : `${cls.attributes.length} extra field${cls.attributes.length === 1 ? '' : 's'}`}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-400">Before go-live</dt>
                    <dd className="text-right font-medium text-slate-700">
                      {cls.activationGates.length} check{cls.activationGates.length === 1 ? '' : 's'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-400">Tracking</dt>
                    <dd className="text-right font-medium text-slate-700">
                      {cls.trackingExpected ? cls.preferredTags.join(' or ') : 'Not expected'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-400">Monitoring</dt>
                    <dd className="text-right font-medium text-slate-700">{profile ? profile.name : 'None'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-400">Maintenance</dt>
                    <dd className="text-right font-medium text-slate-700">{cls.pmPlan ? 'Scheduled PM' : 'Run to failure'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-400">Depreciation</dt>
                    <dd className="text-right font-medium text-slate-700">{cls.depreciationMethod}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-400">
                    {inUse === 0 ? 'Not used yet' : `${inUse} asset${inUse === 1 ? '' : 's'} in this class`}
                  </span>
                  <span className="text-xs font-medium text-primary-600">Edit →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
