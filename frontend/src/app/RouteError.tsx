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
