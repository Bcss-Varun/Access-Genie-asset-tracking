// ─────────────────────────────────────────────────────────────────────────────
// AddScopeForm — add a node to the location hierarchy.
//
// One component rather than a form per screen, because "add a facility to the
// org" and "add a zone to a building" are the same operation at different
// depths. The level choices come from the same table the API enforces with, so
// the form never offers something the server will refuse.
//
// It exists because a fresh installation has an org root and nothing else, and
// an asset cannot be given a location until a facility exists — the registration
// flow's place picker flattens this tree, so with nothing in it there is
// literally nowhere to put anything.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import type { ScopeLevel, ScopeNode } from '@access-genie/shared';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { useMutate } from '@/api/mutate';
import { scopeApi, ALLOWED_CHILDREN, LEVEL_ICON, LEVEL_LABEL } from '@/api/scope';

export function AddScopeForm({
  parent,
  /** Restrict the offer to one level — the Facilities page only adds facilities. */
  only,
  placeholder,
  onAdded,
  onCancel,
}: {
  parent: ScopeNode;
  only?: ScopeLevel;
  placeholder?: string;
  onAdded?: (created: ScopeNode) => void;
  onCancel?: () => void;
}) {
  const { run, isPending } = useMutate();
  const { toast } = useToast();

  const levels = only ? [only] : ALLOWED_CHILDREN[parent.level];
  const [level, setLevel] = useState<ScopeLevel>(levels[0] ?? 'zone');
  const [name, setName] = useState('');

  if (levels.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        A {LEVEL_LABEL[parent.level].toLowerCase()} is the smallest scope — nothing goes inside it.
      </p>
    );
  }

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast({ title: 'Name it first', description: 'Give the scope a name of at least 2 characters.', tone: 'error' });
      return;
    }

    // `run` re-reads the dataset on success, which re-hydrates the scope tree —
    // that is what makes the new location immediately pickable when registering.
    const created = await run(scopeApi.create({ name: trimmed, level, parentId: parent.id }), {
      success: `${trimmed} added`,
      successDetail: `${LEVEL_LABEL[level]} under ${parent.name} — you can now put assets here.`,
      describe: `add that ${LEVEL_LABEL[level].toLowerCase()}`,
    });

    if (!created) return;
    setName('');
    onAdded?.(created);
  };

  const input =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30';
  const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500';

  return (
    <div className="flex flex-wrap items-end gap-3">
      {levels.length > 1 && (
        <div className="w-40">
          <label htmlFor="scope-level" className={label}>Type</label>
          <select
            id="scope-level"
            className={input}
            value={level}
            onChange={(e) => setLevel(e.target.value as ScopeLevel)}
          >
            {levels.map((l) => (
              <option key={l} value={l}>{LEVEL_ICON[l]} {LEVEL_LABEL[l]}</option>
            ))}
          </select>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <label htmlFor="scope-name" className={label}>
          {LEVEL_LABEL[level]} name
        </label>
        <input
          id="scope-name"
          autoFocus
          className={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          placeholder={placeholder ?? (level === 'facility' ? 'e.g. Hyderabad Central Warehouse' : 'e.g. Building A')}
        />
      </div>

      <Button onClick={() => void submit()} disabled={isPending || name.trim().length < 2}>
        {isPending ? 'Adding…' : `Add ${LEVEL_LABEL[level].toLowerCase()}`}
      </Button>
      {onCancel && (
        <Button variant="ghost" onClick={onCancel} disabled={isPending}>Cancel</Button>
      )}
    </div>
  );
}
