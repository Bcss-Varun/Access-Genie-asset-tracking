import { useMemo, useState } from 'react';
import { allAssets } from '@/lib/dataset';
import { Field, TextInput } from '@/components/ui/FormDialog';

/**
 * Pick an asset a record hangs off.
 *
 * A dozen forms need this and a plain `<select>` stops working somewhere around
 * two hundred assets — which is a small estate. So it is a search box over the
 * hydrated registry with the matches listed underneath, and it commits the id
 * rather than the name: the server resolves the name itself, so a renamed asset
 * does not leave stale text scattered across the compliance records.
 */
export function AssetPicker({
  value,
  onChange,
  label = 'Asset',
  required,
  hint,
}: {
  value: string;
  onChange: (assetId: string) => void;
  label?: string;
  required?: boolean;
  hint?: string;
}) {
  const selected = allAssets.find((a) => a.id === value);
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? allAssets.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.id.toLowerCase().includes(q) ||
            a.serialNumber.toLowerCase().includes(q) ||
            a.category.toLowerCase().includes(q),
        )
      : allAssets;
    // Capped because this renders inside a dialog; the search is how you reach
    // the rest, and an unbounded list would make the dialog unusable.
    return pool.slice(0, 40);
  }, [query]);

  if (allAssets.length === 0) {
    return (
      <Field label={label} required={required}>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          There are no assets registered yet. Register one first — this record has to hang off something.
        </p>
      </Field>
    );
  }

  return (
    <Field label={label} required={required} hint={hint}>
      {selected ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50/60 px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-800">{selected.name}</span>
            <span className="block truncate text-xs text-slate-500">
              {selected.id} · {selected.category} · {selected.location?.name ?? 'Unassigned'}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange('');
              setQuery('');
            }}
            className="shrink-0 rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-700"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${allAssets.length} assets by name, ID or serial…`}
          />
          <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200">
            {matches.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-400">Nothing matches “{query}”.</p>
            ) : (
              matches.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onChange(a.id)}
                  className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
                >
                  <span className="block truncate text-sm font-medium text-slate-800">{a.name}</span>
                  <span className="block truncate text-xs text-slate-400">
                    {a.id} · {a.category} · {a.location?.name ?? 'Unassigned'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </Field>
  );
}
