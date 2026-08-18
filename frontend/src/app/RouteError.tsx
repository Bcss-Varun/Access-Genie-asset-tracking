import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { ErrorState } from '@/components/ui/primitives';
import { ApiRequestError } from '@/api/client';

/**
 * Last-resort boundary for a route that threw during render. Query errors are
 * handled inside each screen (which can retry in place); this catches the rest
 * so a mistake shows an explanation instead of a blank page.
 */
export function RouteError() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <ErrorState title={`${error.status} — ${error.statusText}`} description="That route could not be loaded." />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <ErrorState
        title="This screen hit an unexpected error"
        description={error instanceof Error ? error.message : 'Reload the page to try again.'}
        requestId={error instanceof ApiRequestError ? error.requestId : undefined}
        onRetry={() => window.location.reload()}
      />
    </div>
  );
}


/**
 * The same boundary, sized for a screen *inside* the shell.
 *
 * `RouteError` fills the viewport, which is right for a failure above the
 * chrome — a dead session, a router misconfiguration. It is wrong for one
 * screen throwing: that used to bubble to the outermost boundary and replace
 * the whole application, sidebar included, so a single broken page looked like
 * a broken product and left no way to navigate out of it.
 *
 * Mounted per page route (see `router.tsx`), so the failure is contained to the
 * outlet and every other route stays reachable.
 */
export function PageError() {
  const error = useRouteError();

  const description = isRouteErrorResponse(error)
    ? `${error.status} — ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Try again, or pick another screen from the menu.';

  return (
    <div className="glass-panel">
      <ErrorState
        title="This screen could not be displayed"
        description={description}
        requestId={error instanceof ApiRequestError ? error.requestId : undefined}
        // Re-running the route is enough for a transient failure and keeps the
        // session; a full reload would throw away every other warm query.
        onRetry={() => window.location.reload()}
      />
    </div>
  );
}
