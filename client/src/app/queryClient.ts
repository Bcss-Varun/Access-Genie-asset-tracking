import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from '@/lib/api-client';

/**
 * One query client for the app.
 *
 * The retry policy is the interesting part: retrying a 4xx is pointless (the
 * request was wrong and will stay wrong) and actively harmful on a 401, which
 * the axios interceptor is already refreshing. Only server and network faults
 * are worth a second attempt.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false, // a write is never safe to replay blindly
    },
  },
});
