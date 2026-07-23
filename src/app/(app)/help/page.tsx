'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { helpArticles, helpCategories } from '@/lib/help-data';

export default function HelpCenterPage() {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return helpArticles;
    return helpArticles.filter(
      (a) => a.title.toLowerCase().includes(q) || a.excerpt.toLowerCase().includes(q) || a.category.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Help Center"
        subtitle="Guides, answers and how-tos for getting the most out of Access Genie."
        breadcrumb={[{ label: 'Help' }]}
        actions={<Link href="/support"><Button variant="primary">Contact support</Button></Link>}
      />

      {/* Search */}
      <div className="glass-panel rounded-xl p-6">
        <div className="relative max-w-xl mx-auto">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the knowledge base…"
            className="w-full rounded-full border border-slate-300 bg-white pl-11 pr-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Category cards */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">Browse by category</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {helpCategories.map((c) => (
            <div key={c.id} className="glass-panel rounded-xl p-5 flex items-start gap-3">
              <span className="text-2xl leading-none">{c.icon}</span>
              <div>
                <h3 className="font-heading font-semibold text-slate-800">{c.label}</h3>
                <p className="text-sm text-slate-500 mt-0.5">{c.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Article list */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-heading font-semibold text-slate-800">{query ? 'Search results' : 'Popular articles'}</h2>
          <span className="text-xs text-slate-400">{results.length} article{results.length === 1 ? '' : 's'}</span>
        </div>
        {results.length === 0 ? (
          <EmptyState
            variant="no-results"
            title="No articles match"
            description="Try different keywords, or contact support for a hand."
            action={<Link href="/support"><Button variant="outline" size="sm">Contact support</Button></Link>}
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {results.map((a) => (
              <Link key={a.slug} href={`/help/${a.slug}`} className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-slate-50 transition-colors group">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-800 group-hover:text-primary-600">{a.title}</span>
                    <Badge tone="slate">{a.category}</Badge>
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5 truncate">{a.excerpt}</p>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">{a.readMins} min read →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
