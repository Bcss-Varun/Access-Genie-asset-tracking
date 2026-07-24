'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCommand } from '@/components/providers/CommandProvider';
import { allNavItems } from '@/lib/nav-config';
import { mockAssets } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

type Result =
  | { kind: 'nav'; label: string; sub: string; icon: string; href: string }
  | { kind: 'asset'; label: string; sub: string; icon: string; href: string }
  | { kind: 'ai'; label: string; sub: string; icon: string; answer: string };

// A few scripted natural-language demos (the real Copilot is doc 08).
const AI_ANSWERS: { q: string; answer: string }[] = [
  { q: 'critical assets not scanned in 7 days', answer: '1 asset matches: iPad Pro 12.9" (Field Ops) (AST-1006) — last ping 52h ago, last seen HQ Lobby. Recommend an RTLS recovery search.' },
  { q: 'what needs attention today', answer: '3 things: MacBook Pro 16" has an 85%-confidence battery-swelling prediction (14 days), the Field Ops iPad is missing, and the Aruba AP-515 access point is over-utilized at 96%.' },
  { q: 'total portfolio value', answer: 'Portfolio TCO is $245.2M across 14,205 assets; $42.1M depreciated. Compute leads at $89.4M.' },
];

export function CommandPalette() {
  const { open, setOpen } = useCommand();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // focus after the panel mounts
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const nav: Result[] = allNavItems
      .filter((i) => !q || i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q))
      .slice(0, 6)
      .map((i) => ({ kind: 'nav', label: i.label, sub: i.group, icon: i.icon, href: i.href }));

    const assets: Result[] = q
      ? mockAssets
          .filter((a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) || a.serialNumber.toLowerCase().includes(q))
          .slice(0, 5)
          .map((a) => ({ kind: 'asset', label: a.name, sub: `${a.id} · ${a.category}`, icon: '📦', href: `/assets/${a.id}` }))
      : [];

    const ai: Result[] = q.length > 3
      ? AI_ANSWERS.filter((a) => a.q.includes(q) || q.split(' ').some((w) => w.length > 3 && a.q.includes(w)))
          .slice(0, 2)
          .map((a) => ({ kind: 'ai', label: `Ask Copilot: “${query}”`, sub: 'Natural-language answer', icon: '🤖', answer: a.answer }))
      : [];

    return [...ai, ...assets, ...nav];
  }, [query]);

  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  useEffect(() => setAiAnswer(null), [query]);

  if (!open) return null;

  const choose = (r: Result) => {
    if (r.kind === 'ai') {
      setAiAnswer(r.answer);
      return;
    }
    setOpen(false);
    router.push(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); choose(results[active]); }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <span className="text-slate-400 text-lg">🤖</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search assets, navigate, or ask Copilot…"
            className="flex-1 bg-transparent py-4 text-sm outline-none placeholder:text-slate-400"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-results"
          />
          <kbd className="hidden sm:inline-flex rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">ESC</kbd>
        </div>

        {aiAnswer ? (
          <div className="p-4">
            <div className="rounded-xl bg-primary-50 border border-primary-100 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary-700 mb-2">✨ Copilot</div>
              <p className="text-sm text-slate-700 leading-relaxed">{aiAnswer}</p>
            </div>
            <button onClick={() => setAiAnswer(null)} className="mt-3 text-xs font-medium text-slate-500 hover:text-slate-800">← Back to results</button>
          </div>
        ) : (
          <ul id="cmd-results" className="max-h-80 overflow-y-auto p-2">
            {results.length === 0 && (
              <li className="px-3 py-8 text-center text-sm text-slate-400">No matches. Try “tracking”, an asset name, or “what needs attention today”.</li>
            )}
            {results.map((r, i) => (
              <li key={i}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(r)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                    i === active ? 'bg-slate-100' : 'hover:bg-slate-50',
                  )}
                >
                  <span className="text-base w-6 text-center">{r.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800 truncate">{r.label}</span>
                    <span className="block text-xs text-slate-400 truncate">{r.sub}</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-300 font-semibold">
                    {r.kind === 'ai' ? 'Copilot' : r.kind === 'asset' ? 'Asset' : 'Go'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
          <span>↑↓ to navigate · ↵ to select</span>
          <span>Access Genie Copilot</span>
        </div>
      </div>
    </div>
  );
}
