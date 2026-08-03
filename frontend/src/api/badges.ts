import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/api/client';
import { useAuth } from '@/api/auth';
import type { BadgeCounts } from '@/lib/nav-config';
import { alertsApi } from '@/api/alerts';

/**
 * The live counts the sidebar pills show.
 *
 * Two small queries rather than reading the full dataset: the rail is on screen
 * on every route, including ones that never load the dataset, and a count is
 * the one thing worth keeping fresher than the data behind it.
 *
 * Each is gated on the module that owns it, so a role without the grant makes
 * no request at all rather than making one and being refused.
 */
export function useBadgeCounts(): BadgeCounts {
  const { can } = useAuth();

  const alerts = useQuery({
    queryKey: ['alerts', 'stats'],
    queryFn: alertsApi.stats,
    enabled: can('alerts') || can('compliance'),
    staleTime: 60_000,
  });

  const tracking = useQuery({
    queryKey: ['tracking', 'alert-count'],
    queryFn: () => apiGet<{ open: number }>('/tracking/alerts/count'),
    enabled: can('tracking'),
    staleTime: 60_000,
  });

  return {
    openAlerts: alerts.data?.open,
    openTrackingAlerts: tracking.data?.open,
  };
}
