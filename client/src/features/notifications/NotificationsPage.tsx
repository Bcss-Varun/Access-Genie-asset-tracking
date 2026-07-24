import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { cn, relTime } from '@/lib/format';
import { notificationsApi } from './notifications-api';

export function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data, isPending, error, refetch } = useQuery({ queryKey: ['notifications'], queryFn: notificationsApi.list });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const markRead = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: invalidate });
  const markAll = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: invalidate });

  const unread = data?.filter((n) => !n.read).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : 'You are all caught up.'}
        actions={
          unread > 0 ? (
            <Button size="sm" variant="secondary" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <ErrorState title="Could not load notifications" description={error instanceof ApiRequestError ? error.message : undefined} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="glass-panel">
          <EmptyState icon="📬" title="No notifications" description="Alerts, work orders and AI findings land here." />
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {data.map((notification) => (
              <li
                key={notification.id}
                className={cn('px-4 py-3 flex items-start gap-3 transition-colors', notification.read ? 'opacity-60' : 'bg-primary-50/30')}
              >
                <span className={cn('mt-2 h-2 w-2 rounded-full shrink-0', notification.read ? 'bg-slate-200' : 'bg-primary-500')} />

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800">{notification.title}</span>
                    <Badge tone="slate">{notification.category}</Badge>
                  </span>
                  <span className="block text-[13px] text-slate-600 mt-0.5">{notification.body}</span>
                  <span className="block text-[11px] text-slate-400 mt-1">{relTime(notification.at)}</span>
                </span>

                {!notification.read && (
                  <Button variant="ghost" size="sm" disabled={markRead.isPending} onClick={() => markRead.mutate(notification.id)}>
                    Mark read
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
