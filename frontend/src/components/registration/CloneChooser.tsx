import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/primitives';
import { assetsApi } from '@/api/assets';
import { categoryEmoji } from '@/lib/asset-categories';
import { cn } from '@/lib/utils';

/**
 * Choose the asset to copy.
 *
 * Searchable *and* scrollable, because both are real behaviours: someone
 * cloning the twelfth identical laptop knows its ID, and someone furnishing a
 * new floor is browsing for anything similar. The search runs server-side over
 * name, serial, tag, manufacturer and model, so a partial serial finds it.
 */
export function CloneChooser({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  // Debounced so typing a serial does not fire a request per character.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ['clone-candidates', debounced],
    queryFn: () => assetsApi.list({ q: debounced || undefined, limit: 50, sort: '-createdAt' }),
  });

  const assets = data?.items ?? [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="font-heading text-lg font-semibold text-slate-900">Which asset are you copying?</h2>
      <p className="mt-1 text-sm text-slate-500">
        Everything is copied except the fields that identify one physical unit — serial, asset tag, MAC, IMEI and tag ID.
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, ID, serial, manufacturer…"
        aria-label="Search assets to clone"
        className="mt-4 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
      />

      <div className="mt-4 max-h-[26rem] overflow-y-auto rounded-lg border border-slate-200">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading assets…</p>
        ) : assets.length === 0 ? (
          <div className="p-4">
            <EmptyState
              variant="no-results"
              title={debounced ? 'No asset matches that' : 'No assets to copy yet'}
              description={
                debounced
                  ? 'Try a different name, ID or serial.'
                  : 'Register one asset first, then cloning it becomes the quickest way to add the next.'
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {assets.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(a.id);
                    onPick(a.id);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary-50/50',
                    selected === a.id && 'bg-primary-50',
                  )}
                >
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-base"
                  >
                    {categoryEmoji(a.category)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{a.name}</span>
                    <span className="block truncate text-xs text-slate-400">
                      {a.id}
                      {a.serialNumber ? ` · SN ${a.serialNumber}` : ''}
                      {a.manufacturer ? ` · ${a.manufacturer}` : ''}
                      {a.location?.name ? ` · ${a.location.name}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-primary-600">Copy →</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
