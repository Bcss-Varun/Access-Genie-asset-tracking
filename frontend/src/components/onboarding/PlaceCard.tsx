// ─────────────────────────────────────────────────────────────────────────────
// Configure · Place — where it lives and who answers for it.
//
// Eight cascading dropdowns collapse to two controls: org/region/facility come
// from the session scope, building/floor/zone are one path typeahead, and
// department is derived from the owner rather than asked (docs/21 §21.1.2 ③).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { useRegistry } from '@/components/providers/RegistryProvider';
import { useScope } from '@/components/providers/ScopeProvider';
import { Button } from '@/components/ui/Button';
import { ConfigCard, Field, Note, inputCls } from './fields';
import { locationOptions, UNASSIGNED_LOCATION, isLocated, locationPath } from '@/lib/onboarding';
import { allAssets } from '@/lib/dataset';
import { allUsers } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import type { GateResult, RegisteredAsset } from '@access-genie/shared';

/** Department implied by the owner. Asked once, derived thereafter. */
const DEPARTMENTS = ['IT Operations', 'Network Engineering', 'Infrastructure', 'Facilities', 'Security', 'Design', 'Field Operations'];

function departmentFor(owner: string): string {
  if (/network/i.test(owner)) return 'Network Engineering';
  if (/storage|infra/i.test(owner)) return 'Infrastructure';
  if (/design/i.test(owner)) return 'Design';
  if (/security|tarun/i.test(owner)) return 'Security';
  if (/deepak|field/i.test(owner)) return 'Field Operations';
  if (/sneha|facilit/i.test(owner)) return 'Facilities';
  return 'IT Operations';
}

export function PlaceCard({
  asset, gates, step,
}: {
  asset: RegisteredAsset;
  gates: GateResult[];
  step: number;
}) {
  const { patchAsset, patchOnboarding } = useRegistry();
  const { scope } = useScope();

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const located = gates.find((g) => g.key === 'located')!;
  const accountable = gates.find((g) => g.key === 'accountable')!;
  const required = located.required || accountable.required;
  const status = located.state === 'met' && accountable.state === 'met' ? 'met' : 'open';

  // Owners: the demo people plus the standing team custodians already in use.
  const owners = useMemo(() => {
    const teams = Array.from(new Set(allAssets.map((a) => a.custodian))).filter((c) => /team|ops/i.test(c));
    return [...teams, ...allUsers.map((u) => u.name)];
  }, []);

  const options = useMemo(() => locationOptions(), []);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 8);
    return options.filter((o) => o.path.toLowerCase().includes(q)).slice(0, 8);
  }, [options, query]);

  const setLocation = (id: string) => {
    const opt = options.find((o) => o.id === id);
    if (!opt) return;
    patchAsset(asset.id, {
      location: { id: opt.id, name: opt.facility, building: opt.building, zone: opt.zone },
    });
    patchOnboarding(asset.id, { locationConfirmed: true });
    setQuery('');
    setOpen(false);
  };

  const setOwner = (owner: string) => {
    patchAsset(asset.id, { custodian: owner });
    patchOnboarding(asset.id, { department: departmentFor(owner) });
  };

  const clearLocation = () =>
    patchAsset(asset.id, { location: { id: 'LOC-UNASSIGNED', name: UNASSIGNED_LOCATION } });

  return (
    <ConfigCard
      step={step}
      title="Place"
      description="Where it lives and who answers for it."
      status={status}
      required={required}
    >
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        {/* Location — one typeahead over the full path */}
        <Field
          label="Location"
          htmlFor="pl-loc"
          hint={`Scope: ${scope.name}. Type any part of the path — facility, building or zone.`}
          className="sm:col-span-2"
        >
          {isLocated(asset) ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <span className="text-sm font-semibold text-emerald-800">📍 {locationPath(asset)}</span>
              <button type="button" onClick={clearLocation} className="text-xs font-medium text-emerald-700 hover:underline">
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                id="pl-loc"
                className={inputCls}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                placeholder="e.g. Loading Dock, Building A, Chennai…"
                autoComplete="off"
              />
              {open && matches.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                  {matches.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => setLocation(o.id)}
                        className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-primary-50 hover:text-primary-700"
                      >
                        {o.path}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Field>

        <Field label="Owner / custodian" htmlFor="pl-owner" hint="A person or a standing team.">
          <select id="pl-owner" className={inputCls} value={asset.custodian} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Unassigned</option>
            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>

        <Field
          label="Department"
          htmlFor="pl-dept"
          hint={asset.onboarding.department ? 'Derived from the owner — override if it belongs elsewhere.' : 'Resolves automatically once an owner is set.'}
        >
          <select
            id="pl-dept"
            className={cn(inputCls, !asset.onboarding.department && 'text-slate-400')}
            value={asset.onboarding.department ?? ''}
            onChange={(e) => patchOnboarding(asset.id, { department: e.target.value || undefined })}
          >
            <option value="">Not resolved</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
      </div>

      {!isLocated(asset) && (
        <div className="mt-4">
          <Note icon="📦">
            Skipping is fine. The asset sits at <span className="font-semibold">{UNASSIGNED_LOCATION}</span> — a real
            node, not an error — and a task lands in the Asset Administrator&apos;s queue. Refusing to store the truth
            is what pushes people into typing fake values.
          </Note>
        </div>
      )}

      {!isLocated(asset) && (
        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const hit = options.find((o) => o.facility === scope.name) ?? options[0];
              if (hit) setLocation(hit.id);
            }}
          >
            Use current scope ({scope.name})
          </Button>
        </div>
      )}
    </ConfigCard>
  );
}
