'use client';

import { use } from 'react';
import Link from 'next/link';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { articleBySlug, slugToTitle, articleBody, helpArticles } from '@/lib/help-data';

export default function HelpArticlePage({ params }: { params: Promise<{ article: string }> }) {
  const { article } = use(params);
  const { toast } = useToast();

  const found = articleBySlug(article);
  const title = found?.title ?? slugToTitle(article);
  const category = found?.category ?? 'Help';
  const readMins = found?.readMins ?? 3;
  const body = articleBody(title);

  const related = helpArticles.filter((a) => a.slug !== article).slice(0, 4);

  const vote = (helpful: boolean) =>
    toast({
      title: helpful ? 'Thanks for the feedback' : 'Sorry to hear that',
      description: helpful ? 'Glad this article helped.' : 'We’ll use your feedback to improve this guide.',
      tone: helpful ? 'success' : 'info',
    });

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={title}
        subtitle={`${category} · ${readMins} min read`}
        breadcrumb={[{ label: 'Help', href: '/help' }, { label: title }]}
        actions={<Link href="/help"><Button variant="outline">← All articles</Button></Link>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Article body */}
        <article className="glass-panel rounded-xl p-6 lg:col-span-2 space-y-4">
          <Badge tone="primary">{category}</Badge>
          <div className="space-y-4">
            {body.map((p, i) => (
              <p key={i} className="text-slate-600 leading-relaxed">{p}</p>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h4 className="font-heading font-semibold text-slate-800 mb-1">In this demo</h4>
            <p className="text-sm text-slate-500">All data is mocked in-session — actions surface a toast rather than persisting to a backend.</p>
          </div>

          {/* Was this helpful */}
          <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
            <span className="text-sm font-medium text-slate-600">Was this helpful?</span>
            <button onClick={() => vote(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors" aria-label="Helpful">👍 Yes</button>
            <button onClick={() => vote(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors" aria-label="Not helpful">👎 No</button>
          </div>
        </article>

        {/* Related links */}
        <aside className="space-y-6">
          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-heading font-semibold text-slate-800 mb-3">Related articles</h3>
            <ul className="space-y-2">
              {related.map((a) => (
                <li key={a.slug}>
                  <Link href={`/help/${a.slug}`} className="text-sm text-primary-600 hover:text-primary-700 hover:underline">{a.title}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="glass-panel rounded-xl p-5">
            <h3 className="font-heading font-semibold text-slate-800 mb-1">Still stuck?</h3>
            <p className="text-sm text-slate-500 mb-3">Our support team is one message away.</p>
            <Link href="/support"><Button variant="primary" size="sm" className="w-full">Contact support</Button></Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
