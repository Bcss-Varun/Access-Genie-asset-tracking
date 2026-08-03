import type { ReactNode } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useDataset } from '@/api/dataset';
import { useTrackingWorkspace } from '@/api/tracking-workspace';
import { useLabelWorkspace } from '@/api/labels';
import { EmptyState, ErrorState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';

/**
 * Holds a route subtree until its data has arrived.
 *
 * The screens read their collections from module bindings (see lib/dataset.ts),
 * which is what lets a hundred ported screens stay unchanged — but it only works
 * if nothing renders before the first payload lands. That is this component's
 * whole job: one loading state and one error state for a whole area, instead of
 * a hundred screens each inventing their own.
 *
 * It is deliberately a *route* boundary rather than a top-level provider, so
 * each area pays only for the data it uses: someone who never opens the tracking
 * workspace never fetches it.
 */
function Gate({
  isPending,
  isError,
  error,
  retry,
  label,
  children,
}: {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  retry: () => void;
  label: string;
  children: ReactNode;
}) {
  if (isPending) {
    return (
      <div className="h-full flex items-center justify-center" aria-busy="true" aria-label={`Loading ${label}`}>
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <span className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-primary-500 animate-spin" />
          Loading {label}…
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="glass-panel rounded-xl w-full max-w-lg">
          <ErrorState
            title={`Could not load ${label}`}
            description={error?.message ?? 'The request failed. Check that the API is running and try again.'}
            onRetry={retry}
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** Gate for every screen that reads the reference dataset — nearly all of them. */
export function RequireDataset() {
  const { isPending, isError, error, refetch } = useDataset();

  return (
    <Gate
      isPending={isPending}
      isError={isError}
      error={error}
      retry={() => void refetch()}
      label="your workspace"
    >
      <Outlet />
    </Gate>
  );
}

/**
 * Gate for the tracking workspace, which has its own (larger, live) payload.
 *
 * This one also gates on the estate being *non-empty*, which the others do not
 * need to. Every tracking screen is built around a facility — the floor plan,
 * the zone list, the coverage map, the scope picker all start from one, and
 * several open on `TRACKED_FACILITIES[0]` because on a populated estate there
 * always is one. With nothing tracked yet that is `undefined`, and the screen
 * dies on the first property read rather than showing anything useful.
 *
 * Answering it once here is better than making eight call sites individually
 * survive an empty array: a facility-less tracking screen has nothing to draw
 * even if every read is made safe, so "there is nothing to track yet" is the
 * honest whole-area answer, and it points at the thing that fixes it.
 */
export function RequireTrackingWorkspace() {
  const { data, isPending, isError, error, refetch } = useTrackingWorkspace();

  return (
    <Gate
      isPending={isPending}
      isError={isError}
      error={error}
      retry={() => void refetch()}
      label="the tracking estate"
    >
      {data && data.facilities.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <div className="glass-panel rounded-xl w-full max-w-lg">
            <EmptyState
              icon="📡"
              title="No facilities are being tracked yet"
              description="Real-time tracking needs somewhere to track. Add a facility and its zones, then register the readers and tags that cover it — the live map, digital twin and geofences all build on that."
              action={
                <Link to="/admin/facilities">
                  <Button variant="primary">Set up a facility</Button>
                </Link>
              }
            />
          </div>
        </div>
      ) : (
        <Outlet />
      )}
    </Gate>
  );
}

/**
 * Gate for Label & Tag Printing — templates, printers and the job queue.
 *
 * Gated on emptiness for the same reason as the tracking workspace: the screen
 * forks a working spec off a default template and targets a default device, and
 * both of those are `collection[0]` when nothing has been configured. A label
 * run needs something to print and something to print it on, so neither being
 * present is a genuine precondition rather than an empty list to render.
 */
export function RequireLabelWorkspace() {
  const { data, isPending, isError, error, refetch } = useLabelWorkspace();
  const unconfigured = data && (data.templates.length === 0 || data.devices.length === 0);

  return (
    <Gate
      isPending={isPending}
      isError={isError}
      error={error}
      retry={() => void refetch()}
      label="label templates and printers"
    >
      {unconfigured ? (
        <div className="h-full flex items-center justify-center">
          <div className="glass-panel rounded-xl w-full max-w-lg">
            <EmptyState
              icon="🏷️"
              title="Label printing is not set up yet"
              description={
                data.templates.length === 0
                  ? 'A label template defines what gets printed — the size, the stock and which asset fields appear on it. Add one, and register a printer or encoder to run it on.'
                  : 'There are templates, but no printer or encoder is registered. Add a device that can produce them before queueing a run.'
              }
            />
          </div>
        </div>
      ) : (
        <Outlet />
      )}
    </Gate>
  );
}
