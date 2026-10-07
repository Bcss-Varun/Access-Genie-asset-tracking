import { useState } from 'react';
import { Link } from 'react-router-dom';
import { allNotifications } from '@/lib/dataset';
import type { Notification } from '@access-genie/shared';
import { PageHeader, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { cn, relTime } from '@/lib/utils';
import { notificationsApi } from '@/api/catalog';
import { useMutate } from '@/api/mutate';

export default function NotificationsPage() {
  const { run } = useMutate();
  const [category, setCategory] = useState<string>('All');
  /*
   * The inbox is the dataset's, read on every render, with the rows being
   * marked read right now laid over it.
   *
   * It was `useState(allNotifications)` — a copy taken at mount — and the
   * category chips were memoised with no dependencies at all. Anything that
   * arrived while the screen was open (a stage change made here, a rule's test
   * send) never appeared, and a new category never got a chip, until a remount.
   * The overlay keeps the instant feedback and lives only while the request is
   * in flight; after it, the refreshed dataset carries the truth.
   */
  const [markingRead, setMarkingRead] = useState<Set<string> | 'all'>(new Set());
  const items: Notification[] = allNotifications.map((n) =>
    !n.read && (markingRead === 'all' || markingRead.has(n.id)) ? { ...n, read: true } : n,
  );

  const categories = ['All', ...Array.from(new Set(items.map((n) => n.category)))];
  const unread = items.filter((n) => !n.read).length;
  const visible = category === 'All' ? items : items.filter((n) => n.category === category);

  function markRead(id: string) {
    // Already read — nothing to send.
    if (items.find((n) => n.id === id)?.read) return;
    setMarkingRead((prev) => (prev === 'all' ? prev : new Set(prev).add(id)));
    void run(notificationsApi.markRead(id), {
      describe: 'mark that notification read',
    }).finally(() =>
      setMarkingRead((prev) => {
        if (prev === 'all') return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      }),
    );
  }

  function markAllRead() {
    setMarkingRead('all');
    // One confirmation, and only once it is true — this used to toast "All
    // caught up" immediately as well, even when the request then failed.
    void run(notificationsApi.markAllRead(), {
      success: 'All caught up',
      successDetail: 'Every notification marked as read.',
      describe: 'mark them all read',
    }).finally(() => setMarkingRead(new Set()));
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Your personal inbox of alerts, insights and workflow updates."
        breadcrumb={[{ label: 'Workspace' }, { label: 'Notifications' }]}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/notifications/preferences">
              <Button variant="outline">Preferences</Button>
            </Link>
            <Button onClick={markAllRead} disabled={unread === 0}>Mark all read</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Unread" value={unread} sub="Awaiting your attention" tone="primary" accent />
        <KpiCard label="Total" value={items.length} sub="In your inbox" tone="slate" />
        <KpiCard label="Categories" value={categories.length - 1} sub="Distinct sources" tone="slate" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              category === c
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          variant="no-results"
          title="No notifications here"
          description="Nothing matches this category filter right now."
          action={<Button variant="outline" onClick={() => setCategory('All')}>Show all</Button>}
        />
      ) : (
        <div className="glass-panel rounded-xl divide-y divide-slate-100 overflow-hidden">
          {visible.map((n) => (
            <button
              key={n.id}
              onClick={() => markRead(n.id)}
              className={cn(
                'flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50/70',
                !n.read && 'bg-primary-50/40',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary-500" />}
                  <span className={cn('truncate', n.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900')}>
                    {n.title}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-slate-500">{n.body}</p>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
                  <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5">{n.category}</span>
                  <span>{relTime(n.at)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
