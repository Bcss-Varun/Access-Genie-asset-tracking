import { useCallback, useState } from 'react';
import { useRefreshDataset } from '@/api/dataset';
import { useRefreshTracking } from '@/api/tracking-workspace';
import { useToast } from '@/components/providers/ToastProvider';
import { ApiRequestError } from '@/api/client';

/**
 * The one way a screen writes.
 *
 * Every mutation in this app has the same three obligations, and getting any of
 * them wrong is invisible until someone reloads the page:
 *
 *   1. Send the change to the API.
 *   2. Re-read the dataset, so the other ten screens showing the same record
 *      agree with this one.
 *   3. Say something — a confirmation, or a reason it did not work.
 *
 * Doing that per call site is how a screen ends up updating local state, looking
 * correct, and forgetting everything on refresh. So it is written once here and
 * the screens call `run(...)`.
 *
 * Optimistic by design: the local update happens first and is rolled back by the
 * caller if the request fails. An operator acknowledging twenty alerts should not
 * wait for twenty round trips.
 */
export interface MutateOptions {
  /** Shown on success. Omit for actions that speak for themselves. */
  success?: string;
  successDetail?: string;
  /** Completes the sentence "Could not …" on failure. */
  describe: string;
  /** Undo the optimistic local change. */
  rollback?: () => void;
  /** Also re-read the tracking workspace — for writes that move an asset. */
  refreshTracking?: boolean;
}

export function useMutate() {
  const refreshDataset = useRefreshDataset();
  const refreshTracking = useRefreshTracking();
  const { toast } = useToast();
  const [pending, setPending] = useState(0);

  const run = useCallback(
    async <T,>(request: Promise<T>, options: MutateOptions): Promise<T | null> => {
      setPending((n) => n + 1);
      try {
        const result = await request;

        await refreshDataset();
        if (options.refreshTracking) await refreshTracking();

        if (options.success) {
          toast({ title: options.success, description: options.successDetail, tone: 'success' });
        }
        return result;
      } catch (err) {
        options.rollback?.();
        toast({
          title: `Could not ${options.describe}`,
          description: err instanceof ApiRequestError ? err.message : 'The request failed. Please try again.',
          tone: 'error',
        });
        return null;
      } finally {
        setPending((n) => n - 1);
      }
    },
    [refreshDataset, refreshTracking, toast],
  );

  return { run, isPending: pending > 0 };
}
