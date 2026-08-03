import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/api/auth';
import { assetsApi } from '@/api/assets';
import { navForModules } from '@/lib/nav-config';
import { cn } from '@/lib/utils';

interface Result {
  kind: 'nav' | 'asset';
  label: string;
  sub: string;
  icon: string;
  to: string;
}

/**
 * ⌘K palette. Navigation matches locally (the nav tree is tiny and already in
 * memory); assets are searched server-side, debounced, because the registry is
 * not something the client should hold a copy of.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setDebounced('');
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data: assets } = useQuery({
    queryKey: ['assets', 'search', debounced],
    queryFn: () => assetsApi.list({ q: debounced, limit: 5 }),
    enabled: open && debounced.length >= 2 && session.modules.includes('assets'),
  });

  const results = useMemo<Result[]>(() => {
    const needle = debounced.toLowerCase();

    const nav: Result[] = navForModules(session.modules)
      .flatMap((section) => [
        { label: section.label, to: section.to, icon: section.icon, group: section.fullLabel ?? section.label },
        ...section.items.filter((i) => i.to !== section.to).map((i) => ({ ...i, icon: section.icon, group: section.label })),
      ])
      .filter((item) => !needle || item.label.toLowerCase().includes(needle) || item.group.toLowerCase().includes(needle))
      .slice(0, 6)
      .map((item) => ({ kind: 'nav' as const, label: item.label, sub: item.group, icon: item.icon, to: item.to }));

    const assetResults: Result[] = (assets?.items ?? []).map((asset) => ({
      kind: 'asset' as const,
      label: asset.name,
      sub: `${asset.id} · ${asset.category}${asset.trackingId ? ` · ${asset.trackingId}` : ''}`,
      icon: '📦',
      to: `/assets/${asset.id}`,
    }));

    return [...assetResults, ...nav];
  }, [debounced, assets, session.modules]);

  // Keep the highlighted row inside the (changing) result list.
  useEffect(() => setActiveIndex(0), [results.length]);

  if (!open) return null;

  function go(result: Result | undefined) {
    if (!result) return;
    navigate(result.to);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-slate-900/40 animate-[fadeInFast_0.15s_ease-out]" onClick={onClose} />

      <div className="relative w-full max-w-xl glass-panel overflow-hidden animate-[fadeIn_0.18s_ease-out]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <span aria-hidden className="text-slate-400">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                go(results[activeIndex]);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Search assets, tag IDs, pages…"
            className="flex-1 bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-400"
            aria-label="Search"
          />
        </div>

        <div className="max-h-80 overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">No matches for “{query}”.</p>
          ) : (
            results.map((result, index) => (
              <button
                key={`${result.kind}-${result.to}`}
                type="button"
                onClick={() => go(result)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  index === activeIndex ? 'bg-primary-50' : 'hover:bg-slate-50',
                )}
              >
                <span className="text-base shrink-0">{result.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800 truncate">{result.label}</span>
                  <span className="block text-[11px] text-slate-400 truncate">{result.sub}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
